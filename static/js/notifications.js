/* ==========================================================================
   notifications.js — chuông thông báo góc trên: badge, bảng tin, deep-link

   Luồng: một bài chấm xong thì `services/late_grading.py` ghi một dòng vào bảng
   `notifications` cho ĐÚNG người đã nộp (`services/notification_service.notify`).
   Bản desktop cộng thêm tin và lời trả lời từ hộp thư phát hành đã lưu cục bộ.

   Không có đẩy (push) — app chạy trong phòng máy, không có WebSocket — nên file này
   HỎI server mỗi 20 giây (`/notifications`, chỉ đọc) rồi vẽ badge.

   Vì sao mọi chữ nằm ở JS chứ không trong template: navbar nằm NGOÀI `#page-body` nên
   AJAX đổi trang không vẽ lại nó. Nội dung in sẵn từ server sẽ đứng nguyên ở lần nạp
   trang đầu; để JS làm chủ văn bản thì chuông luôn nói đúng số tin đang có.

   Đánh dấu đã đọc là POST `/notifications_read`, không phải GET, vì `services/ux_probe.py`
   mở lại mọi trang GET để đo — GET mà đóng tin thì một lượt đo âm thầm xóa sạch chuông.

   Bấm một tin: hàng đó là `<a href="/history?mo=...">` nên trình duyệt tự lo việc sang
   trang; JS này chỉ gập bảng, trừ badge và báo đã đọc.
  ========================================================================== */
