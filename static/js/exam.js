/* Đồng hồ phòng thi + palette + tự nộp khi hết giờ.

   Ba việc chỉ có thể làm ở trình duyệt, nhưng KHÔNG một việc nào trong đó được quyết
   định kết quả: thời gian thật nằm ở `exam_attempts.deadline_at` (server tính), còn đây
   chỉ là cách hiển thị nó. Vì thế tải lại trang giữa giờ không xin được thêm giờ.

   Phòng thi tải lại trang thật (#857) nên đoạn này chạy đúng một lần cho mỗi lượt tải;
   state vẫn treo trên window cho gọn. Đồng hồ luôn khởi động theo `data-remaining` của
   trang vừa tải — để hai đồng hồ cùng chạy là hai lần nộp bài. */
(function () {
  var WARN_S = 300;                 // 5 phút cuối: đổi màu để em biết mà chốt bài

  var state = window.__examState = window.__examState || {timer: null, confirmed: false};

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function clockText(sec) {
    return Math.floor(sec / 3600) + ':' + pad(Math.floor(sec % 3600 / 60)) + ':' + pad(sec % 60);
  }

  function form() { return document.getElementById('exam-form'); }

  /* ---------------- Đã làm hay chưa ---------------- */

  /* Một câu tính là "đã làm" khi có ÍT NHẤT một phương án được khoanh / một ô có chữ.
     Bài tự luận đọc qua window.essayText (static/js/essay_editor.js): CKEditor không ghi
     HTML trở lại textarea cho tới lúc form submit, nên đọc value thô thì câu đã viết vẫn
     bị đếm là bỏ trống. */
  function blockAnswered(block) {
    var i, list = block.querySelectorAll('input[type=radio]');
    for (i = 0; i < list.length; i++) {
      if (list[i].checked) return true;
    }
    list = block.querySelectorAll('input[type=text], textarea');
    for (i = 0; i < list.length; i++) {
      var text = window.essayText ? window.essayText(list[i]) : list[i].value;
      if (String(text || '').trim()) return true;
    }
    return false;
  }

  function blocks() {
    return [].slice.call(document.querySelectorAll('#exam-form .exam-q'));
  }

  function missing() {
    return blocks().filter(function (b) { return !blockAnswered(b); });
  }

  function refreshPalette() {
    blocks().forEach(function (b) {
      var dot = document.querySelector('[data-dot="' + b.dataset.qid + '"]');
      if (dot) dot.classList.toggle('done', blockAnswered(b));
    });
  }

  /* ---------------- Đồng hồ ---------------- */

  function stop() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  /* ---------------- Bảng "đang chấm" ---------------- */

  /* Một lượt nộp có thể chạy hàng phút: bài và điểm máy chấm được lưu trước, rồi model mới
     giải câu điền số và gợi ý tự luận (services/exam_service.submit_attempt). Không nói ra
     thì em ngồi nhìn màn hình đứng yên và bấm F5 vì tưởng hệ thống treo.

     Lượt nộp là một lượt tải trang thật (#857): trình duyệt giữ nguyên màn hình này cho tới
     khi kết quả về, nên bảng "đang chấm" đứng đó đúng lúc cần và biến mất cùng trang khi
     kết quả tới. Không còn vòng canh `ajax-busy` như hồi nộp bằng AJAX — lúc đó phải giấu
     bảng đi khi lượt AJAX chết giữa đường, còn bây giờ không có lượt AJAX nào để chết:
     hỏng thì trình duyệt tự báo lỗi. */
  function hideGrading() {
    if (state.grading) { clearInterval(state.grading.timer); state.grading = null; }
    var box = document.getElementById('exam-grading');
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  function showGrading() {
    hideGrading();
    var host = document.getElementById('page-body') || document.body;
    if (!host) return;
    var box = document.createElement('div');
    box.className = 'exam-grading';
    box.id = 'exam-grading';
    box.innerHTML = '<div class="exam-grading-card">' +
      '<div class="exam-grading-title">Đang chấm bài</div>' +
      '<div class="exam-grading-note">Bài của em đã gửi xong và được lưu; máy đang giải ' +
      'những câu cần tính thêm, vì thế có thể mất vài phút. Cứ đợi ở đây — trang này không ' +
      'làm mất bài của em.</div>' +
      '<div class="exam-grading-wait" id="exam-grading-wait">0 giây</div></div>';
    host.appendChild(box);
    var t0 = Date.now();
    state.grading = {timer: setInterval(function () {
      if (!document.getElementById('exam-grading')) { hideGrading(); return; }
      var wait = document.getElementById('exam-grading-wait');
      if (wait) wait.textContent = Math.round((Date.now() - t0) / 1000) + ' giây';
    }, 1000)};
  }

  /* Nộp lúc hết giờ: bỏ qua hẳn bước xác nhận "còn câu chưa làm" — hết giờ thì không còn
     quyền chọn, và để form tự submit bằng requestSubmit (POST thường, trình duyệt chờ
     trang kết quả). */
  function submitNow(auto) {
    var f = form();
    if (!f || f.dataset.examSubmitting) return;
    f.dataset.examSubmitting = '1';
    state.confirmed = true;
    // Nút đổi nhãn + tắt: lượt chấm tự luận có thể chạy hàng chục giây, và bấm thêm lần
    // nữa trong lúc đó chỉ tạo ra một lần nộp thứ hai (server sẽ từ chối).
    var btn = document.getElementById('exam-submit');
    if (btn) { btn.disabled = true; btn.textContent = auto ? 'Hết giờ — đang nộp…' : 'Đang nộp…'; }
    if (auto) {
      var note = document.getElementById('exam-unanswered');
      if (note) { note.textContent = 'Hết giờ — bài tự nộp.'; note.style.display = 'block'; }
    }
    if (typeof f.requestSubmit === 'function') f.requestSubmit();
    else f.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
  }

  function tick(clock, value) {
    var left = parseInt(clock.dataset.remaining, 10) - Math.round((Date.now() - state.t0) / 1000);
    if (left < 0) left = 0;
    value.textContent = clockText(left);
    clock.classList.toggle('warn', left <= WARN_S);
    if (left === 0) { stop(); submitNow(true); }
  }

  function initClock() {
    var clock = document.getElementById('exam-clock');
    var value = document.getElementById('exam-clock-value');
    if (!clock || !value) return;
    stop();
    state.t0 = Date.now();
    clock.dataset.remaining = parseInt(clock.dataset.remaining, 10) || 0;
    window.__examRemaining = function () {
      return parseInt(clock.dataset.remaining, 10) - Math.round((Date.now() - state.t0) / 1000);
    };
    tick(clock, value);
    if (window.__examRemaining() > 0) {
      state.timer = setInterval(function () { tick(clock, value); }, 1000);
    }
  }

  /* ---------------- Nối vào trang ---------------- */

  /* Bấm "Nộp bài" là bật bảng "đang chấm" — nhưng chỉ khi lượt nộp THẬT SỰ gửi đi, tức là
     không còn câu bỏ trống hoặc em đã bấm xác nhận lần hai (lần đầu thì handler bên dưới
     chặn submit lại). Gắn vào FORM chứ không gắn vào document: form nhận sự kiện submit
     trước mọi handler ở document, nên không phụ thuộc thứ đoạn script nào nạp trước. */
  function wireGrading() {
    var f = form();
    if (!f) return;
    f.addEventListener('submit', function (ev) {
      if (ev.defaultPrevented) return;
      if (missing().length && !state.confirmed) return;
      showGrading();
    });
  }

  function init() {
    initClock();
    refreshPalette();
    wireGrading();
  }

  document.addEventListener('change', refreshPalette);
  document.addEventListener('input', refreshPalette);

  /* Palette: nhảy tới câu. Dùng scrollIntoView thay vì để neo #q-... mặc định vì menu trên
     cùng fixed — nhảy kiểu cũ dựng đầu câu ngay dưới menu, không thấy gì. */
  document.addEventListener('click', function (ev) {
    var dot = ev.target && ev.target.closest ? ev.target.closest('.exam-dot') : null;
    if (!dot) return;
    ev.preventDefault();
    var block = document.getElementById('q-' + dot.dataset.dot);
    if (!block) return;
    block.scrollIntoView({behavior: 'smooth', block: 'start'});
    var field = block.querySelector('input, textarea');
    if (field && field.type !== 'radio') field.focus();
  });

  /* Xác nhận khi còn câu bỏ trống: chặn submit ngay tại handler này trước khi trình duyệt
     kịp gửi POST, hiện dòng chữ trong form rồi mới cho đi ở lần bấm sau. */
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || f.id !== 'exam-form' || state.confirmed) return;
    var left = missing().length;
    if (!left) return;
    ev.preventDefault();
    ev.stopPropagation();
    var note = document.getElementById('exam-unanswered');
    if (note) {
      note.textContent = 'Em còn ' + left + ' câu chưa làm. Bấm "Nộp bài" lần nữa để nộp.';
      note.style.display = 'block';
    }
    state.confirmed = true;
  }, false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
