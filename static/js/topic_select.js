/* Ô chọn nhiều bài học SGK dùng chung: trang chủ (static/index.js) và bộ lọc bài học SGK ở
   trang Quản lý câu hỏi (static/admin_questions.js). Giao diện giống nhau: select2
   (ô tìm + chọn nhiều), mỗi hàng có ô tick phía trước, kèm checkbox "Tất cả".

   Vì sao phải tự tô lại ô tick: select2 không vẽ lại hàng đang hiện khi ta chọn
   thêm (dropdown vẫn mở vì closeOnSelect = false), nên `paint` đọc lại <select> thật
   và tick cho khớp; lúc mở dropdown, templateResult lo phần vẽ ban đầu. */
(function (window, $) {
  'use strict';

  var NO_QUESTION_SUFFIX = ' (chưa có câu hỏi)';

  function label(it) {
    return it.name + (it.has_questions ? '' : NO_QUESTION_SUFFIX);
  }

  /* Một hàng kết quả: ô tick + tên bài học SGK. Trạng thái tick lấy từ `state.selected`
     (bài học SGK đang được chọn) mà select2 truyền vào mỗi lần vẽ. */
  function rowTemplate(state) {
    if (!state.id) { return state.text; }
    var wrap = document.createElement('span');
    wrap.className = 'topic-option';
    var box = document.createElement('span');
    box.className = 'topic-check' + (state.selected ? ' is-checked' : '');
    box.setAttribute('data-topic-id', String(state.id));
    var name = document.createElement('span');
    name.className = 'topic-name';
    name.textContent = state.text;
    wrap.appendChild(box);
    wrap.appendChild(name);
    return wrap;
  }

  /* Tô lại ô tick của các hàng đang hiện theo lựa chọn thật trong <select>. Chỉ hàng
     do rowTemplate tạo mới có .topic-check nên tìm cả trang là an toàn (dropdown của
     select2 nằm trong <body>, không nằm trong khối chứa <select>). */
  function paint($select) {
    var picked = {};
    $select.find('option:selected').each(function () { picked[String(this.value)] = true; });
    $('.select2-results__option .topic-check[data-topic-id]').each(function () {
      var tid = String(this.getAttribute('data-topic-id'));
      this.className = 'topic-check' + (picked[tid] ? ' is-checked' : '');
    });
  }

  /* Checkbox "Tất cả" phản ánh lựa chọn hiện tại: chọn hết -> tick, chọn một phần
     -> gạch ngang (indeterminate), chưa chọn gì -> bỏ tick. Không bài học SGK nào chọn
     được (cả lớp chưa có câu hỏi đã duyệt) thì khoá luôn ô này. */
  function sync($select, $all) {
    if ($all && $all.length) {
      var opts = $select.find('option:not(:disabled)');
      var picked = opts.filter(':selected').length;
      $all.prop('disabled', opts.length === 0);
      $all.prop('checked', opts.length > 0 && picked === opts.length);
      $all.prop('indeterminate', picked > 0 && picked < opts.length);
    }
    paint($select);
  }

  /* Nạp danh sách bài học SGK vào <select> rồi gắn select2. `selected` là các id cần tick
     sẵn (id không còn trong danh sách thì bỏ qua). `opts.disableWithoutQuestions`
     dùng ở trang chủ: bài học SGK chưa có câu hỏi đã duyệt vẫn thấy nhưng không chọn
     được — bộ lọc quản trị cần chọn được mọi bài học SGK nên không bật cờ này. */
  function mount(selectEl, allEl, items, selected, opts) {
    if (!selectEl) { return; }
    opts = opts || {};
    var $select = $(selectEl);
    var $all = allEl ? $(allEl) : $();
    if ($select.data('select2')) { $select.select2('destroy'); }
    $select.empty();
    (items || []).forEach(function (it) {
      var opt = new Option(label(it), String(it.id), false, false);
      if (opts.disableWithoutQuestions && !it.has_questions) { opt.disabled = true; }
      $select.append(opt);
    });
    $select.val((selected || []).map(String));
    $select.select2({
      language: 'vi',
      placeholder: opts.placeholder || 'Gõ để tìm bài học SGK',
      closeOnSelect: false,
      templateResult: rowTemplate
    });
    /* Đổi lớp là mount lại -> dùng namespace để không chồng handler của lượt trước. */
    $all.off('change.topicSelect').on('change.topicSelect', function () {
      var on = $all.prop('checked');
      $select.find('option:not(:disabled)').prop('selected', on);
      $select.trigger('change');
    });
    $select.off('change.topicSelect').on('change.topicSelect', function () { sync($select, $all); });
    sync($select, $all);
  }

  window.TopicSelect = { mount: mount, sync: sync, paint: paint };
})(window, window.jQuery);
