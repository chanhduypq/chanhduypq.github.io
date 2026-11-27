/* Trang chủ: chọn lớp -> nạp danh sách bài học SGK (select2) -> tự chia tỉ lệ, mở đề.

   Trang chủ BẮT BUỘC chọn một lớp cụ thể và BẮT BUỘC chọn ít nhất một bài học SGK, nên
   không còn tuỳ chọn "Tất cả các lớp" và không còn popup "Phân tỉ lệ câu hỏi theo
   bài học SGK và độ khó": hệ thống chia đều % theo số bài học SGK, mỗi bài học SGK Dễ 5% /
   Trung bình 90% / Khó 5%, và loại bài mặc định là "Cả hai" 70% trắc nghiệm +
   30% tự luận. */
$(function(){
  var MSG_GRADE = 'Hãy chọn lớp trước khi làm bài.';
  var MSG_TOPIC = 'Hãy chọn ít nhất một bài học SGK.';
  /* Tỉ lệ độ khó mặc định cho MỖI bài học SGK (cộng lại đúng 100). */
  var DIFF_DEFAULT = { de: 5, trung_binh: 90, kho: 5 };
  /* Loại bài "Cả hai" = 70% trắc nghiệm + 30% tự luận (mặc định của trang chủ). */
  var FORMAT_DEFAULT = { mc: 70, tl: 30 };

  var $grade = $('#grade-select');
  var $container = $('#topic-container');
  var $topic = $('#topic-select');
  var $topicAll = $('#topic-select-all');

  function selectedTopicIds(){
    return ($topic.val() || []).map(String);
  }

  /* Chia đều 100% cho số bài học SGK; phần dư (100 - base*count) chia nốt 1% mỗi bài học SGK
   * từ đầu danh sách, để bài học SGK nhiều hơn bài học SGK khác nhất là 1%. */
  function evenShare(index, count){
    var base = Math.floor(100 / count);
    return base + (index < 100 - base * count ? 1 : 0);
  }

  function ratioQuery(){
    var ids = selectedTopicIds();
    var qs = ['n=' + encodeURIComponent($('input[name=n]').val() || '10')];
    var g = ($grade.val() || '').trim();
    if (g) qs.push('grade=' + encodeURIComponent(g));
    var mode = $('input[name=mode]:checked').val();
    if (mode) qs.push('mode=' + encodeURIComponent(mode));
    if (mode === 'ca_hai') {
      qs.push('mc=' + FORMAT_DEFAULT.mc, 'tl=' + FORMAT_DEFAULT.tl);
    }
    ids.forEach(function(id, i){
      qs.push('topic=' + encodeURIComponent(id));
      qs.push('ratio=' + encodeURIComponent(evenShare(i, ids.length)));
      qs.push('de=' + DIFF_DEFAULT.de);
      qs.push('trung_binh=' + DIFF_DEFAULT.trung_binh);
      qs.push('kho=' + DIFF_DEFAULT.kho);
    });
    return qs.join('&');
  }

  /* Ô chọn bài học SGK (select2 + ô tick từng bài học SGK + checkbox "Tất cả") nằm trong
     static/js/topic_select.js để trang này và bộ lọc ở trang Quản lý câu hỏi dùng
     chung một cách hiển thị. Bài học SGK chưa có câu hỏi đã duyệt vẫn hiện nhưng không
     chọn được, nên mới cần cờ `disableWithoutQuestions`. */
  function fillTopicOptions(items){
    TopicSelect.mount($topic, $topicAll, items, [], {
      disableWithoutQuestions: true,
      placeholder: 'Gõ để tìm bài học SGK, chọn một hoặc nhiều bài học SGK'
    });
  }

  /* Khối nhận diện lớp (biểu tượng + hình nền) đã nằm sẵn 12 khối trong HTML do
     grade_themes sinh ra, tất cả ẩn; ở đây chỉ bật đúng một khối của lớp vừa chọn.
     Bật/tắt bằng thuộc tính `hidden` chứ không dựng nội dung bằng script — nếu script
     tự ghép chữ và ảnh thì markup trong JS là bản thứ hai của cùng một khối, sửa
     template là lệch. Không có khối nào (thiếu dòng trong DB hoặc thiếu file trên đĩa)
     thì vòng lặp chạy không, việc chọn lớp vẫn y như trước. */
  function showGradeTheme(grade){
    document.querySelectorAll('.grade-theme').forEach(function(card){
      card.hidden = card.dataset.grade !== String(grade || '');
    });
  }

  function loadTopicList(){
    var g = ($grade.val() || '').trim();
    showGradeTheme(g);
    // Danh sách bài học SGK chỉ có nghĩa khi đã chọn một lớp cụ thể.
    if (!g || isNaN(parseInt(g, 10))){
      fillTopicOptions([]);
      $container.hide();
      return;
    }
    fillTopicOptions([]);
    $container.show();
    fetch('/topics_by_grade?grade=' + encodeURIComponent(g))
      .then(function(r){ return r.json(); })
      .then(function(d){
        var items = (d && d.topics) || [];
        // Bài học SGK hiện theo đúng thứ tự id tăng dần; sắp lại ở đây để thứ tự hiển thị
        // không phụ thuộc vào nguồn dữ liệu khác.
        items.sort(function(a, b){
          return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
        });
        fillTopicOptions(items);
      })
      .catch(function(){
        if (window.AJAX && AJAX.message){
          AJAX.message('Không tải được danh sách bài học SGK. Hãy thử lại.', '#topic-container');
        }
      });
  }
  $grade.on('change', loadTopicList);
  loadTopicList();

  // Nhấn "Làm bài": kiểm tra bắt buộc rồi mở thẳng /practice_ratio (không popup).
  $('#practice form').on('submit', function(ev){
    ev.preventDefault();
    var g = ($grade.val() || '').trim();
    if (!g){ showNotice(MSG_GRADE); return; }
    if (!selectedTopicIds().length){ showNotice(MSG_TOPIC); return; }
    var url = '/practice_ratio?' + ratioQuery();
    if (window.AJAX){ AJAX.navigate(url); }
    else { location.href = url; }
  });
});

// Mode card selection (Trắc nghiệm / Tự luận / Cả hai)
$(function(){
  var modeCards = document.querySelectorAll('#mode-selector .mode-card');
  modeCards.forEach(function(card){
    card.addEventListener('click', function(){
      modeCards.forEach(function(c){
        c.classList.remove('selected');
      });
      card.classList.add('selected');
      var radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
});
