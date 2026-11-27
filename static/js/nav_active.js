/* ==========================================================================
   nav_active.js — tô sáng mục menu của trang đang đứng, sau mỗi lượt AJAX

   Vì sao cần: khối đỉnh trang (.site-top: banner + navbar) nằm NGOÀI #page-body,
   nên khi AJAX đổi trang chỉ nội dung được thay còn menu giữ nguyên dấu "đang ở
   đây" của trang trước. Server đã ghi sẵn `data-nav-active` lúc vẽ; JS chỉ ghi lại
   giá trị đó theo URL hiện hành.

   Một nguồn sự thật: bảng "đường dẫn -> khóa menu" ở services/ui_service.NAV_PATHS,
   base/menu.html in ra trong <script id="nav-path-map">. CSS (common.css) tô màu
   theo thuộc tính, JS không tự thêm class nào lên nút.
  ========================================================================== */
(function (global) {
  'use strict';

  var CONTAINER = '.site-top';
  var MAP_ID = 'nav-path-map';

  function readMap() {
    var node = document.getElementById(MAP_ID);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent) || {};
    } catch (e) {
      return null;                        // bảng hỏng -> menu giữ nguyên, trang vẫn dùng được
    }
  }

  /* Cùng luật với nav_key_for(): khớp nguyên đường dẫn hoặc một đường dẫn CON,
     quy tắc dài nhất thắng (/exam/12 thuộc "/exam" chứ không thuộc "/exams"). */
  function keyFor(path, map) {
    var bestKey = '', bestLen = 0;
    Object.keys(map).forEach(function (key) {
      (map[key] || []).forEach(function (prefix) {
        var hit = path === prefix || path.indexOf(prefix + '/') === 0;
        if (hit && prefix.length > bestLen) { bestKey = key; bestLen = prefix.length; }
      });
    });
    return bestKey;
  }

  function pathname() {
    var p = global.location.pathname || '/';
    return p.length > 1 ? p.replace(/\/+$/, '') : p;   // "/history/" về "/history"
  }

  /* `atPath` chỉ dành cho kiểm tra (browser-check truyền đường dẫn giả để xem thử
     luật khớp + màu tô sáng mà không cần đổi URL thật); luồng thường để trống. */
  function mark(atPath) {
    var host = document.querySelector(CONTAINER);
    if (!host) return;
    var map = readMap();
    if (!map) return;
    var key = keyFor(atPath || pathname(), map);
    if (host.getAttribute('data-nav-active') !== key) host.setAttribute('data-nav-active', key);
    // Cho trình đọc màn hình: dấu "đang ở đây" phải đọc được, không chỉ nhìn thấy.
    var items = host.querySelectorAll('[data-nav]');
    for (var i = 0; i < items.length; i++) {
      var it = items[i], current = it.getAttribute('data-nav') === key && key !== '';
      if (current) it.setAttribute('aria-current', 'page');
      else if (it.hasAttribute('aria-current')) it.removeAttribute('aria-current');
    }
  }

  function start() {
    mark();
    // Không gắn thẳng mark: đối tượng sự kiện sẽ bị nhận làm `atPath`.
    document.addEventListener('ajax:swapped', function () { mark(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.NAV_ACTIVE = { mark: mark, keyFor: keyFor, readMap: readMap };
})(window);
