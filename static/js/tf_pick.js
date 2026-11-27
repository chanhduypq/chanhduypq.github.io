/* Câu Đúng/Sai: "nhấp vào ô màu vàng để chọn đúng / sai".
 *
 * Mỗi phát biểu a/b/c… có HAI ô (Đúng / Sai); trong ô là một radio ẩn. JS chỉ lo phần
 * NHÌN — cho cả ô bấm được, và tô vàng ô đang chọn — còn giá trị gửi lên vẫn là "đ"/"s"
 * của radio, nên định dạng lưu (submission_items.selected_label) và cách chấm không đổi.
 *
 * Ủy nhiệm sự kiện ở document vì các trang làm bài được nạp lại qua AJAX: script chỉ chạy
 * một lần mà nội dung DOM thay đổi liên tục, gắn listener trực tiếp lên từng ô sẽ mất khi
 * nạp lại.
 */
(function () {
  'use strict';

  /* Tô lại đúng một NHÓM radio (cùng `name`): ô nào đang checked thì thêm .picked.
     Dùng chung `name` để mỗi phát biểu độc lập với các phát biểu khác. */
  function syncGroup(input) {
    var group = document.getElementsByName(input.name) || [];
    for (var i = 0; i < group.length; i++) {
      var box = group[i].closest ? group[i].closest('.tf-box') : null;
      if (box) box.classList.toggle('picked', !!group[i].checked);
    }
  }

  function boxOf(target) {
    return target && target.closest ? target.closest('.tf-box') : null;
  }

  /* Nhấp vào BẤT KỲ đâu trong ô (kể cả chữ "Đúng"/"Sai") là chọn ô đó. `label` cũng tự
     chuyển tiếp cú nhấp cho radio, nhưng làm rõ ở đây để ô vẫn bấm được nếu HTML của đề
     chèn phần tử lạ đè lên và cắt luồng sự kiện mặc định. */
  function onClick(e) {
    var box = boxOf(e.target);
    if (!box) return;
    var input = box.querySelector('input[type=radio]');
    if (!input) return;
    input.checked = true;
    syncGroup(input);
  }

  function onChange(e) {
    var t = e.target;
    if (t && t.type === 'radio' && t.name && t.name.indexOf('tf_') === 0) {
      syncGroup(t);
    }
  }

  /* Đồng bộ trạng thái ban đầu (ô đã tick sẵn) — dùng cho lượt làm lại hoặc khi trang
     chèn lại nội dung bằng AJAX rồi gọi window.tfPickInit(). */
  function init(root) {
    var scope = root || document;
    var boxes = scope.querySelectorAll ? scope.querySelectorAll('.tf-box') : [];
    for (var i = 0; i < boxes.length; i++) {
      var input = boxes[i].querySelector('input[type=radio]');
      if (input) syncGroup(input);
    }
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
  window.tfPickInit = init;
})();
