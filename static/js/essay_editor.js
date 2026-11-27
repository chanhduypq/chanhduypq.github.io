/* Ô học sinh viết bài: lắp CKEditor vào từng câu của đề.

   Một lượt làm bài "Cả hai" có cả câu khoanh lẫn câu trình bày, nên bộ soạn thảo gắn
   theo TỪNG câu (textarea.essay-box), không theo cả đề. ajax.js tạo lại <script> có src
   mỗi lần chèn mảnh nội dung, tức là đoạn này chạy nhiều lần trên cùng một trang: state
   phải nằm trên window và trên chính textarea, nếu không editor bị gắn hai lần.

   Trường `short_<qid>` của phòng thi (câu trả lời ngắn) đi chung lối này: kết quả của nó
   thường là biểu thức có phân số/căn, nên ô nhập cũng cần bộ soạn thảo và bảng ký hiệu.
   Vì thế bộ luật ở đây khớp cả hai tên field, còn danh bạ editor vẫn tra theo qid — hai
   kiểu câu không bao giờ trùng qid trong cùng một đề.

   CKEditor giữ chính textarea đó làm field của form, nhưng bundle chỉ ghi HTML trở lại
   value lúc destroy() và lúc form.submit() (nó wrap native submit), nên code muốn
   đọc/ghi bài làm từ ngoài — chữ mờ gợi ý khi gõ, đồng hồ phòng thi — phải đi qua
   editor. Hai hàm
   window.essayText / window.essayWrite lo phần đó; khi chưa có editor chúng chỉ chạm
   textarea. Không tải được CKEditor (file thiếu) thì textarea thường vẫn dùng được:
   học sinh gõ nguyên văn, server tự phân biệt text với HTML. */
