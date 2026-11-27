/* ==========================================================================
   admin_ux.js — bấm "Chấm" là chạy từng trang và in tiến trình từng trang một

   Vì sao phải gửi một request MỘT trang: model 8B chạy trên CPU, mỗi trang mất vài chục
   giây, 24 trang cộng lại là hàng chục phút. Nếu gom thành một request thì trang thứ ba
   lỗi sẽ cắt mất 21 trang sau, và người bấm không biết đã xong tới đâu. Ở đây mỗi trang
   một lần gọi stream: xong trang nào in dòng đó, trang nào hỏng thì dòng đó màu xám và
   loạt chạy vẫn đi tiếp.

   Ưu tiên "trang vẫn chạy khi JS hỏng":
     * không có fetch/ReadableStream/TextDecoder -> không chặn submit, trình duyệt gửi
       form thật và server tự in stream ra trang;
     * server trả JSON lỗi (không có quyền) -> hiện dòng lỗi, không giả vờ xong;
     * tick "đã làm" mà gửi thất bại -> bỏ tick trở lại, vì DB vẫn chưa lưu.
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

  function progressHost() {
    return document.getElementById('ux-progress');
  }

  function urlsOf(root) {
    var form = root && root.querySelector ? root.querySelector('[data-ux-run]') : null;
    if (!form) return null;
    return { run: form.getAttribute('data-ux-stream'), done: form.getAttribute('data-ux-done-url') };
  }

  function fmt(value) {
    return (value === null || typeof value === 'undefined') ? '—' : value;
  }

  /* Bốn trạng thái server trả về, dịch ra một dòng người bấm hiểu được ngay. */
  function showEvent(host, ev) {
    var head = (ev.label || ev.page || '?') + ': ';
    var n = ev.scores || 0;
    if (ev.status === 'ok') {
      line(host, head + 'điểm AI ' + fmt(ev.total) + '/10 · ' + n + ' tiêu chí');
    } else if (ev.status === 'tat_ai') {
      line(host, head + 'chỉ số đo của máy ' + fmt(ev.total) + '/10 · ' + n +
           ' tiêu chí (AI đang tắt)');
    } else if (ev.status === 'ai_loi') {
      line(host, head + 'AI lỗi, đã giữ ' + n + ' điểm của máy — ' + (ev.note || ''), 'ux-skip');
    } else {
      line(host, head + 'không chấm được — ' + (ev.note || 'không rõ lý do'), 'ux-skip');
    }
  }

  function handleBlock(host, block) {
    var payload = String(block || '').replace(/^data:\s*/, '').trim();
    if (!payload || payload === '[DONE]') return payload === '[DONE]';
    var ev;
    try { ev = JSON.parse(payload); } catch (err) { return false; }
    showEvent(host, ev);
    return false;
  }

  /* Một sự kiện SSE có thể bị cắt làm hai lần đọc nên phải đệm theo "\n\n". */
  function readStream(res, host) {
    var reader = res.body.getReader();
    var decoder = new global.TextDecoder('utf-8');
    var buffer = '';
    var done = false;

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          if (buffer.trim() && handleBlock(host, buffer)) done = true;
          return done;
        }
        buffer += decoder.decode(chunk.value, { streaming: true });
        var i;
        while ((i = buffer.indexOf('\n\n')) >= 0) {
          if (handleBlock(host, buffer.slice(0, i))) done = true;
          buffer = buffer.slice(i + 2);
        }
        return pump();
      });
    }
    return pump();
  }

  /* Chấm đúng MỘT trang, trả Promise<boolean>: stream có đóng đàng hoàng ([DONE]) không. */
  function runPage(urls, host, pageKey) {
    var fd = new global.FormData();
    fd.append('page', pageKey);
    return global.fetch(urls.run, {
      method: 'POST', body: fd, credentials: 'same-origin'
    }).then(function (res) {
      var type = (res.headers && res.headers.get('content-type')) || '';
      if (type.indexOf('application/json') >= 0) {
        return res.json().then(function (d) {
          line(host, 'Không chạy được: ' + ((d && d.error) || 'không rõ lý do'), 'ux-skip');
          return false;
        });
      }
      if (!res.ok) {
        line(host, pageKey + ': server trả lỗi HTTP ' + res.status, 'ux-skip');
        return false;
      }
      return readStream(res, host);
    }).catch(function () {
      line(host, pageKey + ': mất kết nối khi đang chấm', 'ux-skip');
      return false;
    });
  }

  /* Chạy lần lượt, không chạy song song: model chỉ phục vụ một lượt gọi trên CPU. */
  function runList(urls, host, btn, keys) {
    if (btn) btn.disabled = true;
    host.innerHTML = '';
    line(host, 'Đang chấm ' + keys.length + ' trang (mỗi trang mất tới vài chục giây)…');
    var chain = Promise.resolve();
    keys.forEach(function (key) {
      chain = chain.then(function () { return runPage(urls, host, key); });
    });
    chain.then(function () {
      line(host, 'Xong. Đang nạp lại số liệu…');
      reloadPage();
    }).then(null, function () {
      line(host, 'Dừng giữa chừng — tải lại trang để xem những trang đã lưu.', 'ux-skip');
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  }

  function reloadPage() {
    /* Để kịp đọc danh sách trang vừa chấm trước khi màn hình vẽ lại số liệu mới. */
    global.setTimeout(function () {
      var url = global.location.pathname + global.location.search;
      if (global.AJAX && global.AJAX.navigate) {
        global.AJAX.navigate(url, { history: 'replace', scroll: false });
      } else {
        global.location.reload();
      }
    }, 1200);
  }

  function chosenKeys(form) {
    var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="page"]:checked'));
    return boxes.map(function (b) { return b.value; });
  }

  function onSubmit(ev) {
    var form = ev.target && ev.target.matches ? ev.target.closest('form[data-ux-run]') : null;
    if (!form || ev.defaultPrevented) return;
    /* Không có khả năng đọc stream -> mặc form submit thật, server tự in tiến trình. */
    if (!canStream()) return;
    var urls = urlsOf(document);
    var host = progressHost();
    if (!urls || !host) return;
    ev.preventDefault();   /* nói cho ajax.js biết form này đã có chỗ khác lo */
    runList(urls, host, form.querySelector('#ux-run-btn'), chosenKeys(form));
  }

  function onClick(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-ux-run-one]') : null;
    if (!btn) return;
    /* Nút nằm trong <summary>: không chặn thì chi tiết đóng sập lại ngay khi bấm. */
    ev.preventDefault();
    ev.stopPropagation();
    var urls = urlsOf(document);
    var host = progressHost();
    if (!urls || !host) return;
    btn.disabled = true;
    var key = btn.getAttribute('data-ux-run-one');
    runPage(urls, host, key).then(function () {
      btn.disabled = false;
      reloadPage();
    });
  }

  function onTick(ev) {
    var box = ev.target && ev.target.closest ? ev.target.closest('[data-ux-done]') : null;
    if (!box || typeof box.checked !== 'boolean') return;
    var urls = urlsOf(document);
    if (!urls || !global.AJAX || !global.AJAX.postJSON) {
      box.checked = !box.checked;
      return;
    }
    box.disabled = true;
    global.AJAX.postJSON(urls.done, { score_id: box.getAttribute('data-ux-done'),
                                      done: box.checked ? 1 : 0 }).then(function (res) {
      if (!res || !res.ok) box.checked = !box.checked;
    }).then(null, function () {
      box.checked = !box.checked;
    }).then(function () {
      box.disabled = false;
    });
  }

  function boot() {
    if (global.__uxWired) return;
    global.__uxWired = true;
    /* capture: ajax.js nghe 'submit' ở bong bóng và bỏ qua sự kiện đã bị preventDefault,
       nên phần chặn ở đây phải chạy trước nó. */
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('click', onClick);
    document.addEventListener('change', onTick);
  }

  boot();
})(typeof window !== 'undefined' ? window : this);