(function (global) {
  'use strict';

  var FEED_URL = '/notifications';
  var READ_URL = '/notifications_read';
  var SHELL = '#notif-shell';
  var BELL = '#notif-bell';
  var ROW = '[data-notif]';
  // 20 s: đủ để chữ "đã chấm xong" hiện lên chuông gần như lúc admin bấm nút, mà một lớp
  // 40 máy không biến thành 40 cú SELECT mỗi giây.
  var EVERY_MS = 20000;
  var KIND_ICONS = { graded: '✓', grade_failed: '!', feature_update: 'CN',
                     new_bank: 'NH', feedback_reply: 'TR' };

  var bell, panel, list, badge, empty, markAll;
  var timer = null;
  var inflight = false;
  // Số tin chưa đọc lần server trả gần nhất — badge vẽ từ số này, không đếm số hàng đang
  // hiển thị (danh sách vẽ tối đa 20 tin, còn badge đếm hết).
  var unread = 0;

  function byId(id) { return document.getElementById(id); }

  function hasFetch() {
    return !!(global.AJAX && global.AJAX.supported && global.AJAX.supported());
  }

  /* ---------------- chữ hiển thị (hàm thuần, test được bằng node) ---------------- */

  /* "vừa xong" / "5 phút trước" / "3 giờ trước" / "4 ngày trước".
     `nowMs` truyền vào để test; thiếu thì dùng đồng hồ máy. Giờ server và giờ máy học
     sinh là một (app chạy cục bộ), nên một độ lệch nhỏ chỉ đẩy tin sang nhãn hàng xóm. */
  function agoLabel(iso, nowMs) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var min = Math.floor((now - then) / 60000);
    if (min < 1) return 'vừa xong';
    if (min < 60) return min + ' phút trước';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + ' giờ trước';
    var day = Math.floor(hour / 24);
    if (day < 30) return day + ' ngày trước';
    return Math.floor(day / 30) + ' tháng trước';
  }

  /* Trần của badge: số ba chữ số không nhét vừa ô tròn nhỏ nên từ `max` trở lên đều thành
     "max+" — Facebook cũng hiển thị đúng một dấu cộng như vậy. */
  function badgeText(count, max) {
    var n = parseInt(count, 10);
    if (!n || n < 1) return '';
    var cap = parseInt(max, 10) || 9;
    return n > cap ? cap + '+' : String(n);
  }

  /* Cùng luật với cổng kiểm sổ tay: link nội bộ phải bắt đầu bằng "/" và không phải "//"
     (hai gạch đầu = trình duyệt hiểu sang máy chủ khác). Tin do code ta ghi nên đây chỉ
     là dây an toàn cho những loại tin thêm sau này. */
  function safeHref(link) {
    var s = String(link || '');
    return s.charAt(0) === '/' && s.slice(0, 2) !== '//' ? s : '';
  }

  /* ---------------- vẽ ---------------- */

  function setBadge(count) {
    unread = parseInt(count, 10) || 0;
    if (!badge) return;
    var text = badgeText(unread, badge.getAttribute('data-max'));
    badge.textContent = text;
    badge.hidden = text === '';
    if (bell) {
      bell.setAttribute('aria-label',
        text === '' ? 'Thông báo' : 'Thông báo: ' + text + ' tin chưa đọc');
    }
  }

  function buildItem(item) {
    var href = safeHref(item.link);
    var row = document.createElement(href ? 'a' : 'div');
    row.className = 'notif-item' + (href ? ' notif-item-link' : ' notif-item-plain');
    if (href) {
      row.setAttribute('href', href);
    }
    if (href || item.release) {
      // `data-notif`: để onClick nhận ra hàng của chuông và biết id nào vừa được bấm.
      row.setAttribute('data-notif', String(item.id));
    }

    var icon = document.createElement('span');
    icon.className = 'notif-icon notif-icon-' + (KIND_ICONS[item.kind] ? item.kind : 'other');
    icon.textContent = KIND_ICONS[item.kind] || '•';
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);

    var box = document.createElement('span');
    box.className = 'notif-body';
    // `textContent` chứ không `innerHTML`: một hàng của bảng tin không được phép nhúng HTML.
    var title = document.createElement('span');
    title.className = 'notif-item-title';
    title.textContent = item.title || '';
    box.appendChild(title);
    if (item.body) {
      var body = document.createElement('span');
      body.className = 'notif-item-body';
      body.textContent = item.body;
      box.appendChild(body);
    }
    var when = document.createElement('span');
    when.className = 'notif-item-time';
    when.textContent = agoLabel(item.created_at);
    box.appendChild(when);
    row.appendChild(box);
    return row;
  }

  function drawFeed(items, count) {
    if (!list) return;
    var rows = items || [];
    list.textContent = '';
    rows.forEach(function (item) { list.appendChild(buildItem(item)); });
    if (empty) empty.hidden = rows.length > 0;
    if (markAll) markAll.hidden = rows.length === 0;
    setBadge(typeof count === 'number' ? count : rows.length);
  }

  /* ---------------- hỏi server ---------------- */

  function getJSON(url) {
    if (global.AJAX && global.AJAX.getJSON) return global.AJAX.getJSON(url);
    return global.fetch(url, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }

  function postJSON(url, data) {
    if (global.AJAX && global.AJAX.postJSON) return global.AJAX.postJSON(url, data);
    return global.fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    }).then(function (res) { return res.json(); });
  }

  function poll() {
    if (inflight || !bell) return Promise.resolve(null);
    inflight = true;
    return getJSON(FEED_URL).then(function (d) {
      inflight = false;
      if (!d || !d.ok) return null;
      // Bảng đang mở mới vẽ danh sách; đang đóng thì chỉ cần cái badge.
      if (isOpen()) drawFeed(d.items || [], d.unread);
      else setBadge(d.unread);
      return d;
    }, function () {
      inflight = false;                      // lỗi mạng: chuông im, trang vẫn chạy
      return null;
    });
  }

  function markRead(ids) {
    return postJSON(READ_URL, ids && ids.length ? { ids: ids } : {});
  }

  /* ---------------- mở/đóng bảng ---------------- */

  function isOpen() {
    return !!panel && !panel.hidden;
  }

  function open() {
    if (!panel) return;
    panel.hidden = false;
    if (bell) bell.setAttribute('aria-expanded', 'true');
    poll();                                  // mở là thấy số mới nhất, không chờ tới kỳ sau
  }

  function close() {
    if (!isOpen()) return;
    panel.hidden = true;
    if (bell) bell.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (isOpen()) close(); else open();
  }

  /* ---------------- nối sự kiện ---------------- */

  /* Một listener ở document cho cả bốn việc (bấm tin / "đọc hết" / chuông / nền).
     Không `preventDefault` khi bấm tin: hàng đó là `<a href>` thường nên trình duyệt tự
     lo việc sang trang (#857), ở đây chỉ gập bảng và trừ badge ngay để học sinh không
     thấy số cũ nháy lại. */
  function onClick(ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    var row = target.closest(ROW);
    if (row) {
      var id = row.getAttribute('data-notif');
      if (row.parentNode) row.parentNode.removeChild(row);
      if (markAll) markAll.hidden = !list.children.length;
      if (empty) empty.hidden = !!list.children.length;
      setBadge(unread - 1);
      close();
      markRead([id]);
      return;
    }
    if (markAll && (target === markAll || target.closest('#notif-mark-all'))) {
      markRead(null).then(function (d) {
        drawFeed([], (d && d.unread) || 0);
      });
      return;
    }
    if (target.closest(BELL)) {
      ev.preventDefault();                   // <button> không có hành vi gốc nào đáng giữ
      toggle();
      return;
    }
    if (isOpen() && !target.closest(SHELL)) close();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') close();
  }

  function start() {
    bell = byId('notif-bell');
    panel = byId('notif-panel');
    list = byId('notif-list');
    badge = byId('notif-badge');
    empty = byId('notif-empty');
    markAll = byId('notif-mark-all');
    if (!bell || !panel || !list) return;    // không có chuông trên trang -> im lặng
    if (!hasFetch()) return;                 // trình duyệt cũ: để hành vi gốc lo

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', function () {
      // Tab ẩn thì đồng hồ bị trình duyệt hoãn lại, nên lúc hiện phải hỏi ngay thay vì
      // chờ tới kỳ kế tiếp — biết đâu bài đã được chấm xong từ mấy phút trước.
      if (!document.hidden) poll();
    });

    poll();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (document.hidden) return;           // tab ẩn: hỏi cũng không ai thấy
      poll();
    }, EVERY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.NOTIFICATIONS = { agoLabel: agoLabel, badgeText: badgeText, safeHref: safeHref,
                           poll: poll, start: start };
})(window);