(function () {
  var EDITORS = window.__essayEditors = window.__essayEditors || {};   // qid -> editor

  // Tên field mà JS thật đặt cho hai loại ô: essay_<qid> (tự luận), short_<qid> (ngắn).
  var FIELD = /^(?:essay|short)_(\d+)$/;

  function qidOf(ta) {
    var m = FIELD.exec((ta && ta.name) || '');
    return m ? m[1] : '';
  }

  // CKEditor 5 đã bỏ Editor.get() nên chính danh bạ theo qid là chỗ tra editor của một ô.
  function editorFor(ta) { return EDITORS[qidOf(ta)] || null; }

  /* Nội dung học sinh đã viết, bỏ markup: đủ để biết "đã làm câu này chưa". */
  function toText(html) {
    return String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.essayText = function (ta) {
    var ed = editorFor(ta);
    if (!ed) { return String((ta && ta.value) || ''); }
    try {
      return toText(ed.getData());
    } catch (e) {
      return String(ta.value || '');
    }
  };

  window.essayWrite = function (ta, text) {
    var plain = String(text == null ? '' : text);
    var ed = editorFor(ta);
    if (!ed) { ta.value = plain; return; }
    // escape để dấu "<" học sinh đọc miệng không bị hiểu nhầm là tag
    ed.setData(plain.split(/\r?\n/).map(function (line) {
      return '<p>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>';
    }).join(''));
    ta.value = plain;   // kiểm tra "chưa làm" thấy ngay, trước lúc editor ghi lại HTML
  };

  /* ---- Công thức $...$ hiện đã render ngay trong ô soạn thảo ----

     Bảng "Gợi ý ∑" chèn công thức dưới dạng chữ LaTeX trong cặp $...$ (các khuôn hai
     tầng: tích phân, tổng xích ma, căn lồng, hệ phương trình...). CKEditor chỉ thấy đó
     là ký tự nên ô soạn thảo hiện nguyên mã nguồn — user báo "sau khi nhấn nút chèn,
     logic hiển thị vẫn giữ như trước". Hàm này dạy editor một kiểu phần tử model mới —
     mathTex — giữ mã LaTeX trong thuộc tính, rồi:
       • khi ghi dữ liệu (getData / nộp bài) trả lại ĐÚNG chuỗi $...$ như trước, để trang
         kết quả vẫn render bằng KaTeX (common.js renderPageKatex) như mọi công thức khác;
       • khi vẽ trong ô soạn thảo thì để KaTeX dựng công thức thành một <span> (raw
         element, học sinh không sửa được bằng bàn phím mà xoá cả cụm như một vật thể).

     KHÔNG nhét qua config.plugins lúc create(): bản bundle dựng sẵn coi `plugins` trong
     config là THAY cả danh sách plugin gốc (builtinPlugins), gắn vào đó là mất sạch thanh
     công cụ. Vì thế đây là bước tuỳ chọn chạy sau create(): lỗi ở đây chỉ làm mất phần
     render, ô soạn thảo vẫn nguyên vẹn như trước. */
  function installMathRender(editor) {
    var model = editor.model, conv = editor.conversion;
    if (!model || !conv) return false;

    // Một công thức là một VẬT THỂ inline: chứa mã LaTeX trong thuộc tính, không chứa chữ.
    model.schema.register('mathTex', {
      isObject: true, isInline: true, isLimit: true,
      allowWhere: '$text', allowAttributes: ['tex']
    });

    // Dữ liệu ghi ra (getData -> textarea -> server): vẫn là $...$ để trang kết quả render.
    conv.for('dataDowncast').add(function (d) {
      d.on('insert:mathTex', function (evt, data, api) {
        if (!api.consumable.consume(data.item, evt.name)) return;
        var tex = data.item.getAttribute('tex') || '';
        api.writer.insert(api.mapper.toViewPosition(data.range.start),
                          api.writer.createText('$' + tex + '$'));
      });
    });

    // Trong ô soạn thảo: KaTeX vẽ công thức vào một <span> nằm trong khối bao (khối bao
    // là phần được ánh xạ với model, còn ruột do CKEditor vẽ thô nên không sửa được).
    conv.for('editingDowncast').add(function (d) {
      d.on('insert:mathTex', function (evt, data, api) {
        if (!api.consumable.consume(data.item, evt.name)) return;
        var tex = data.item.getAttribute('tex') || '';
        var box = api.writer.createContainerElement('span', { class: 'math-tex' });
        var draw = api.writer.createRawElement('span', { class: 'math-tex-draw' },
          function (dom) {
            try {
              if (window.katex) {
                window.katex.render(tex, dom, { throwOnError: false, displayMode: false });
              } else {
                dom.textContent = '$' + tex + '$';
              }
            } catch (e) { dom.textContent = '$' + tex + '$'; }   // KaTeX hỏng: hiện mã thô
            return dom;
          });
        api.writer.insert(api.writer.createPositionAt(box, 0), draw);
        api.mapper.bindElements(data.item, box);
        api.writer.insert(api.mapper.toViewPosition(data.range.start), box);
      });
    });

    editor.__mathTexReady = true;
    return true;
  }

  /* Cắt chuỗi thành các mảnh chữ thường và các mảnh công thức $...$ (một dòng, khác rỗng). */
  var MATH_RE = /\$([^$\n]+?)\$/g;
  function splitMath(text) {
    var parts = [], last = 0, m;
    MATH_RE.lastIndex = 0;
    while ((m = MATH_RE.exec(text))) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index) });
      parts.push({ tex: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
  }

  /* Cửa để bảng "Gợi ý ∑" (math_suggest.js) chèn biểu thức vào bài: đoạn $...$ thành vật
     thể đã render, chữ còn lại vẫn là chữ. Trả về false khi ô soạn thảo chưa sẵn sàng
     hoặc chuỗi không có công thức nào, để đường chèn chữ thường làm tiếp. */
  window.essayInsertMath = function (editor, text) {
    if (!editor || !editor.model || !editor.__mathTexReady) return false;
    var parts = splitMath(String(text == null ? '' : text));
    var hasMath = false;
    for (var i = 0; i < parts.length; i++) if (parts[i].tex !== undefined) hasMath = true;
    if (!hasMath) return false;
    try {
      editor.model.change(function (w) {
        var pos = editor.model.document.selection.getFirstPosition();
        parts.forEach(function (p) {
          if (p.tex !== undefined) {
            w.insert(w.createElement('mathTex', { tex: p.tex }), pos);
            pos = pos.getShiftedBy(1);
          } else {
            w.insertText(p.text, pos);
            pos = pos.getShiftedBy(p.text.length);
          }
        });
        try { w.setSelection(editor.model.createPositionAt(pos.parent, pos.offset)); }
        catch (e) { /* bản CKEditor cũ không có setSelection: chữ đã chèn là đủ */ }
      });
      return true;
    } catch (e) {
      if (window.console) console.warn('Chèn công thức vào CKEditor thất bại:', e);
      return false;
    }   // schema chưa nhận: để đường chèn chữ thường lo
  };

  function mount(ta, qid) {
    ta.dataset.essayEditor = '1';   // đánh dấu đồng bộ để lượt chạy sau không gọi create lại
    var old = EDITORS[qid];
    if (old) {
      delete EDITORS[qid];
      try { old.destroy(); } catch (e) { /* textarea cũ đã bị mảnh AJAX gỡ khỏi trang */ }
    }
    window.ensureCKEditor().then(function () {
      return window.ClassicEditor.create(ta,
        { licenseKey: 'GPL', language: { ui: 'vi', content: 'vi' } });
    }).then(function (editor) {
      EDITORS[qid] = editor;
      // Công thức $...$ từ bảng "Gợi ý" phải hiện đã render ngay trong ô (xem đầu file).
      try { installMathRender(editor); }
      catch (e) { if (window.console) console.warn('Cong thuc trong o soan thao khong bat duoc:', e); }
      /* CKEditor chỉ ghi HTML trở lại textarea lúc destroy() và lúc form submit, nên
         `value` vẫn rỗng suốt lúc học sinh gõ. Trang thi đọc `value` để tô "đã làm" và đếm
         câu còn trống, nên mỗi lần editor đổi nội dung phải cập nhật textarea rồi báo sự
         kiện. Dùng 'change' chứ không 'input': typing_suggest.js nghe 'input' để hiện chữ
         mờ, mà ô này đã có editor riêng nên ghost text không còn chỗ đặt. */
      var syncTimer = 0;
      editor.model.document.on('change:data', function () {
        window.clearTimeout(syncTimer);
        // getData() trong chính model.change() làm CKEditor dừng rendering và hỏng lần chèn.
        syncTimer = window.setTimeout(function () {
          if (EDITORS[qid] !== editor) return;
          ta.value = window.essayText(ta);
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }, 0);
      });
      // Nút "Gợi ý" chỉ gắn được SAU khi editor đã dựng xong thanh công cụ của nó.
      if (window.mathSuggestMount) window.mathSuggestMount(editor, qid);
      // Nút mic "nhấn để nói" đứng cạnh nút gợi ý, cùng cần toolbar đã dựng xong.
      if (window.voiceMathMount) window.voiceMathMount(editor, qid);
      /* Ô tự luận dựng MUỘN hơn lượt vẽ đầu nên câu cao lên sau khi pager đã đo: báo một
         lần `resize` để question_pager.js đo lại và co câu cho vừa vùng đọc. */
      window.dispatchEvent(new Event('resize'));
    }).catch(function (err) {
      if (window.console) console.warn('CKEditor tu luan khong san sang:', err);
      // Bài vẫn làm được bằng textarea thường, nên ô chèn ký hiệu cũng phải có.
      if (window.mathSuggestMount) window.mathSuggestMount(ta, qid);
      if (window.voiceMathMount) window.voiceMathMount(ta, qid);
    });
  }

  function init() {
    [].slice.call(document.querySelectorAll('textarea.essay-box')).forEach(function (ta) {
      var m = FIELD.exec(ta.name || '');
      if (!m || ta.dataset.essayEditor) {
        return;
      }
      mount(ta, m[1]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
