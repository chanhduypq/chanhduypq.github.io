/* ==========================================================================
   upgrade_banner.js — bật/tắt băng "đang nâng cấp" đầu trang theo trang đang xem (#872)

   Vì sao cần: dải băng nằm NGOÀI #page-body (base.html) để một lượt AJAX đổi trang không
   xoá mất nó — nhưng cũng vì đứng ngoài nên nó không tự đổi theo trang mới. Server đã vẽ
   đúng trạng thái cho lượt tải đầu tiên, JS chỉ ghi lại sau mỗi lượt AJAX; thiếu JS thì
   trang vẫn đúng lúc mở, chỉ là đổi trang bằng AJAX chưa cập nhật dải.

   Một nguồn sự thật, hai bảng đã có sẵn: danh sách khóa admin bật ở trang "Giao diện"
   (server in vào <script id="upgrade-keys">) và bảng "đường dẫn -> khóa menu" mà
   base/menu.html in cho nav_active.js. Dùng lại luôn hàm khớp của nó nên băng thông báo
   không thể nói khác dấu "đang ở đây" trên menu.
  ========================================================================== */
(function (global) {
  'use strict';

  var BANNER_ID = 'page-upgrade';
  var KEYS_ID = 'upgrade-keys';

  function readKeys() {
    var node = document.getElementById(KEYS_ID);
    if (!node) return [];
    try {
      var keys = JSON.parse(node.textContent);
      return Array.isArray(keys) ? keys : [];
    } catch (e) {
      return [];                 // bảng hỏng -> coi như không trang nào đang nâng cấp
    }
  }

  /* Cùng cách cắt dấu "/" thừa với nav_active.js: /history/ vẫn là trang "Lịch sử". */
  function pathname() {
    var p = global.location.pathname || '/';
    return p.length > 1 ? p.replace(/\/+$/, '') : p;
  }

  /* `atPath` chỉ dành cho kiểm tra — browser-check truyền đường dẫn giả để xem thử dải
     bật/tắt đúng chưa mà không cần đổi URL thật; luồng thường để trống. */
  function show(atPath) {
    var banner = document.getElementById(BANNER_ID);
    var nav = global.NAV_ACTIVE;
    if (!banner || !nav || !nav.keyFor) return;
    var map = nav.readMap();
    if (!map) return;
    var on = readKeys().indexOf(nav.keyFor(atPath || pathname(), map)) >= 0;
    if (banner.hidden === on) banner.hidden = !on;
  }

  function start() {
    // Không gắn thẳng show: đối tượng sự kiện sẽ bị nhận làm `atPath`.
    document.addEventListener('ajax:swapped', function () { show(); });
    show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.UPGRADE_BANNER = { show: show, readKeys: readKeys };
})(window);
