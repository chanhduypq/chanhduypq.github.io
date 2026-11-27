/* ChatAssistant — chatbox huong dan su dung ung dung (mien phi, can dang nhap).
   Goi /chat/answer_stream (SSE) va /chat/suggest; khong dung thu vien nao.
   Noi dung model tra ra duoc escape truoc khi render, chi mo link noi bo "/...". */
(function () {
  'use strict';

  if (window.ChatAssistant) return;

  var MAX_QUESTION = 600;   // khop MAX_QUESTION_CHARS cua services/help_service.py
  var MAX_TURNS = 6;        // khop MAX_HISTORY_MESSAGES

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Markdown toi gian cho cau tra loi: link noi bo, **dam**, `code`, danh dau dong. */
  function rich(text) {
    var html = esc(text);
    html = html.replace(/\[([^\]]{1,60})\]\((\/[^)\s]{1,140})\)/g, function (m, label, path) {
      if (path.indexOf('//') === 0) return m;           // protocol-relative -> bo
      return '<a href="' + path + '">' + label + '</a>';
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    var out = '';
    var inList = false;
    html.split('\n').forEach(function (line) {
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out += '<ul>'; inList = true; }
        out += '<li>' + line.replace(/^\s*[-*]\s+/, '') + '</li>';
        return;
      }
      if (inList) { out += '</ul>'; inList = false; }
      if (line.trim()) out += '<div>' + line + '</div>';
    });
    if (inList) out += '</ul>';
    return out;
  }

  var turns = [];           // lich su day cho model, chi dung cho luot ke tiep
  var busy = false;
  var source = null;
  var suggestionsLoaded = false;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // --- khung UI -------------------------------------------------------------
  var root = el('div');
  root.id = 'ca-root';

  var panel = el('div');
  panel.id = 'ca-panel';

  var head = el('div');
  head.id = 'ca-head';
  var headTitle = el('span', 'ca-title', 'Trợ giúp sử dụng ứng dụng');
  var clearBtn = el('button', 'ca-clear', 'Xoá');
  var closeBtn = el('button', 'ca-close btn-x', 'Đóng');
  clearBtn.type = 'button';
  closeBtn.type = 'button';
  head.appendChild(headTitle);
  head.appendChild(clearBtn);
  head.appendChild(closeBtn);

  var log = el('div');
  log.id = 'ca-log';

  var chips = el('div');
  chips.id = 'ca-chips';

  var form = el('form');
  form.id = 'ca-form';
  var input = el('input');
  input.id = 'ca-input';
  input.type = 'text';
  input.maxLength = MAX_QUESTION;
  input.placeholder = 'Bạn muốn làm gì trong ứng dụng?';
  input.autocomplete = 'off';
  var sendBtn = el('button', 'ca-send', 'Gửi');
  sendBtn.type = 'submit';
  form.appendChild(input);
  form.appendChild(sendBtn);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(chips);
  panel.appendChild(form);

  var toggle = el('button', 'ca-toggle', '💬 Trợ giúp');
  toggle.type = 'button';

  root.appendChild(panel);
  root.appendChild(toggle);
  /* Nút "💬 Trợ giúp" là một phần của dải chân trang (chỗ trống bên phải,
     #ca-slot trong base.html), không nổi tự do trên nền trang nữa. Panel mở
     ngay phía trên nút nên vẫn phải nằm trong cùng khối. */
  (document.getElementById('ca-slot') || document.body).appendChild(root);

  // --- hanh vi --------------------------------------------------------------
  function setOpen(open) {
    root.classList.toggle('open', open);
    if (open) {
      loadSuggestions();
      input.focus();
    } else if (source) {
      source.close();
      source = null;
    }
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function bubble(role, text, kind) {
    var wrap = el('div', 'ca-msg ' + (role === 'user' ? 'me' : 'bot') + (kind ? ' ' + kind : ''));
    var box = el('div', 'ca-bubble');
    box.innerHTML = rich(text);
    wrap.appendChild(box);
    log.appendChild(wrap);
    scrollDown();
    return box;
  }

  function note(text) {
    var node = el('div', 'ca-note', text);
    log.appendChild(node);
    scrollDown();
    return node;
  }

  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    input.disabled = state;
    if (!state) input.focus();
  }

  function clearChips() {
    while (chips.firstChild) chips.removeChild(chips.firstChild);
  }

  function loadSuggestions() {
    if (suggestionsLoaded || log.childNodes.length > 0) return;
    suggestionsLoaded = true;
    note('Trợ lý chỉ trả lời câu hỏi về cách dùng ứng dụng, không giải bài tập.');
    fetch('/chat/suggest', { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) { suggestionsLoaded = false; return; }
        clearChips();
        (data.questions || []).forEach(function (q) {
          var chip = el('button', 'ca-chip', q);
          chip.type = 'button';
          chip.addEventListener('click', function () { ask(q); });
          chips.appendChild(chip);
        });
      })
      .catch(function () { suggestionsLoaded = false; });
  }

  function ask(question) {
    var text = String(question || '').trim();
    if (!text || busy) return;
    if (text.length > MAX_QUESTION) text = text.slice(0, MAX_QUESTION);

    clearChips();
    bubble('user', text);
    var history = turns.slice(-MAX_TURNS);
    turns.push({ role: 'user', content: text });

    setBusy(true);
    var box = bubble('bot', 'Đang tìm hướng dẫn…');
    var buffer = '';
    var params = new URLSearchParams({ q: text });
    if (history.length) params.set('h', JSON.stringify(history));

    if (source) source.close();
    source = new EventSource('/chat/answer_stream?' + params.toString());

    source.onmessage = function (event) {
      if (event.data === '[DONE]') {
        source.close();
        source = null;
        setBusy(false);
        if (buffer.trim()) turns.push({ role: 'assistant', content: buffer.trim() });
        return;
      }
      buffer += sseUnescape(event.data);
      box.innerHTML = rich(buffer);
      scrollDown();
    };

    source.addEventListener('meta', function (event) {
      var meta;
      try { meta = JSON.parse(event.data); } catch (e) { return; }
      var titles = (meta.sources || []).map(function (s) { return s.title; }).filter(Boolean);
      if (titles.length) note('Nguồn tham khảo: ' + titles.join(' · '));
    });

    source.onerror = function () {
      if (source) source.close();
      source = null;
      setBusy(false);
      box.className = 'ca-bubble';
      box.innerHTML = rich('Không gọi được trợ lý (máy chủ AI đang bận). '
        + 'Thử lại sau ít phút.');
      var wrap = box.parentNode;
      wrap.classList.add('ca-error');
    };
  }

  toggle.addEventListener('click', function () { setOpen(!root.classList.contains('open')); });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  clearBtn.addEventListener('click', function () {
    if (source) { source.close(); source = null; }
    turns = [];
    suggestionsLoaded = false;
    setBusy(false);
    while (log.firstChild) log.removeChild(log.firstChild);
    clearChips();
    loadSuggestions();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    ask(input.value);
    input.value = '';
  });

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey && event.altKey && (event.key === 'h' || event.key === 'H')) {
      event.preventDefault();
      setOpen(!root.classList.contains('open'));
    }
  });

  window.ChatAssistant = { open: function () { setOpen(true); }, close: function () { setOpen(false); } };
})();
