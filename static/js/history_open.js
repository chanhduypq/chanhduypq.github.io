/* Lịch sử: mở sẵn kết quả của một bài khi đến trang qua deep-link.

Nhấn vào chuông thông báo "bài xxx đã chấm" sẽ đưa học sinh tới `/history?mo=<id>`. Bài
đã chấm thì trong danh sách có đúng một nút "Xem kết quả" mang id đó (`a.btn-result`), và
hành động thật phải là chính nút ấy — tự gọi `Ajax.navigate('/history/detail/…')` từ đây
là tạo đường thứ hai, dễ lệch khỏi mọi thứ nút đó làm (giữ URL, cuộn lên đầu, chạy KaTeX).

Không có nút nào mang id đó là có lý: bài vẫn chờ chấm (hàng xóm của nó đang hiển thị
"Chờ chấm"), hoặc đang bật bộ lọc khiến nó không có trong danh sách. Cả hai
trường hợp chỉ cần đứng lại — danh sách tự nó đã nói hết. */
(function (doc) {
  'use strict';

  function run() {
    var marker = doc.getElementById('history-open');
    if (!marker) return;
    var id = marker.getAttribute('data-open');
    marker.remove();
    if (!id) return;
    var link = doc.querySelector('a.btn-result[data-open-id="' + id + '"]');
    if (!link) return;
    link.click();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})(document);
