/* Trang /study: ô "Nhập tên bài học" lọc danh sách NGAY TRONG TRÌNH DUYỆT.

Toàn bộ bài học SGK của 12 lớp đã nằm trong HTML mà server trả về một lần, nên gõ chữ
không phát thêm request nào — mỗi lần giá trị ô đổi là ẩn/hiện thẻ bài học có sẵn. Vì
luật "khớp" sống ở đây chứ không ở server, việc bỏ dấu tiếng Việt cũng phải làm ở đây:
gõ "phuong trinh" vẫn phải tìm ra "Phương trình bậc nhất".

Bốn hành động, đúng như người dùng cần:
  * gõ      -> chỉ còn bài học khớp, lớp nào không còn bài khớp thì ẩn cả tiêu đề lớp;
  * chọn một gợi ý "Lớp 6 - Phân số" -> cuộn tới đúng bài đó và viền đậm nó lại;
  * Enter   -> đóng danh sách gợi ý autocomplete;
  * xoá trắng (tay xoá hoặc bấm nút ✕ đỏ trong ô) -> hiện lại toàn bộ 12 lớp.
*/
(function (global, doc) {
  'use strict';

  var OFF = 'study-off';     // khối đang bị lọc ẩn (bài học hoặc cả khối lớp)
  var HIT = 'study-hit';     // bài học mà ô gõ trỏ tới — vừa được cuộn đến

  /* Bỏ dấu tiếng Việt + chữ thường. Phải cho ra cùng một chữ với `_fold` trong
     services/study_service.py vì ô gợi ý ("Lớp 6 - Phân số") do Python sinh ra còn
     danh sách do JS so khớp: hai bản gấp lệch nhau là gợi ý chọn không ra bài. Nên ở
     đây cũng KHÔNG cắt khoảng trắng hai đầu — `_fold` không làm thế, ai cần thì tự
     trim ở chỗ dùng (xem `parseLabel`).
     `đ` thay tay trước: NFD không tách được U+0111 nên "đ" sẽ còn nguyên. */
  function fold(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /* Giá trị ô gõ -> {grade, name} đã gấp. "Lớp N - tên" là nhãn gợi ý nên tách lớp ra
     để chỉ so phần tên; gõ "lớp 6" suông thì xem cả lớp 6; còn lại là chữ tự do, so
     trên mọi lớp (grade 0 = không giới hạn). */
  function parseLabel(text) {
    var folded = fold(text).trim();
    var m = folded.match(/^lop\s*(\d{1,2})\s*[-–]\s*([\s\S]*)$/);
    if (m) {
      return { grade: Number(m[1]), name: fold(m[2]) };
    }
    var only = folded.match(/^lop\s*(\d{1,2})$/);
    return only ? { grade: Number(only[1]), name: '' } : { grade: 0, name: folded };
  }

  /* Danh mục bài học đọc một lần từ HTML: mỗi thẻ nhớ lớp của khối nó đứng trong và
     tên đã gấp, nên mỗi phím gõ chỉ duyệt mảng chứ không chạm DOM để đọc chữ. */
  function LessonIndex(root) {
    this.cards = [];
    this.sections = [];
    var self = this;
    Array.prototype.forEach.call(root.querySelectorAll('.study-grade'), function (section) {
      var grade = Number(section.getAttribute('data-grade'));
      self.sections.push({el: section, grade: grade});
      Array.prototype.forEach.call(section.querySelectorAll('.study-lesson'), function (card) {
        var name = card.querySelector('.sl-name');
        self.cards.push({el: card, grade: grade,
                         name: fold(name ? name.textContent : '')});
      });
    });
  }

  /* Ẩn/hiện theo chữ gõ, trả {total, exact}.

     Bài học khớp = (lớp không giới hạn hoặc đúng lớp của nhãn) VÀ (tên rỗng hoặc tên bài
     chứa tên đang gõ). `exact` là bài có tên gấp ĐÚNG BẰNG chữ gõ — người dùng vừa chọn
     một gợi ý, hoặc gõ nguyên tên một bài.

     Tiêu đề lớp ẩn theo hai cách khác nhau, vì hai tình huống khác nhau:
       * đang lọc CHỮ -> ẩn mọi lớp không còn bài khớp, kể cả lớp trống danh mục (một dòng
         "Lớp 4 · 0 bài học" chỉ là nhiễu khi người dùng đang tìm một cái tên);
       * chỉ gọi TÊN LỚP ("lớp 6") -> giữ đúng lớp được gọi, kể cả lớp trống, vì khối trống
         là chỗ nằm của nút "Liệt kê bài học bằng AI" của quản trị;
       * ô rỗng -> hiện hết. */
  LessonIndex.prototype.apply = function (value) {
    var want = parseLabel(value);
    var hits = {};
    var total = 0;
    var exact = null;
    this.cards.forEach(function (card) {
      var ok = (!want.grade || card.grade === want.grade) &&
               (!want.name || card.name.indexOf(want.name) >= 0);
      card.el.classList.toggle(OFF, !ok);
      if (!ok) { return; }
      total += 1;
      hits[card.grade] = (hits[card.grade] || 0) + 1;
      if (!exact && want.name && card.name === want.name) { exact = card; }
    });
    this.sections.forEach(function (section) {
      var off = false;
      if (want.name) { off = !hits[section.grade]; }
      else if (want.grade) { off = section.grade !== want.grade; }
      section.el.classList.toggle(OFF, off);
    });
    return {total: total, exact: exact};
  };

  function init(target) {
    var input = target.getElementById('study-lesson');
    var list = target.querySelector('.study-list');
    if (!input || !list) { return null; }   // trang khác, hoặc danh mục chưa render
    var index = new LessonIndex(list);
    var empty = target.getElementById('study-no-match');
    var emptyText = target.getElementById('study-no-match-text');
    var clear = target.getElementById('study-clear');
    var last = null;

    /* Nút ✕ chỉ có tác dụng khi ô còn chữ, nên nó hiện/ẩn theo đúng giá trị ô. */
    function syncClear() {
      if (clear) { clear.hidden = !input.value; }
    }

    function update() {
      if (last) { last.el.classList.remove(HIT); }
      var res = index.apply(input.value);
      if (empty) { empty.hidden = res.total > 0; }
      // Chữ người dùng gõ là CHỮ, không phải HTML: ghi qua textContent.
      if (emptyText) { emptyText.textContent = input.value.trim(); }
      syncClear();
      if (!res.exact) { return; }
      // Đã chọn một gợi ý thì đưa bài đó vào giữa vùng cuộn của trang.
      res.exact.el.classList.add(HIT);
      last = res.exact;
      if (res.exact.el.scrollIntoView) {
        res.exact.el.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    }

    // `input` bắn mỗi lần đổi giá trị (kể cả chọn gợi ý); `change` và `keyup` là hai
    // lối mà một số trình duyệt dùng khi điền ô từ danh sách gợi ý.
    ['input', 'change', 'keyup'].forEach(function (type) {
      input.addEventListener(type, update);
    });

    /* Enter: đóng danh sách gợi ý. Popup đó thuộc datalist, trình duyệt tự vẽ NGOÀI DOM
       của trang (không có phần tử nào để mà ẩn) nên cách duy nhất script làm được là lấy
       focus ra khỏi ô — mất focus là popup native đóng.
       Gắn ở `keyup` chứ không `keydown`: nếu người dùng đã mũi tên xuống một gợi ý thì
       chính keydown Enter là lúc trình duyệt CHẤP NHẬN gợi ý đó, chặn sớm sẽ mất luôn
       bước chọn bằng bàn phím (và giá trị ô vẫn được `update` lọc tiếp). */
    input.addEventListener('keyup', function (ev) {
      if (ev.key === 'Enter') { input.blur(); }
    });

    /* Bấm ✕: xoá chữ rồi chạy lại đúng bộ lọc của lúc gõ, không tải lại trang. Trả focus
       về ô để người dùng gõ tiếp được ngay — Enter ở trên vừa lấy focus đi mất. */
    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        update();
        input.focus();
      });
    }

    update();
    return {index: index, update: update, input: input, clear: clear};
  }

  /* Test (tests/test_study_feature.py) nạp file này bằng node với DOM giả rồi gọi hàm
     thuần qua `window.StudyFilter`; `doc` giả truyền vào tham số thứ hai. */
  global.StudyFilter = {fold: fold, parseLabel: parseLabel, LessonIndex: LessonIndex,
                        init: init};
  if (doc) { init(doc); }
})(typeof window !== 'undefined' ? window : this,
   typeof document !== 'undefined' ? document : null);
