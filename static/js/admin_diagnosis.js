/* ==========================================================================
   admin_diagnosis.js — nút "Tính lại" chạy nền và in tiến trình từng model

   Vì sao phải stream: một lần hiệu chuẩn đọc toàn bộ lịch sử rồi huấn luyện LSTM trên
   CPU, có thể mất tới một phút. Form submit thường (đồng bộ) thì trình duyệt chỉ hiện
   kết quả SAU khi xong, và bản cũ còn trả về một trang trần không menu. Ở đây mỗi model
   xong là in một dòng, người bấm thấy ngay mô hình nào đã chạy, mô hình nào bỏ qua vì
   thiếu dữ liệu.

   Ưu tiên "trang vẫn chạy khi JS hỏng":
     * trình duyệt không có fetch/ReadableStream/TextDecoder -> để form submit thật,
       server tính đồng bộ rồi chuyển hướng về lại trang;
     * thiếu mốc data-diagnosis-stream -> cũng submit thật;
     * server trả JSON lỗi (không có quyền, chẩn đoán đang tắt) -> hiện dòng lỗi,
       không giả vờ xong;
     * stream đứt giữa chừng -> giữ các dòng đã in và báo rõ là phải tải lại trang.
   ========================================================================== */
(function (global) {
  'use strict';

  function canStream() {
    return typeof global.fetch === 'function' &&
      typeof global.TextDecoder === 'function' &&
      typeof global.ReadableStream !== 'undefined' &&
      !!(global.Response && global.Response.prototype && global.Response.prototype.body);
  }

  function line(host, text, cls) {
    var li = document.createElement('li');
    if (cls) li.className = cls;
    li.textContent = text;
    host.appendChild(li);
    return li;
  }

  /* Nhãn ngắn "BKT"/"IRT"... — cắt ở dấu "—" đầu tiên, một nguồn tên với phía server. */
  function shortName(labels, name) {
    var full = labels[name] || name;
    return full.split(' — ')[0];
  }

  function showEvent(host, ev, labels) {
    var head = shortName(labels, ev.model) + ': ';
    if (!ev.ok) {
      line(host, head + 'bỏ qua — ' + (ev.note || 'không rõ lý do'), 'dx-skip');
      return;
    }
    line(host, head + (ev.note || 'đã chạy') + ' (' + (ev.rows || 0) + ' dòng)');
  }

  /* Một sự kiện SSE = các dòng "data: ..." tới hết dòng trống; ở đây chỉ có một dòng. */
  function handleBlock(host, block, labels) {
    var payload = String(block || '').replace(/^data:\s*/, '').trim();
    if (!payload) return false;
    if (payload === '[DONE]') return true;
    var ev;
    try { ev = JSON.parse(payload); } catch (err) { return false; }
    showEvent(host, ev, labels);
    return false;
  }

  /* Đọc stream: một sự kiện có thể bị cắt làm hai lần đọc nên phải đệm theo "\n\n". */
  function readStream(res, host, labels) {
    var reader = res.body.getReader();
    var decoder = new global.TextDecoder('utf-8');
    var buffer = '';
    var done = false;

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          if (buffer.trim() && handleBlock(host, buffer, labels)) done = true;
          return done;
        }
        buffer += decoder.decode(chunk.value, { streaming: true });
        var i;
        while ((i = buffer.indexOf('\n\n')) >= 0) {
          if (handleBlock(host, buffer.slice(0, i), labels)) done = true;
          buffer = buffer.slice(i + 2);
        }
        return pump();
      });
    }
    return pump();
  }

  function reloadPage(pageUrl) {
    /* Để kịp đọc danh sách model vừa chạy trước khi màn hình vẽ lại số liệu mới. */
    global.setTimeout(function () {
      global.AJAX.navigate(pageUrl, { history: 'replace', scroll: false });
    }, 1200);
  }

  function run(form, host, btn, streamUrl, pageUrl, labels) {
    btn.disabled = true;
    host.innerHTML = '';
    line(host, 'Đang hiệu chuẩn… (mỗi model xong sẽ in một dòng)');
    global.fetch(streamUrl, {
      method: 'POST',
      body: new global.FormData(form),
      credentials: 'same-origin'
    }).then(function (res) {
      var type = (res.headers && res.headers.get('content-type')) || '';
      if (type.indexOf('application/json') >= 0) {
        return res.json().then(function (d) {
          line(host, (d && d.error) || 'Không chạy được', 'dx-skip');
          return false;
        });
      }
      if (!res.ok) {
        line(host, 'Server trả lỗi HTTP ' + res.status, 'dx-skip');
        return false;
      }
      return readStream(res, host, labels);
    }).then(function (done) {
      if (done === false) return;
      line(host, done ? 'Tính xong. Đang nạp lại số liệu…'
                      : 'Dòng kết nối đứt giữa chừng — tải lại trang để xem số liệu mới.',
           done ? '' : 'dx-skip');
      if (done) reloadPage(pageUrl);
    }).catch(function () {
      line(host, 'Không kết nối được server — kiểm tra app đang chạy rồi thử lại.',
           'dx-skip');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function wire(ev) {
    var form = ev.target && ev.target.closest
      ? ev.target.closest('form[data-diagnosis-fit]') : null;
    if (!form || ev.defaultPrevented) return;
    var streamUrl = form.getAttribute('data-diagnosis-stream');
    var host = document.getElementById('dx-progress');
    var btn = form.querySelector('button[type=submit]');
    if (!streamUrl || !host || !btn || !canStream() || !global.AJAX) return;
    ev.preventDefault();
    var labels = {};
    try { labels = JSON.parse(host.getAttribute('data-labels') || '{}'); } catch (err) {}
    run(form, host, btn, streamUrl, form.getAttribute('action') || global.location.href,
        labels);
  }

  function autowire() {
    if (global.__dxFitWired) return;        /* mảnh AJAX có thể nạp lại file này */
    global.__dxFitWired = true;
    document.addEventListener('submit', wire);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autowire);
  } else {
    autowire();
  }
})(window);
