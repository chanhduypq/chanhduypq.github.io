/* ==========================================================================
   nav_activity.js — chèn các mục nav bị ẩn ("Lịch sử", "Năng lực") sau lượt nộp bài

   Vì sao còn cần: lượt nộp bài là một lượt tải trang thật nên navbar tự đúng; file này
   bù cho các thao tác vẫn chạy AJAX trên trang (form lọc, bài học SGK) — #page-body được
   thay còn navbar thì không, nên tài khoản vừa làm bài đầu tiên trong một phiên vẫn có
   thể thiếu menu cho tới lần tải trang kế tiếp.

   Server là nguồn quyết định: /nav_gated trả đúng mảnh HTML của từng mục nav
   (rỗng khi chưa đủ điều kiện), trình duyệt chỉ việc chèn. Không tự suy ra
   "đã làm bài chưa" ở phía client.
  ========================================================================== */
(function (global) {
  'use strict';

  var ENDPOINT = '/nav_gated';

  // Mốc chèn: lấy mốc gần nhất còn tồn tại trong danh sách, theo thứ tự ưu tiên
  // (menu có thể bị ẩn ở trang "Giao diện"); không còn mốc nào thì cuối navbar.
  // Key phải khớp item.key mà /nav_gated trả về.
  var ANCHORS = {
    history: ['home'],
    capability: ['latest_result', 'history', 'home']
  };

  function marker(key) { return '[data-nav="' + key + '"]'; }

  function nav() { return document.querySelector('.navbar-main'); }

  function has(key) { return !!document.querySelector(marker(key)); }

  function place(node, key) {
    var host = nav();
    if (!host || has(key)) return;
    var list = ANCHORS[key] || [];
    for (var i = 0; i < list.length; i++) {
      var anchor = host.querySelector(marker(list[i]));
      if (anchor) {
        // Mốc có thể nằm trong menu con (thí dụ "home" giờ ở trong "Làm bài tập");
        // chèn ngay sau khối cấp 1 chứa nó để mục mới vẫn ra ngang hàng trên navbar.
        var top = anchor;
        while (top.parentElement && top.parentElement !== host) { top = top.parentElement; }
        top.insertAdjacentElement('afterend', node);
        return;
      }
    }
    host.appendChild(node);
  }

  function insert(key, html) {
    var box = document.createElement('div');
    box.innerHTML = html;                       // nội dung do chính server render ra
    var node = box.querySelector(marker(key));
    if (node) place(node, key);
  }

  function refresh() {
    if (typeof global.fetch !== 'function') return;
    global.fetch(ENDPOINT, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.items) return;
        d.items.forEach(function (it) {
          if (it && it.html && !has(it.key)) insert(it.key, it.html);
        });
      })
      .catch(function () { /* không có dữ liệu thì giữ nguyên menu */ });
  }

  // Chưa chèn đủ mục nào thì mới hỏi server — lần nạp trang sau đã có sẵn rồi.
  function pending() {
    return Object.keys(ANCHORS).some(function (key) { return !has(key); });
  }

  function start() {
    document.addEventListener('ajax:swapped', function (ev) {
      var method = ((ev.detail || {}).method || 'GET').toUpperCase();
      if (method !== 'GET' && pending()) refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.NAV_ACTIVITY = { refresh: refresh, insert: insert, pending: pending };
})(window);
