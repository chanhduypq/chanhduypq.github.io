/* Feedback — panel "Góp ý" ở góc trái chân trang.
   Goi POST /feedback (JSON) va ve bong bóng như chat_assistant.js, nhưng không gọi
   model: lời góp ý chỉ được lưu, câu trả lời là lời xác nhận cố định của máy chủ.
   Bong bóng dung textContent nen chu nguoi dung go khong duoc biet dich thanh HTML.

   #900: panel mở với mọi người, kể cả khách chưa đăng nhập — một lời góp ý không mang theo
   danh tính nào nên chẳng có lý do gì bắt ai tạo tài khoản trước khi báo phần mềm hỏng. Trình
   tự "hỏi server rồi mở popup Đăng nhập" của #874 vì thế bỏ hẳn, cùng với bản nháp từng phải
   sống qua lượt tải trang sau khi đăng nhập. */
(function () {
  'use strict';

  if (window.Feedback) return;

  var MAX_CONTENT = 2000;   // khop MAX_CONTENT_CHARS cua services/feedback_service.py

  var busy = false;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // --- khung UI -------------------------------------------------------------
  var root = el('div');
  root.id = 'fb-root';

  var panel = el('div');
  panel.id = 'fb-panel';

  var head = el('div');
  head.id = 'fb-head';
  var headTitle = el('span', 'fb-title', 'Góp ý với chúng tôi');
  var clearBtn = el('button', 'fb-clear', 'Xoá');
  var closeBtn = el('button', 'fb-close btn-x', 'Đóng');
  clearBtn.type = 'button';
  closeBtn.type = 'button';
  head.appendChild(headTitle);
  head.appendChild(clearBtn);
  head.appendChild(closeBtn);

  var log = el('div');
  log.id = 'fb-log';

  var form = el('form');
  form.id = 'fb-form';
  var input = el('textarea');
  input.id = 'fb-input';
  input.maxLength = MAX_CONTENT;
  input.rows = 3;
  input.placeholder = 'Bạn thấy phần mềm có chỗ nào chưa ổn, hoặc nên thêm gì?';
  var sendBtn = el('button', 'fb-send', 'Gửi');
  sendBtn.type = 'submit';
  form.appendChild(input);
  form.appendChild(sendBtn);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(form);

  var toggle = el('button', 'fb-toggle', '💡 Góp ý');
  toggle.type = 'button';

  root.appendChild(panel);
  root.appendChild(toggle);
  /* Nút nằm TRONG dải chân trang, ô #fb-slot do base.html dành sẵn ở mép trái —
     panel mở phía trên nút nên vẫn phải neo vào cùng khối. */
  (document.getElementById('fb-slot') || document.body).appendChild(root);

  // --- hanh vi --------------------------------------------------------------
  function setOpen(open) {
    root.classList.toggle('open', open);
    if (open) {
      if (!log.childNodes.length) {
        note('Góp ý của bạn được lưu lại để người phát triển phần mềm đọc. '
          + 'Phần mềm không trả lời tự động.');
      }
      input.focus();
    }
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function bubble(role, text, kind) {
    var wrap = el('div', 'fb-msg ' + (role === 'user' ? 'me' : 'bot') + (kind ? ' ' + kind : ''));
    var box = el('div', 'fb-bubble');
    // textContent (không phải innerHTML): xuống dòng giữ nhờ white-space: pre-wrap trong CSS.
    box.textContent = text == null ? '' : String(text);
    wrap.appendChild(box);
    log.appendChild(wrap);
    scrollDown();
    return box;
  }

  function note(text) {
    var node = el('div', 'fb-tip', text);
    log.appendChild(node);
    scrollDown();
  }

  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    input.disabled = state;
    if (!state) input.focus();
  }

  function send() {
    var text = String(input.value || '').trim();
    if (!text || busy) return;
    if (text.length > MAX_CONTENT) text = text.slice(0, MAX_CONTENT);

    bubble('user', text);
    setBusy(true);
    fetch('/feedback', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ content: text })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (data) {
        return { status: r.status, data: data };
      });
    }).then(function (res) {
      setBusy(false);
      var data = res.data || {};
      if (res.status === 200 && data.ok) {
        input.value = '';
        bubble('bot', data.reply || 'Đã ghi nhận góp ý.');
        return;
      }
      bubble('bot', data.detail || 'Gửi không được, bạn thử lại sau ít phút.', 'fb-error');
    }).catch(function () {
      setBusy(false);
      bubble('bot', 'Không nối được tới máy chủ. Kiểm tra lại rồi gửi giúp mình.', 'fb-error');
    });
  }

  toggle.addEventListener('click', function () { setOpen(!root.classList.contains('open')); });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  clearBtn.addEventListener('click', function () {
    while (log.firstChild) log.removeChild(log.firstChild);
    input.value = '';
    setBusy(false);
    setOpen(true);
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    send();
  });

  window.Feedback = { open: function () { setOpen(true); }, close: function () { setOpen(false); } };
})();
