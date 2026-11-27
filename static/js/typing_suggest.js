/* Chữ mờ gợi ý lúc gõ bài tự luận (ghost text) — giao diện của POST /ai/suggest.

   Học sinh lớp 6 hay dừng giữa câu. Máy tính phần còn lại của câu trong vài mili giây
   (services/typing_hint.py, không gọi model), còn file này lo việc hiện chữ đó ngay sau
   con trỏ và gõ hộ khi học sinh đồng ý.

   Vì sao phải đi qua editor: CKEditor giữ <textarea> làm field của form nhưng chỉ ghi
   HTML trở lại value lúc destroy() và lúc nộp bài — nếu dán chữ gợi ý vào textarea thì
   bài bị mất. Nên mọi chỗ đọc/nối chữ đều đi qua instance editor đang sống.

   Gợi ý từ vựng THAY chữ đang gõ dở ("binh ph" -> "bình phương"), không nối thêm: server
   trả số ký tự cần xoá trước con trỏ (back), nên trước khi nhận phải kiểm tra con trỏ
   thực sự đang ở CUỐI từ — giữa từ mà xoá là cắt đôi chữ học sinh đã viết.

   Trang nạp qua AJAX nên mảnh nội dung được chèn nhiều lần: listener gắn một lần duy
   nhất trên document, state nằm trên window. */
