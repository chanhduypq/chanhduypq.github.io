/* Trang làm bài tập và phòng thi: hiển thị TỪNG CÂU MỘT, kèm nút "Câu trước"/"Câu sau".

   Vì sao giấu câu bằng CSS chứ không chia lại đề thành nhiều trang: một lượt làm bài là
   MỘT form — `/submit` đọc `qids` rồi từng field `q_`/`tf_`/`num_`/`blank_`/`essay_` của
   MỌI câu, `/exam/<id>/submit` cũng vậy (`exam_service.submit_attempt`). Nếu mỗi câu một
   trang thì phải đổi cả hai luồng nộp bài và mất luôn luật "còn N câu chưa làm". Ở đây
   mọi câu vẫn nằm trong DOM, pager chỉ đổi câu nào nhìn thấy, nên không gửi thiếu answer.

   Link trỏ tới từng câu giữ nguyên cách cũ: palette của phòng thi là
   `a.exam-dot[href="#q-..."]`, JS chỉ chặn nó ở PHA BẮT (capture) để chuyển câu thay vì
   cuộn — `exam.js` nghe ở pha nổi nên không chạy hai lần. Trang luyện tập chưa có lối nhảy
   nào, nên pager tự dựng hàng số trong thanh của nó; thiếu link vẫn làm bài được bằng hai
   nút trước/sau.

   ajax.js chèn lại <script> có src mỗi lần thay mảnh nội dung, nên đoạn này chạy nhiều lần
   trên cùng một trang: listener đặt ở `document` và chỉ bind MỘT lần (state trên `window`),
   còn vị trí câu hiện tại đặt ngay trên thanh pager — mảnh mới có thanh mới, tự về câu đầu. */
