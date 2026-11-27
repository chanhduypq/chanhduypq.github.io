/* Trang "Đang chấm bài": hỏi trạng thái cho tới khi có điểm rồi mở kết quả.

   Lúc bấm Nộp, server chỉ ghi bài làm thô rồi mồi một luồng chấm nền
   (`services/late_grading.py`) — điểm chưa tồn tại khi trang này vẽ ra. Không nói cho học sinh
   biết thì em tưởng hệ thống treo và bấm F5, nên trang này tự cập nhật: mỗi 3 giây hỏi
   `/grading_status/<id>` một lần, hết chờ thì nhảy sang `/history/detail/<id>`.

   Ba điều vòng hỏi phải chịu được:
   * trang có thể bị nạp lại (AJAX hoặc F5) nên mọi thứ lấy từ DOM, không giữ gì ở biến ngoài;
     bộ đếm cũ phải tắt khi khối đánh dấu không còn trên trang nữa;
   * một lượt chấm có thể chạy hàng phút và máy chỉ chấm lần lượt từng bài, nên ĐỢI LÂU không
     phải HỎNG — quá `STUCK_S` mới đổi sang lời "máy đang bận" và giảm nhịp hỏi;
   * `failed` là trạng thái thật (bài thô thiếu, đề đã xoá, máy không có model). Lúc đó đưa cho
     em đúng một nút "Thử chấm lại" — `/grading_retry` từ chối bài đang chấm hoặc đã có điểm. */
(function (doc) {
  'use strict';

  var POLL_S = 3;        // nhịp hỏi khi máy còn đang làm
  var SLOW_S = 15;       // nhịp hỏi khi đã đợi lâu hoặc bài hỏng
  var STUCK_S = 300;     // giây coi là đợi lâu: đổi lời nhắn, không đổi trạng thái bài

  function secs(ms) {
    return Math.max(0, Math.round(ms / 1000));
  }

  function secondText(el, n) {
    if (el) el.textContent = n + ' giây';
  }

  function show(el, on) {
    if (el) el.hidden = !on;
  }

  function run() {
    var marker = doc.querySelector('[data-grading-sid]');
    if (!marker) return;
    var statusUrl = marker.getAttribute('data-grading-status');
    var retryUrl = marker.getAttribute('data-grading-retry');
    var sid = marker.getAttribute('data-grading-sid');
    var wait = doc.getElementById('gw-seconds');
    var finished = doc.getElementById('gw-finished');
    var stuck = doc.getElementById('gw-stuck');
    var stuckText = doc.getElementById('gw-stuck-text');
    var spin = doc.querySelector('.gw-spin');
    var retry = doc.getElementById('gw-retry');
    if (!statusUrl) return;

    var t0 = Date.now();
    var timer = null;

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function alive() {
      /* Đúng lượt này còn trên trang mới đáng hỏi tiếp. AJAX đổi trang chỉ thay khối đánh dấu,
         nên nếu so mỗi sự tồn tại thì bộ đếm của lượt nộp TRƯỚC vẫn sống và có thể nhảy sang
         kết quả cũ ngay lần hỏi đầu tiên. */
      var m = doc.querySelector('[data-grading-sid]');
      return !!m && m.getAttribute('data-grading-sid') === sid;
    }

    function ask() {
      /* Khối đánh dấu bị trang khác thay đi rồi thì không còn gì để hỏi: AJAX đổi trang không
         gỡ được bộ hẹn của mảnh cũ nếu ta không tự nhận ra. */
      if (!alive()) { stop(); return; }
      fetch(statusUrl, {credentials: 'same-origin'})
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.ok) return;
          var n = secs(Date.now() - t0);
          secondText(wait, n);
          if (!d.waiting) {
            stop();
            secondText(wait, n);
            show(stuck, false);
            if (spin) spin.style.display = 'none';
            show(finished, true);
            setTimeout(function () {
              window.location.href = d.url || ('/history/detail/' + sid);
            }, 500);
            return;
          }
          if (d.state === 'grade_failed') {
            if (stuckText) stuckText.textContent = 'Bài của em chưa chấm được.';
            show(stuck, true);
            restart(SLOW_S);
            return;
          }
          if (n >= STUCK_S) {
            if (stuckText) {
              stuckText.textContent = 'Máy đang bận chấm bài của các bạn khác, em chờ thêm '
                + 'chút nữa hoặc mở Lịch sử xem sau.';
            }
            show(stuck, true);
            restart(SLOW_S);
          }
        })
        .catch(function () { /* một lượt hỏi hỏng không được tắt cả bộ đếm */ });
    }

    function restart(everyS) {
      stop();
      timer = setInterval(ask, everyS * 1000);
    }

    if (retry) {
      retry.addEventListener('click', function () {
        retry.disabled = true;
        retry.textContent = 'Đang gửi lại…';
        fetch(retryUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: 'submission_id=' + encodeURIComponent(sid) + '&format=json'
        }).then(function (r) { return r.json(); })
          .then(function () {
            retry.disabled = false;
            retry.textContent = 'Thử chấm lại';
            show(stuck, false);
            if (spin) spin.style.display = '';
            t0 = Date.now();
            ask();
            restart(POLL_S);
          })
          .catch(function () {
            retry.disabled = false;
            retry.textContent = 'Thử chấm lại';
          });
      });
    }

    timer = setInterval(ask, POLL_S * 1000);
    ask();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})(document);