(function () {
  var S = window.__typingSuggest = window.__typingSuggest || {
    qid: '',        // câu đang có gợi ý
    text: '',       // phần gợi ý (chữ nối thêm hoặc chữ thay cho back ký tự trước đó)
    back: 0,        // số ký tự trước con trỏ phải xoá khi nhận
    timer: 0,
    seq: 0,        // request mới nhất; response cũ không được ghi đè
    ctrl: null,     // AbortController của request đang chạy
    ghost: null
  };

  var DEBOUNCE_MS = 500;
  // Sau con trỏ còn chữ/số nghĩa là con trỏ nằm GIỮA từ, không phải cuối từ.
  var MID_WORD = /[\p{L}\p{N}]/u;

  function editors() { return window.__essayEditors || {}; }

  function rootOf(qid) {
    var ed = editors()[qid];
    try { return ed && ed.editing.view.getDomRoot(); } catch (e) { return null; }
  }

  /* Phần tử đang nhận phím thuộc câu nào? CKEditor thay textarea bằng khối .ck
     nên phải tra qua danh bạ editor, không suy ra từ tên field. */
  function qidFor(node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    if (!el || !el.closest) return '';
    var ta = el.matches && el.matches('textarea.essay-box') ? el : el.closest('textarea.essay-box');
    var root = el.closest('.ck-editor__editable');
    if (!ta && !root) return '';
    for (var qid in editors()) {
      var r = rootOf(qid);
      if (r && (r === root || r === ta)) return qid;
    }
    var m = ta && /^(?:essay|short)_(\d+)$/.exec(ta.name || '');
    return m ? m[1] : '';
  }

  function textareaOf(qid) {
    return document.querySelector('textarea[name="essay_' + qid + '"]')
      || document.querySelector('textarea[name="short_' + qid + '"]');
  }

  /* Chữ từ đầu đoạn hiện hành đến con trỏ — đúng phần học sinh vừa gõ của câu này,
     không phải cả bài (luật nối tiếp so theo một câu, luật đóng ngoặc đếm ngoặc mở). */
  function prefixOf(qid) {
    var ed = editors()[qid];
    if (ed) {
      try {
        var sel = ed.model.document.selection;
        var range = sel.getFirstRange();
        if (!range || !range.isCollapsed) return null;   // đang bôi đen: chưa cần gợi ý
        var pos = range.start;
        var walk = ed.model.createRange(ed.model.createPositionAt(pos.parent, 0), pos);
        var text = '';
        var it = walk.getItems();
        for (var step = it.next(); !step.done; step = it.next()) {
          if (typeof step.value.data === 'string') text += step.value.data;
        }
        return text;
      } catch (e) { /* rơi xuống textarea */ }
    }
    var ta = textareaOf(qid);
    if (!ta) return null;
    var value = String(ta.value || '');
    if (typeof ta.selectionStart !== 'number') return value;
    if (typeof ta.selectionEnd === 'number' && ta.selectionEnd !== ta.selectionStart) return null;
    return value.slice(0, ta.selectionStart);
  }

  /* Chữ đứng SAU con trỏ trong đoạn hiện hành — chỉ dùng để biết con trỏ có đang giữa
     từ hay không, vì luật từ vựng trên máy không nhìn thấy phần này. */
  function afterOf(qid) {
    var ed = editors()[qid];
    if (ed) {
      try {
        var pos = ed.model.document.selection.getFirstRange().start;
        var walk = ed.model.createRange(pos, ed.model.createPositionAt(pos.parent, 'end'));
        var text = '';
        var it = walk.getItems();
        for (var step = it.next(); !step.done; step = it.next()) {
          if (typeof step.value.data === 'string') { text += step.value.data; break; }
        }
        return text;
      } catch (e) { return ''; }
    }
    var ta = textareaOf(qid);
    if (!ta) return '';
    var v = String(ta.value || '');
    return typeof ta.selectionStart === 'number' ? v.slice(ta.selectionStart).slice(0, 1) : '';
  }

  function ghost() {
    if (!S.ghost) {
      var div = document.createElement('div');
      div.className = 'ts-ghost';
      div.style.display = 'none';
      document.body.appendChild(div);
      S.ghost = div;
    }
    return S.ghost;
  }

  function hide() {
    S.seq += 1;
    if (S.ctrl) { try { S.ctrl.abort(); } catch (e) { /* trình cũ không hỗ trợ */ } }
    S.ctrl = null;
    S.qid = '';
    S.text = '';
    S.back = 0;
    if (S.ghost) S.ghost.style.display = 'none';
  }

  /* Hiện ngay sau con trỏ. CKEditor không cho cài chữ lạ vào trong khối soạn thảo
     (engine sẽ xoá khi đồng bộ), nên ghost là lớp phủ ngoài, đặt theo vị trí caret. */
  function show(qid, text, back, editable) {
    var box = ghost();
    var rect = null;
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount) {
      try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) { rect = null; }
    }
    if (!rect || (!rect.left && !rect.top)) rect = editable.getBoundingClientRect();
    box.textContent = text + '   ·  Tab để nhận';
    box.style.display = 'block';
    box.style.left = (rect.left + window.pageXOffset + Math.max(rect.width, 0)) + 'px';
    box.style.top = (rect.top + window.pageYOffset - 2) + 'px';
    S.qid = qid;
    S.text = text;
    S.back = back;
  }

  function ask(qid, prefix) {
    if (S.ctrl) { try { S.ctrl.abort(); } catch (e) { /* trình cũ không hỗ trợ */ } }
    var seq = ++S.seq;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    S.ctrl = ctrl;
    fetch('/ai/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: Number(qid) || 0, prefix: prefix }),
      signal: ctrl && ctrl.signal
    }).then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (data) {
        if (seq !== S.seq) return;
        if (!data || !data.ok || !data.text) { hide(); return; }
        var editable = rootOf(qid) || textareaOf(qid);
        if (!editable || document.activeElement !== editable) { return; }
        var back = Math.min(Math.max(Number(data.back) || 0, 0), prefix.length);
        /* Lời gợi ý sẽ xoá back chữ trước con trỏ: chỉ an toàn khi ngay sau con trỏ là
           khoảng trắng/chấm câu, tức em đã gõ xong từ. */
        if (back && MID_WORD.test(afterOf(qid))) return;
        show(qid, data.text, back, editable);
      })
      .catch(function () { /* mất mạng hoặc request bị huỷ vì đã gõ tiếp: im lặng */ });
  }

  function schedule(qid) {
    hide();
    window.clearTimeout(S.timer);
    S.timer = window.setTimeout(function () {
      /* Phần đã gõ phải đọc LÚC này, không đọc ngay trong sự kiện input: listener gắn ở
         pha capturing nên CKEditor chưa kịp đưa phím vừa gõ vào model, đọc sớm là luôn
         thiếu một ký tự (phím đầu tiên còn đọc được chuỗi rỗng → gợi ý sai luật). */
      var prefix = prefixOf(qid);
      if (prefix == null) return;
      ask(qid, prefix);
    }, DEBOUNCE_MS);
  }

  /* Nhận gợi ý: xoá back chữ ngay trước con trỏ rồi chèn chữ mới, trong MỘT bước change
     để học sinh hoàn tác (Ctrl+Z) được cả lượt. back = 0 thì chỉ nối thêm như cũ.
     Chèn hỏng giữa chừng thì thôi, tuyệt đối không dán chữ mới lên sau chữ dở — bài sẽ
     thành "binh phphbình phương". */
  function insert(qid, text, back) {
    var ed = editors()[qid];
    if (ed) {
      try {
        ed.model.change(function (w) {
          var pos = ed.model.document.selection.getFirstPosition();
          var at = back > 0 ? pos.getShiftedBy(-back) : pos;
          if (back > 0) { w.remove(ed.model.createRange(at, pos)); }
          w.insertText(text, at);
          try {
            w.setSelection(ed.model.createPositionAt(at.parent, at.offset + text.length));
          } catch (e) { /* bản CKEditor cũ không có setSelection: chữ đã chèn là đủ */ }
        });
        return true;
      } catch (e) {
        if (back > 0) return false;
        try { ed.execute('input', { text: text }); return true; } catch (e2) { return false; }
      }
    }
    var ta = textareaOf(qid);
    if (!ta) return false;
    var v = String(ta.value || '');
    var caret = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    var from = Math.max(0, caret - back);
    ta.value = v.slice(0, from) + text + v.slice(caret);
    ta.selectionStart = ta.selectionEnd = from + text.length;
    return true;
  }

  function onInput(e) {
    var qid = qidFor(e.target);
    if (qid) schedule(qid);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { if (S.text) hide(); return; }
    if (e.key !== 'Tab' || !S.text) return;
    if (qidFor(e.target) !== S.qid) return;
    e.preventDefault();
    e.stopPropagation();
    var qid = S.qid, text = S.text, back = S.back;
    hide();
    insert(qid, text, back);
  }

  if (!S.bound) {
    S.bound = true;
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('blur', function (e) { if (qidFor(e.target)) hide(); }, true);
  }
})();