(function () {
  var CLASS = 'question-block';
  var BLOCK = '.' + CLASS;

  var state = window.__pagerState = window.__pagerState || {bound: false};

  function bars() {
    return [].slice.call(document.querySelectorAll('[data-pager]'));
  }

  function host(bar) {
    /* Khối câu nằm cùng <form> với thanh pager, nhưng thanh pager thì KHÔNG nhất thiết là
       con trực tiếp của form: ở phòng thi nó nằm trong .exam-bar gộp chung với tên đề, đồng
       hồ và nút nộp. Tìm theo form, thiếu form thì mới lùi về cha. */
    return (bar.closest && bar.closest('form')) || bar.parentElement || document;
  }

  function blocks(bar) {
    return [].slice.call(host(bar).querySelectorAll(BLOCK));
  }

  function index(bar, n) {
    var list = blocks(bar);
    if (!list.length) return 0;
    var v = parseInt(bar.getAttribute('data-pager-index'), 10);
    if (isNaN(v)) v = 0;
    if (typeof n !== 'number') return Math.max(0, Math.min(list.length - 1, v));
    bar.setAttribute('data-pager-index', String(Math.max(0, Math.min(list.length - 1, n))));
    return index(bar);
  }

  function piece(bar, sel) {
    return bar.querySelector('[data-pager-' + sel + ']');
  }

  function areaOf(bar) {
    return host(bar).querySelector('.scroll-area');
  }

  /* ---- Câu hiện tại phải thấy HẾT, không phải kéo lên kéo xuống ----
     Vùng đọc cao đúng bằng chỗ trống còn lại của màn hình, còn câu hỏi dài ngắn tuỳ
     nguồn: đo 40 câu trắc nghiệm thật ở bề ngang 1028px thì một câu cao 284–542px
     (trung vị 308px), trong khi cửa sổ 1366x768 chỉ chừa khoảng 350px. Nên câu đang
     hiện được CO LẠI bằng `zoom` cho vừa khít vùng đọc.

     `zoom` chứ không `transform: scale`: scale chỉ vẽ lại, khung layout vẫn cao bằng
     cỡ gốc nên vùng cuộn còn nguyên khoảng trống ảo và thanh cuộn hiện ra như chưa sửa
     gì. `zoom` co cả khung nên số đo thật thay đổi theo.

     Tìm tỉ lệ bằng nhị phân 5 bước vì quan hệ không tuyến tính: chữ nhỏ lại thì hàng
     dài trải ra ÍT dòng hơn, câu co nhanh hơn đúng tỉ lệ. Trần 1 — không bao giờ phóng
     to quá cỡ gốc. Sàn MIN_ZOOM: dưới mức đó chữ không còn đọc được, câu nào vẫn dài
     thì vùng đọc tự cuộn, thà cuộn một vùng nhỏ còn hơn mất chữ. */
  var MIN_ZOOM = 0.7;

  function zoomable() {
    return !!(window.CSS && CSS.supports && CSS.supports('zoom', '0.5'));
  }

  function shown(block) {
    return block.getBoundingClientRect().height;
  }

  function fitOne(block, area) {
    if (!block || !area) return;
    block.style.zoom = '';                       // tỉ lệ cũ của câu này không còn đúng
    var have = area.clientHeight;
    if (!zoomable() || !have || have < 200) return;   // chỗ quá hẹp: để nguyên cho cuộn
    if (shown(block) <= have) return;            // đã khít rồi
    block.style.zoom = String(MIN_ZOOM);
    if (shown(block) > have) return;             // tới sàn vẫn chưa đủ: giữ sàn, cuộn tiếp
    var lo = MIN_ZOOM, hi = 1;
    for (var k = 0; k < 5; k++) {                // `lo` luôn vừa, `hi` luôn chưa vừa
      var mid = (lo + hi) / 2;
      block.style.zoom = String(mid);
      if (shown(block) <= have) lo = mid; else hi = mid;
    }
    block.style.zoom = String(Math.floor(lo * 100) / 100);   // làm tròn xuống: vẫn vừa
    area.scrollTop = 0;
  }

  /* Trang thi đẩy hai nút Trước/Sau ra HAI MÉP tờ bài bằng `position:fixed` (rule
     `@media (min-width: 900px)` trong exam.css) và yêu cầu là chúng NGỒI ĐÚNG HÀNG với dòng
     "Câu N · Đại số · Phần … · 0,21 điểm". CSS không tự tính được: khung dính đỉnh (thanh
     phòng thi + ghi chú + palette) cao bao nhiêu đổi theo bề ngang cửa sổ, nên đo thẳng
     `.q-number` của câu đang hiện rồi đưa lên biến `--pager-mid`; câu nào chưa có dòng ấy
     thì về giữa vùng đọc.
     Toạ độ ghi theo TÀI LIỆU (trừ lại phần cửa sổ đang cuộn): nút `fixed` đứng yên khi
     cuộn, lấy nguyên `rect.top` thì chỉ cần cuộn xuống footer là nó nhảy lệch khỏi giữa.
     Có KHUNG CHẶN: 90px dưới là dải banner + menu dính đỉnh (`--fixed-top` = 74px) — dòng
     "Câu N" nằm sát mép trên nên không chặn thì nút chui mất dưới menu; 40px trên là trần để
     câu dài tới mức phải cuộn (`fitOne` chạm sàn zoom) vẫn còn đường đổi câu. */
  function anchor(block, area) {
    var de = document.documentElement;
    if (!de || !de.style || !de.style.setProperty) return;
    var src = (block && block.querySelector && block.querySelector('.q-number')) || area;
    if (!src || !src.getBoundingClientRect) return;
    var r = src.getBoundingClientRect();
    if (!r.height) return;   // chua bo cuc thi con so do khong phai chieu cao that
    var mid = r.top + (window.pageYOffset || 0) + r.height / 2;
    var tall = de.clientHeight || window.innerHeight || 0;
    if (tall) mid = Math.max(90, Math.min(tall - 40, mid));
    de.style.setProperty('--pager-mid', Math.round(mid) + 'px');
  }

  function fitCurrent(bar) {
    var list = blocks(bar), area = areaOf(bar);
    var current = list.length ? list[index(bar)] : null;
    fitOne(current, area);
    /* Đo SAU khi co câu: `zoom` thay doi chieu cao cua chinh dong "Câu N" nên do som thi
       hai nut lech mot nữa chieu cao dong ay. */
    anchor(current, area);
  }

  /* Ảnh, KaTeX và CKEditor dựng xong MUỘN hơn lượt vẽ đầu (chiều cao câu đổi sau đó),
     nên mỗi lần đổi câu phải đo lại vài lần nữa. hẹn giờ chung một chỗ để năm sự kiện
     cùng lúc chỉ gây một lần bố cục lại. */
  var timer = null;
  function refitSoon() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      bars().forEach(fitCurrent);
    }, 60);
  }

  /* Phần của đề thi (`Phần 1 — …`, `Phần 2 — …`): đầu đề một phần mà bên dưới không còn
     câu nào hiện thì phải ẩn cả khối, nếu không học sinh thấy ba cái đầu đề đứng kế nhau. */
  function hideEmptyParts(bar, current) {
    [].slice.call(host(bar).querySelectorAll('.exam-part')).forEach(function (part) {
      part.classList.toggle('q-hidden', !part.contains(current));
    });
  }

  /* Palette của phòng thi là `a.exam-dot` đứng NGOÀI <form> và do template dựng, không phải
     con của thanh pager — nên không nằm trong hàng `.q-pager-dot` ở trên. Học sinh nhìn dãy
     số phải biết mình đang ở câu nào, vì câu chỉ hiện một lúc một câu. Nối ô số với câu bằng
     `href="#q-<id>"` khớp `id` của khối: dùng href chứ không `data-qid` vì khối câu nào cũng
     có id (kể cả trang chưa đặt data-qid), và exam.js vẫn dùng `data-dot` cho màu "đã làm". */
  function markPalette(list, current) {
    var dots = [].slice.call(document.querySelectorAll('.exam-dot'));
    if (!dots.length) return;
    var href = current && current.getAttribute('id') ? '#' + current.getAttribute('id') : '';
    dots.forEach(function (dot) {
      dot.classList.toggle('current', !!href && dot.getAttribute('href') === href);
    });
  }

  function render(bar) {
    var list = blocks(bar);
    bar.hidden = list.length < 2;
    if (!list.length) return;
    var i = index(bar);
    list.forEach(function (b, n) { b.classList.toggle('q-hidden', n !== i); });
    hideEmptyParts(bar, list[i]);
    var prev = piece(bar, 'prev'), next = piece(bar, 'next'), count = piece(bar, 'count');
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === list.length - 1;
    if (count) count.textContent = 'Câu ' + (i + 1) + ' / ' + list.length;
    [].slice.call(bar.querySelectorAll('.q-pager-dot')).forEach(function (dot, n) {
      dot.classList.toggle('current', n === i);
    });
    markPalette(list, list[i]);
    /* CKEditor dựng thanh công cụ theo bề rộng của ô lúc nó được tạo, mà ô đang ẩn thì bề
       rộng bằng 0 — báo trình duyệt đo lại ngay sau khi câu hiện ra. */
    window.dispatchEvent(new Event('resize'));
    /* Cuộn vùng đọc về đầu khi đổi câu. Tìm theo form chứ không theo "em kế tiếp": phòng thi
       nhét thanh pager vào .exam-bar nên em kế tiếp của nó là đồng hồ, không phải vùng cuộn. */
    var region = host(bar).querySelector('.scroll-area');
    if (region) region.scrollTop = 0;
    /* Mức sàn của vùng câu hỏi lớn hơn chỗ trống thật trên cửa sổ thấp thì .scroll-area
       không tự cuộn nữa mà #page-body mới cuộn (hai trang làm bài giữ cột cao đúng một
       màn hình — xem rule `:has()` trong common.css). Đưa cột về đầu để câu mới hiện ra
       nguyên vẹn, không rơi đúng chỗ em đang đọc dở. */
    var page = document.getElementById('page-body');
    if (page && page.scrollTop) page.scrollTop = 0;
    /* Đo lại sau cùng: câu vừa hiện ra phải co cho vừa khít vùng đọc. */
    fitCurrent(bar);
  }

  function go(bar, n) {
    index(bar, n);
    render(bar);
  }

  function barOfBlock(block) {
    var found = null;
    bars().forEach(function (bar) {
      if (!found && blocks(bar).indexOf(block) >= 0) found = bar;
    });
    return found;
  }

  /* Palette của phòng thi đứng NGOÀI <form> nên phải tìm link trên cả trang, không tìm
     trong form — nếu không trang thi bị dựng thêm một hàng số trùng với palette. */
  function jumpLinksExist(bar) {
    var list = blocks(bar);
    return [].slice.call(document.querySelectorAll('a[href^="#q-"]')).some(function (a) {
      return list.indexOf(document.getElementById(a.getAttribute('href').slice(1))) >= 0;
    });
  }

  /* Hàng số 1..N chỉ dựng khi trang chưa có link nào trỏ tới một câu (trang luyện tập). */
  function jumpRow(bar, list) {
    if (bar.querySelector('[data-pager-jump]') || list.length < 2 || jumpLinksExist(bar)) {
      return;
    }
    var row = document.createElement('div');
    row.className = 'q-pager-jump';
    row.setAttribute('data-pager-jump', '1');
    list.forEach(function (_b, n) {
      var a = document.createElement('a');
      a.href = '#';
      a.className = 'q-pager-dot';
      a.textContent = String(n + 1);
      a.setAttribute('aria-label', 'Tới câu ' + (n + 1));
      row.appendChild(a);
    });
    bar.appendChild(row);
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;

    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      var nav = t.closest('[data-pager-prev], [data-pager-next]');
      if (nav) {
        // <button> nằm TRONG form: phải chặn mặc định, không thì bấm "Câu sau" nộp luôn bài.
        ev.preventDefault();
        var bar = nav.closest('[data-pager]');
        go(bar, index(bar) + (nav.hasAttribute('data-pager-next') ? 1 : -1));
        return;
      }

      var dot = t.closest('.q-pager-dot');
      if (dot) {
        ev.preventDefault();
        go(dot.closest('[data-pager]'), parseInt(dot.textContent, 10) - 1);
        return;
      }

      var link = t.closest('a[href^="#q-"]');
      if (!link) return;
      var block = document.getElementById(link.getAttribute('href').slice(1));
      if (!block || !block.classList.contains(CLASS)) return;
      var owner = barOfBlock(block);
      if (!owner) return;                 // trang không dùng pager: nhảy bằng cách cũ
      ev.preventDefault();
      ev.stopImmediatePropagation();       // exam.js nghe pha nổi, đừng cuộn thêm lần nữa
      go(owner, blocks(owner).indexOf(block));
    }, true);

    /* Phải đo lại tỉ lệ khi mọi thứ dựng XONG, mà dựng thì muộn hơn lượt vẽ đầu: ảnh tải
       xong (`load` nổi lên document ở pha bắt), CKEditor tạo xong (essay_editor.js báo
       bằng sự kiện resize), và cửa sổ đổi bề ngang/chiều cao. Ba lần trễ thêm vì KaTeX và
       bảng biến thiên cao hơn sau khi chữ kịp ngắt dòng — một phép đo sớm để lại câu dài
       hơn vùng đọc. */
    window.addEventListener('resize', refitSoon);
    window.addEventListener('load', refitSoon);
    document.addEventListener('load', refitSoon, true);
    setTimeout(refitSoon, 300);
    setTimeout(refitSoon, 1200);
  }

  function init() {
    bind();
    bars().forEach(function (bar) {
      jumpRow(bar, blocks(bar));
      render(bar);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
