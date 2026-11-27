/* Nút mic "nhấn để nói" cho ô trả lời tự luận: học sinh nói bằng tiếng Việt, hệ
   thống đổi lời nói thành KÍ HIỆU TOÁN HỌC Unicode rồi chèn vào đúng chỗ con trỏ.

   Ví dụ chốt của user: nói "căn bậc hai của 5" phải ra dấu căn CÓ SỐ 5 NẰM BÊN
   TRONG — tức "√5̅" (dấu √ rồi số 5 được gạch ngang của dấu căn phủ lên trên),
   chứ không phải chuỗi "căn bậc hai của 5" hay LaTeX "$\sqrt{5}$".

   Vì sao Unicode chứ không phải LaTeX: bài tự luận hiển thị nguyên văn trên trang
   kết quả, chỉ có KaTeX mới dịch "$...$" — chèn LaTeX thì học sinh nhìn thấy mã nguồn.
   Bộ ký hiệu ở đây dùng CHUNG quy ước với nút "Gợi ý ∑" (static/js/math_suggest.js):
   nhân "×", chia ":", đơn vị tách rời số.

   Vì sao chèn qua editor: CKEditor giữ <textarea> làm field của form nhưng chỉ ghi
   HTML trở lại value lúc destroy()/nộp bài — dán thẳng vào textarea là mất bài. Lối
   chèn đã kiểm chứng nằm ở math_suggest.js (window.mathSuggestText), nên file này
   KHÔNG mở lại đường thứ hai mà gọi lại đúng lối đó.

   Trang nạp qua AJAX nên mảnh nội dung được tạo lại nhiều lần: state nằm trên window,
   nút thì đánh dấu trên chính host (dataset) để không gắn trùng.

   Chữ từ đâu ra: trước đây nhờ Web Speech API của trình duyệt, nhưng API đó đưa tiếng
   về máy chủ hãng — máy chạy hệ thống này không có internet ra ngoài nên đường đó chết.
   Nay trình duyệt chỉ lo thu âm (MediaRecorder) rồi gửi về /asr/transcribe, nơi máy nhận
   dạng ngay tại chỗ bằng faster-whisper `medium` (services/asr_service.py — số đo WER và
   độ trễ ở docstring file đó). Cùng lúc
   /asr/status đưa về bộ từ vựng "lời nói -> ký hiệu" rút từ trang Ký hiệu toán học
   (services/voice_vocab.py) để luật bên dưới nạp thêm. Web Speech vẫn còn trong file này
   làm đường dự phòng cho máy có mạng. */
(function () {
  /* ============================ LUẬT THUẦN ====================================
     Khối từ dòng này tới "window.__voiceMathLaw = LAW;" không được chạm DOM:
     tests/test_voice_math.py cắt đúng khoảng này bằng node và chạy bảng case trên
     chính mã mà trình duyệt đang dùng (cùng kiểu với tests/test_math_suggest.py).

     Cách làm: giữ nguyên TỪ GỐC, chỉ những từ đã nhận ra mới bị đổi thành ký hiệu,
     từ nào không phải từ toán trả về y nguyên — nên câu đọc chính tả không bị mất
     dấu viết hoa.

     HAI ĐƯỜNG SO KHỚP, vì hai nguồn chữ khác nhau. Máy nhận dạng trên máy (faster-
     whisper) trả lời nói ra THÀNH CHỮ CÓ DẤU, còn người gõ tay hay bỏ dấu
     ("can bac hai cua 5"). Câu có dấu chỉ được khớp đúng chính tả từng từ; câu
     không dấu mới khớp trên bản bỏ dấu. Chỉ dùng một đường bỏ dấu thì văn xuôi bị
     phá tan — đo trên 3 transcript MP3 bài giảng thật (18-11): "sau đó" -> "6 °",
     "phân tích" -> "/tích", "đồ vật" -> "° vật", "nhận biết" -> "× biết". */
  var VM_BAR = '\u0305';     // gạch ngang trên: "nóc" dấu căn phủ lên phần trong căn
  var VM_ROOT2 = '\u221a';   // √
  var VM_ROOT3 = '\u221b';   // ∛

  /* Chỉ số trên cho bậc căn ("căn bậc 4" -> "⁴√") và cho số mũ ("2 mũ 3" -> "2³").
     Bảng cục bộ để khối luật này chạy được một mình, không mượn math_suggest.js. */
  var VM_SUP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '-': '⁻', '+': '⁺', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'x': 'ˣ', 'a': 'ᵃ', 'b': 'ᵇ', 'k': 'ᵏ', 'm': 'ᵐ', 't': 'ᵗ'
  };

  /* Số đọc bằng chữ, dùng ở nơi cấu trúc đã biết chắc đó là số (bậc căn, số mũ,
     tử/mẫu, hạng tử đứng một mình) nên nhận cả các từ mơ hồ như "ba", "năm".
     "bẩy" là cách nói miền Nam của "bảy" (đo 19-11: "hai mũ bẩy" ra "2ᵇẩy"). */
  var VM_NUM = [
    ['không', '0'], ['một', '1'], ['hai', '2'], ['ba', '3'], ['bốn', '4'],
    ['tư', '4'], ['năm', '5'], ['lăm', '5'], ['sáu', '6'], ['bảy', '7'],
    ['bẩy', '7'], ['tám', '8'], ['chín', '9'], ['mười', '10']
  ];

  /* Bảng ghép SỐ NHIỀU CHỮ: "hai mươi bảy" -> 27, "mười hai" -> 12, "một trăm linh
     năm" -> 105. Học sinh nói số có hàng chục/hàng trăm rất nhiều ("hai mũ mười hai",
     "lớp 6A có bốn mươi học sinh"), mà máy nhận dạng thì rời từng chữ. VM_NUM chỉ đủ
     cho một chữ, nên cần hàng đơn vị + hàng chục/trăm ở đây. */
  var VM_DIG = [
    ['không', '0'], ['một', '1'], ['mốt', '1'], ['hai', '2'], ['ba', '3'],
    ['bốn', '4'], ['tư', '4'], ['năm', '5'], ['lăm', '5'], ['sáu', '6'],
    ['bảy', '7'], ['bẩy', '7'], ['tám', '8'], ['chín', '9']
  ];
  var VM_MUL = [['mươi', 10], ['mười', 10], ['chục', 10], ['trăm', 100],
                ['nghìn', 1000], ['ngàn', 1000]];
  var VM_FILL = [['linh', ''], ['lẻ', ''], ['le', '']];

  /* Từ chỉ phép tính. Dài (nhiều từ) thắng khi so khớp để "nhỏ hơn hoặc bằng"
     không bị cắt nhầm thành "nhỏ hơn". */
  var VM_OPS = [
    ['nhỏ hơn hoặc bằng', '≤'],
    ['lớn hơn hoặc bằng', '≥'],
    ['không nhỏ hơn', '≮'],
    ['không lớn hơn', '≯'],
    ['không chia hết', '∤'],
    ['không thuộc', '∉'],
    ['gần bằng', '≈'],
    ['chia hết', '⋮'],
    ['tiến tới', '→'],
    ['suy ra', '⇒'],
    ['tương đương', '⇔'],
    ['nhỏ hơn', '<'],
    ['lớn hơn', '>'],
    ['khác', '≠'],
    ['bằng', '='],
    ['cộng', '+'],
    ['trừ', '−'],
    ['nhân', '×'],
    ['chia', ':'],
    ['thuộc', '∈'],
    ['giao', '∩'],
    ['hợp', '∪']
  ];

  /* Những từ vừa là phép tính vừa là chữ thường rất phổ biến ("chia lớp", "nhân
     lên", "bằng xe", "các vật khác", "hợp số", "cộng lại"): chỉ đổi thành ký hiệu
     khi GẦN đó có toán hạng ra dáng toán, xem vmMathyBeside. "Minh cộng Hoa" vẫn ra
     "Minh + Hoa" vì tên viết hoa được tính là toán hạng; "các em cộng lại số cá"
     thì không (đo từ MP3 bài giảng lớp 6, 18-11). */
  var VM_HOM = { '≠': 1, '=': 1, ':': 1, '×': 1, '∈': 1, '∩': 1, '∪': 1,
                 '+': 1, '\u2212': 1 };

  /* Từ đổi thẳng ra ký hiệu khi gặp trong một hạng tử. Cố ý BỎ các từ mơ hồ
     ("hai", "ba", "tư", "năm", "không", "một", "tâm", "tổng", "giao", "hợp") —
     chúng quá phổ biến trong câu chữ thường, chỉ đổi khi nằm ở vị trí cấu trúc
     chắc chắn là toán (bảng VM_NUM, dùng riêng cho hạng tử đứng một mình). */
  var VM_WORDS = [
    ['bốn', '4'], ['sáu', '6'], ['bảy', '7'], ['chín', '9'], ['mười', '10'],
    ['trăm', '100'], ['nghìn', '1000'],
    ['phẩy', ','], ['chấm', '.'],
    ['vô cùng', '∞'], ['vô cực', '∞'],
    ['với mọi', '∀'], ['không tồn tại', '∄'], ['tồn tại', '∃'],
    ['phần trăm', '%'], ['phần nghìn', '‰'],
    ['độ', '°'], ['góc', '∠'], ['tam giác', '△'],
    ['vuông góc', '⊥'], ['không song song', '∦'], ['song song', '∥'],
    ['đồng dạng', '∽'],
    ['vecto', '→'], ['véc tơ', '→'],
    ['tích phân', '∫'], ['giới hạn', 'lim'],
    ['căn bậc hai', '√'], ['căn bậc ba', '∛'],
    ['đồng dư', '≡'], ['tập rỗng', '∅'],
    ['số tự nhiên', 'ℕ'], ['số nguyên', 'ℤ'], ['số hữu tỉ', 'ℚ'], ['số thực', 'ℝ'],
    ['pi', 'π'], ['alpha', 'α'], ['anpha', 'α'], ['beta', 'β'], ['gamma', 'γ'],
    ['delta', 'Δ'], ['denta', 'Δ'], ['theta', 'θ'], ['teta', 'θ'], ['lambda', 'λ'],
    ['lamda', 'λ'], ['muy', 'μ'], ['rho', 'ρ'], ['sigma', 'σ'], ['xichma', 'σ'],
    ['phi', 'φ'], ['epsilon', 'ε'], ['epxilon', 'ε'], ['omega', 'ω'], ['omego', 'ω']
    /* "của" KHÔNG ở đây: trong dấu căn thì bộ luật căn ăn nó trước khi tới bộ quét
       (xem vmTerm), còn ngoài căn thì nó là chữ của câu ("tổng của 3 và 4") — xóa đi
       là làm mất chữ học sinh đã nói. */
  ];

  /* Phân số có sẵn một ký tự Unicode thì dùng (giống bảng của math_suggest.js). */
  var VM_VULGAR = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
    '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘', '1/6': '⅙',
    '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
    '1/9': '⅑', '1/10': '⅒'
  };

  /* Chỉ những câu CÓ từ khoá toán mới bị viết lại. Câu đọc chính tả bình thường
     trả nguyên văn. Danh sách cố ý hẹp: các từ nằm trong câu chữ rất nhiều
     ("khác", "độ", "âm", "tổng", "giao", "hợp") không được kéo cả câu vào đây. */
  var VM_MATH_KEYS = [
    'can', 'cong', 'tru', 'nhan', 'chia', 'bang', 'mu', 'luy thua',
    'binh phuong',
    'lap phuong', 'phan', 'thuoc', 'phay',
    'nho hon', 'lon hon', 'vo cung', 'vo cuc', 'gan bang', 'chia het',
    'goc', 'tam giac', 'song song', 'vuong goc', 'tich phan', 'gioi han',
    'suy ra', 'tuong duong', 'dong du', 'tap rong', 'pi', 'so tu nhien',
    'so nguyen', 'so huu ti', 'so thuc'
  ];

  /* Từ vựng nạp thêm từ bảng "Ký hiệu toán học" (services/voice_vocab.py), máy đưa
     về trong /asr/status. Rỗng khi khối luật chạy một mình (test node) hoặc khi
     status không trả vocab. Cửa câu nhận luôn các khoá này: mỗi khoá đều hai chữ trở
     lên nên an toàn với văn xuôi, khác với "khác"/"độ" đứng một mình. */
  var VM_VOCAB = [];
  var VM_VOCAB_FOLD = {};    // bản bỏ dấu của các khoá đã nạp, chống nạp trùng lần hai
  var VM_VOCAB_IDX = vmIndex([]);    // tra riêng cụm từ nạp thêm (xem vmPhraseRun)
  var VM_VOCAB_MAX = 1;      // số chữ dài nhất trong cụm từ đã nạp
  var VM_MATH_RE = null;

  function vmGate() {
    var keys = VM_MATH_KEYS.slice();
    for (var i = 0; i < VM_VOCAB.length; i++) keys.push(vmFold(VM_VOCAB[i][0]));
    VM_MATH_RE = new RegExp('(?:^|\\s)(?:' + keys.join('|') + ')(?=\\s|$)');
  }

  vmGate();

  /* Bản BỎ DẤU, dùng cho câu người gõ tay không gõ dấu. */
  function vmFold(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  /* Bản CHỮ HOA THƯỜNG-HOÁ, bỏ dấu câu ở đầu/cuối, để so khớp với bảng từ.
     Không giữ dấu câu vì máy nhận dạng LUÔN chấm câu cuối câu: "hai mũ bảy." có
     từ cuối là "bảy.", tra bảng số theo nguyên văn thì không khớp, hạng tử rớt xuống
     bộ quét từ và vmSup biến cả chữ thành "2ᵇảy." — đúng lỗi user báo 19-11. Chữ để
     xuất ra vẫn lấy từ GỐC, nên chỉ việc NHẬN DIỆN mới được khoan dung dấu câu. */
  function vmNorm(text) {
    return vmBare(String(text == null ? '' : text)).toLowerCase().normalize('NFC');
  }

  /* Bỏ mọi ký tự không phải chữ/số/dấu thanh ở HAI BÊN một từ hoặc cụm từ.
     \p{M} (dấu thanh NFD) phải nằm trong danh sách giữ lại, nếu không "mù" viết
     dưới dạng "mu"+U+0300 sẽ bị chặt mất dấu và không khớp được bảng có dấu. */
  function vmBare(word) {
    return String(word == null ? '' : word).trim().replace(/^[^\p{L}\p{N}\p{M}]+/u, '')
      .replace(/[^\p{L}\p{N}\p{M}]+$/u, '');
  }

  /* Câu có dấu tiếng Việt không? Máy nhận dạng luôn trả về chữ có dấu; người gõ
     tay thì thường bỏ dấu. Hai đường so khớp vì vậy tách nhau (xem đầu khối luật). */
  function vmToned(text) {
    return /[^\x00-\x7F]/.test(String(text == null ? '' : text));
  }

  /* Mỗi bảng từ tra được cả hai đường: khoá đúng chính tả và khoá bỏ dấu. */
  function vmIndex(pairs) {
    var toned = {}, fold = {};
    for (var i = 0; i < pairs.length; i++) {
      toned[vmNorm(pairs[i][0])] = pairs[i][1];
      fold[vmFold(pairs[i][0])] = pairs[i][1];
    }
    return { toned: toned, fold: fold };
  }

  /* Tra một từ (hoặc cụm từ) trong bảng. Trả undefined khi không có. */
  function vmLookup(idx, key, toned) {
    var k = vmNorm(key).replace(/\s+/g, ' ');
    if (!k) return undefined;
    var m = toned ? idx.toned : idx.fold;
    var probe = toned ? k : vmFold(k);
    return Object.prototype.hasOwnProperty.call(m, probe) ? m[probe] : undefined;
  }

  /* So một từ gốc với một từ khoá, theo đúng đường so khớp của câu đang xử lý. */
  function vmEq(word, key, toned) {
    var a = vmNorm(word), b = vmNorm(key);
    return toned ? a === b : vmFold(a) === vmFold(b);
  }

  var VM_NUM_IDX = vmIndex(VM_NUM);
  var VM_DIG_IDX = vmIndex(VM_DIG);
  var VM_MUL_IDX = vmIndex(VM_MUL);
  var VM_FILL_IDX = vmIndex(VM_FILL);
  var VM_OP_IDX = vmIndex(VM_OPS);
  var VM_WORD_IDX = vmIndex(VM_WORDS);

  function vmHas(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  /* Nạp thêm từ vựng "lời nói -> ký hiệu" do máy rút từ bảng Ký hiệu toán học
     (services/voice_vocab.py, trả về trong /asr/status). Luật đã test ở VM_OPS/VM_WORDS
     LUÔN thắng: khoá nào trùng — tính cả bản bỏ dấu — bị bỏ, nên bảng nạp thêm chỉ có
     thể THÊM cụm từ, không đổi được chữ cũ. Trả về số khoá đang có để test và người
     đọc log thấy được. */
  function vmSetVocab(pairs) {
    var list = pairs || [];
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i][0] == null ? '' : list[i][0]).trim();
      var sym = String(list[i][1] == null ? '' : list[i][1]);
      if (!key || !sym) continue;
      var f = vmFold(key);
      if (vmHas(VM_VOCAB_FOLD, f)) continue;
      if (vmHas(VM_WORD_IDX.fold, f) || vmHas(VM_OP_IDX.fold, f)) continue;
      VM_VOCAB_FOLD[f] = 1;
      VM_VOCAB.push([key, sym]);
    }
    VM_WORD_IDX = vmIndex(VM_WORDS.concat(VM_VOCAB));
    VM_VOCAB_IDX = vmIndex(VM_VOCAB);
    VM_VOCAB_MAX = 1;
    for (var j = 0; j < VM_VOCAB.length; j++) {
      var w = String(VM_VOCAB[j][0]).trim().split(/\s+/).length;
      if (w > VM_VOCAB_MAX) VM_VOCAB_MAX = w;
    }
    vmGate();
    return VM_VOCAB.length;
  }

  /* Cụm từ nạp thêm (VM_VOCAB) bắt đầu tại i, dài bao nhiêu chữ (0 nếu không có).
     Phải tra BẢNG RIÊNG, không tra VM_WORD_IDX: bảng đó còn chứa các từ một chữ của
     luật cũ, ưu tiên chúng thì luật cũ đổi thành ưu tiên mới. */
  function vmPhraseRun(words, i, toned) {
    for (var n = VM_VOCAB_MAX; n >= 2; n--) {
      if (i + n > words.length) continue;
      if (vmLookup(VM_VOCAB_IDX, words.slice(i, i + n).join(' '), toned) != null) return n;
    }
    return 0;
  }

  function vmSup(text) {
    var s = String(text == null ? '' : text).trim();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      out += VM_SUP[s.charAt(i)] || s.charAt(i);
    }
    return out;
  }

  /* Một từ -> số nếu là số viết bằng chữ; không phải thì giữ nguyên. */
  function vmNum(word, toned) {
    var w = vmBare(word);
    if (/^[0-9]+$/.test(w)) return w;
    var v = vmLookup(VM_NUM_IDX, w, toned);
    return v == null ? w : v;
  }

  /* Chuỗi nhiều từ -> "" khi không phải số: dùng để hỏi "từ này có phải số không". */
  function vmIsNumber(word, toned) {
    return /^[0-9]/.test(vmNorm(word)) || vmLookup(VM_NUM_IDX, word, toned) != null;
  }

  /* Dãy chữ -> số khi và chỉ khi CẢ dãy toàn là từ số: "hai mươi bảy" -> "27",
     "mười hai" -> "12", "bốn trăm" -> "400". Có chữ chỉ hàng ("mươi", "trăm",
     "nghìn") thì tính theo hàng; không có hàng nào thì đọc nối từng chữ số
     ("hai không ba" -> "203", kiểu đọc số điện thoại). Một chữ không ra số là đủ
     để trả null, nên câu văn ("năm mươi học sinh") không bị đụng tới. */
  function vmNumRun(words, toned) {
    var total = 0, cur = null, plain = '', hasMul = false;
    for (var i = 0; i < words.length; i++) {
      var w = vmBare(words[i]);
      if (/^[0-9]+$/.test(w)) { cur = parseInt(w, 10); plain += w; continue; }
      var d = vmLookup(VM_DIG_IDX, w, toned);
      if (d != null) { cur = parseInt(d, 10); plain += d; continue; }
      var m = vmLookup(VM_MUL_IDX, w, toned);
      if (m != null) {
        total += (cur == null ? 1 : cur) * m;
        cur = null;
        hasMul = true;
        plain = '';
        continue;
      }
      if (vmLookup(VM_FILL_IDX, w, toned) != null) continue;   // "linh", "lẻ"
      return null;
    }
    if (!hasMul) return plain || null;
    return String(total + (cur || 0));
  }

  /* Từ chỉ phép tính -> ký hiệu. */
  function vmOpOf(words, toned) {
    var v = vmLookup(VM_OP_IDX, words.join(' '), toned);
    return v == null ? '' : v;
  }

  /* Toán hạng "ra dáng toán": có chữ số, là số đọc bằng chữ, là một chữ biến
     (x, n), hoặc là một từ VIẾT HOA (AB, CD, Minh, Hoa). Chỉ những từ phép tính
     vừa là chữ thường (VM_HOM) mới cần hỏi tiêu chí này. */
  function vmMathyWord(word, toned) {
    var raw = String(word == null ? '' : word).trim();
    if (/^[0-9]/.test(vmNorm(raw))) return true;
    if (vmLookup(VM_NUM_IDX, raw, toned) != null) return true;
    if (/^[a-z]$/.test(vmFold(raw))) return true;
    if (/^[A-Z][A-Za-z0-9]*$/.test(raw)) return true;
    return vmLookup(VM_WORD_IDX, raw, toned) != null;
  }

  /* Có toán hạng nào đứng GẦN phép tính không? Đếm hai từ mỗi bên vì số đọc bằng
     chữ thường dài hai âm tiết ("năm mươi cộng sáu"): chỉ nhìn từ kề sát thì câu
     "năm mươi cộng sáu" không đổi được thành "50 + 6". */
  function vmMathyBeside(words, at, used, toned) {
    for (var k = at - 2; k < at + used + 2; k++) {
      if (k >= at && k < at + used) continue;          // bỏ thân phép tính
      if (k < 0 || k >= words.length) continue;
      if (vmMathyWord(words[k], toned)) return true;
    }
    return false;
  }

  /* Đưa biểu thức vào "bên trong" dấu căn: hạng tử đơn (số, chữ, số thập phân) thì
     gạch ngang phủ lên từng ký tự; biểu thức có phép tính thì bọc ngoặc cho rõ. */
  function vmWrap(body) {
    var b = String(body == null ? '' : body).trim();
    if (!b) return '';
    if (/^[0-9a-z.,]+$/i.test(b)) {
      var out = '';
      for (var i = 0; i < b.length; i++) out += b.charAt(i) + VM_BAR;
      return out;
    }
    return '(' + b + ')';
  }

  function vmRoot(index, words, toned) {
    var inner = vmTerm(words, toned);
    if (!inner) return '';
    var n = vmNum(index, toned);
    var head = VM_ROOT2;
    if (n === '3') head = VM_ROOT3;
    else if (n && n !== '2') head = vmSup(n) + VM_ROOT2;   // căn bậc 4 -> "⁴√"
    return head + vmWrap(inner);
  }

  /* Quét từng từ, ưu tiên cụm dài nhất (4 -> 3 -> 2 -> 1 từ) để "tích phân" không bị
     hiểu thành "tích" rồi "phân", và để cụm 4 chữ dài nhất mà bảng ký hiệu được phép
     sinh ra khớp trọn, không bị cắt đôi. Từ không nhận ra giữ NGUYÊN từ gốc. */
  function vmScan(words, toned) {
    var out = [];
    var i = 0;
    while (i < words.length) {
      var hit = null;
      var found = false;
      var used = 0;
      for (var n = 4; n >= 1; n--) {
        if (i + n > words.length) continue;
        var v = vmLookup(VM_WORD_IDX, words.slice(i, i + n).join(' '), toned);
        if (v !== undefined) { hit = v; used = n; found = true; break; }
      }
      if (!found) {
        out.push(words[i]);
        i += 1;
      } else {
        if (hit) out.push(hit);
        i += used;
      }
    }
    return out.join(' ');
  }

  /* Tìm vị trí một từ khoá trong mảng TỪ GỐC, theo đường so khớp của câu. */
  function vmIndexOf(words, key, toned, from) {
    for (var i = from || 0; i < words.length; i++) {
      if (vmEq(words[i], key, toned)) return i;
    }
    return -1;
  }

  /* Các cách nói "số mũ". "hai lũy thừa bảy" cũng là 2^7 dù không có chữ "mũ" —
     máy nhận dạng hay nghe ra đúng cụm này (đo 19-11: câu đó luật cũ bỏ nguyên văn). */
  var VM_EXP = [['mũ'], ['lũy', 'thừa'], ['luỹ', 'thừa']];

  /* Từ chỉ số mũ gần CUỐI nhất, kèm số chữ của nó. Quét từ phải sang trái và bỏ
     "mũ" đứng ngay sau "số": "số mũ" là TÊN gọi, không phải phép nâng luỹ thừa,
     nên "số mũ của 2 mũ 3" phải bám vào chữ mũ thật (luật cũ ra "sốcủᵃ ²³"). */
  function vmExpAt(words, toned) {
    for (var i = words.length - 1; i >= 1; i--) {
      for (var k = 0; k < VM_EXP.length; k++) {
        var kw = VM_EXP[k];
        if (i + kw.length > words.length) continue;
        var ok = true;
        for (var p = 0; p < kw.length; p++) {
          if (!vmEq(words[i + p], kw[p], toned)) { ok = false; break; }
        }
        if (!ok) continue;
        if (kw.length === 1 && vmEq(words[i - 1], 'số', toned)) continue;
        return { at: i, len: kw.length };
      }
    }
    return null;
  }

  /* Chỉ số trên chỉ được dựng khi số mũ là CHỮ SỐ hoặc MỘT BIẾN. Nếu không khớp hai
     dạng đó ("2ʰai mươI") thì thà để nguyên chữ còn hơn: mất chữ còn hại hơn mất ký
     hiệu, vì học sinh không biết mình đã nói gì. */
  function vmCleanExp(text) {
    return /^[0-9]+$/.test(text) || /^[a-zA-Z]$/.test(text);
  }

  /* Một hạng tử (giữa hai phép tính): nhận dạng căn, luỹ thừa, phân số; không khớp
     gì thì quét từ. words là mảng TỪ GỐC (còn dấu, còn chữ hoa). */
  function vmTerm(words, toned) {
    if (!words || !words.length) return '';
    var n = words.length;

    /* hạng tử chỉ có một từ mà là số đọc bằng chữ ("năm" -> "5") */
    if (n === 1) {
      var single = vmLookup(VM_NUM_IDX, words[0], toned);
      if (single != null) return single;
    }

    /* cả hạng tử toàn từ số -> MỘT số, không phải từng chữ rời: "hai mươi bảy" -> 27,
       "bốn trăm" -> 400. Nói "hai mươi bảy" mà máy nhả ra "27" là do chỗ này. */
    var asNum = vmNumRun(words, toned);
    if (asNum) return asNum;

    /* căn: "căn bậc hai của 5", "căn bậc ba của 8", "căn bậc 4 của x", "căn 9" */
    if (vmEq(words[0], 'căn', toned)) {
      var k = 1;
      var index = '2';
      if (vmEq(words[k], 'bậc', toned) && words[k + 1] != null) {
        index = vmNum(words[k + 1], toned);
        k += 2;
      } else {
        var direct = vmLookup(VM_NUM_IDX, words[k], toned);
        if (direct != null && vmEq(words[k + 1], 'của', toned)) {
          index = direct;
          k += 1;
        }
      }
      if (vmEq(words[k], 'của', toned)) k += 1;
      return vmRoot(index, words.slice(k), toned);
    }

    /* luỹ thừa: "2 mũ 3", "hai mũ bảy.", "hai lũy thừa bảy", "x bình phương" */
    var e = vmExpAt(words, toned);
    if (e && e.at + e.len < n) {
      var base = vmTerm(words.slice(0, e.at), toned);
      var exp = vmTerm(words.slice(e.at + e.len), toned);
      if (base && exp && vmCleanExp(exp)) return base + vmSup(exp);
    }
    if (n >= 3 && vmEq(words[n - 2], 'bình', toned) && vmEq(words[n - 1], 'phương', toned)) {
      return vmTerm(words.slice(0, n - 2), toned) + '²';
    }
    if (n >= 3 && vmEq(words[n - 2], 'lập', toned) && vmEq(words[n - 1], 'phương', toned)) {
      return vmTerm(words.slice(0, n - 2), toned) + '³';
    }

    /* "phần" phải nối hai số thì mới là phân số: "hai phần ba" -> ⅔; bản không dấu
       cũng không được biến "phan tich" thành "/tích". */
    var pi = vmIndexOf(words, 'phần', toned, 1);
    if (pi > 0 && pi < n - 1) {
      /* "trăm"/"nghìn" chỉ là hậu tố % ‰ khi chúng ĐỨNG CUỐI hạng tử. Nếu còn chữ
         sau ("năm mươi phần trăm của 200") thì để bộ quét từ chạy, không được vứt
         đuôi — nói mà mất chữ thì học sinh nhận sai đề. */
      if (pi + 1 === n - 1 && vmEq(words[pi + 1], 'trăm', toned)) {
        return vmTerm(words.slice(0, pi), toned) + '%';
      }
      if (pi + 1 === n - 1 && vmEq(words[pi + 1], 'nghìn', toned)) {
        return vmTerm(words.slice(0, pi), toned) + '‰';
      }
      if (vmIsNumber(words[pi + 1], toned)) {
        var num = vmTerm(words.slice(0, pi), toned);
        var den = vmTerm(words.slice(pi + 1), toned);
        if (num && den) return VM_VULGAR[num + '/' + den] || (num + '/' + den);
      }
    }

    return vmScan(words, toned);
  }

  /* Lời nói -> ký hiệu. Không có từ khoá toán thì trả nguyên văn (đọc chính tả). */
  function vmParse(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return '';
    var toned = vmToned(raw);
    var words = raw.split(/\s+/);
    if (!VM_MATH_RE.test(' ' + words.map(vmFold).join(' ') + ' ')) return raw;

    var out = [];
    var cur = [];
    var i = 0;
    while (i < words.length) {
      /* Cụm từ của bảng Ký hiệu (±, ≈, Ω…) đi THẲNG vào hạng tử: nếu để vòng dưới
         đây thấy "cộng" trước thì "a cộng trừ b" vỡ thành "a + − b" và mất ±. */
      var run = vmPhraseRun(words, i, toned);
      if (run) {
        for (var p = 0; p < run; p++) cur.push(words[i + p]);
        i += run;
        continue;
      }
      var op = '';
      var used = 0;
      for (var w = 4; w >= 2; w--) {          // phép tính dài nhất có 4 từ
        if (i + w > words.length) continue;
        op = vmOpOf(words.slice(i, i + w), toned);
        if (op) { used = w; break; }
      }
      if (!op) {
        var one = vmOpOf([words[i]], toned);
        if (one) { op = one; used = 1; }
      }
      /* "phép nhân", "phép chia" là TÊN phép tính, không phải lệnh: giữ nguyên chữ. */
      if (op && used === 1 && i > 0 && vmEq(words[i - 1], 'phép', toned)) op = '';
      /* Những từ vừa là phép tính vừa là chữ thường (VM_HOM) chỉ đổi khi có toán
         hạng ra dáng toán ở gần: "các vật khác" không được thành "≠", "các em cộng
         lại số cá" không được thành "+ lại". */
      if (op && VM_HOM[op] && !vmMathyBeside(words, i, used, toned)) op = '';
      if (op) {
        var left = vmTerm(cur, toned);
        if (left) out.push(left);
        out.push(op);
        cur = [];
        i += used;
      } else {
        cur.push(words[i]);
        i += 1;
      }
    }
    var last = vmTerm(cur, toned);
    if (last) out.push(last);
    /* ° % ‰ là hậu tố, ∠ △ là tiền tố: bám vào chữ bên cạnh, không có khoảng trống. */
    return out.join(' ')
      .replace(/ ([°%‰])/g, '$1')
      .replace(/([∠△]) /g, '$1');
  }

  var LAW = {
    parse: vmParse,
    term: vmTerm,
    root: vmRoot,
    fold: vmFold,
    toSuperscript: vmSup,
    setVocab: vmSetVocab,
    OPS: VM_OPS,
    WORDS: VM_WORDS
  };
  window.__voiceMathLaw = LAW;
  /* ========================== hết phần luật thuần ============================== */

  var S = window.__voiceMath = window.__voiceMath || {
    qid: '', on: false, rec: null, btn: null, timer: 0
  };

  /* Mỗi lượt ghi giữ qid và trạng thái riêng: lời nói của câu 1 phải về câu 1 dù
     trong lúc chờ máy nhận dạng học sinh đã bắt đầu ghi câu 2. */
  S.status = S.status || null;
  S.probing = false;
  S.waiting = [];
  S.job = null;
  S.notice = 0;

  var LABEL = '🎤 Nói';
  var LABEL_ON = '🛑 Dừng';
  var BAR_ID = 'vm-bar';
  var STATUS_URL = '/asr/status';
  var TRANSCRIBE_URL = '/asr/transcribe';

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function cloudSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /* Nhận dạng tại chỗ chỉ cần trình duyệt biết thu âm — phần nhận dạng nằm ở máy. */
  function localCapable() {
    return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function localReady() {
    return !!(localCapable() && S.status && S.status.enabled && S.status.available);
  }

  /* Hỏi máy MỘT lần xem nhận dạng tại chỗ dùng được không (vài ms). Ai bấm trong lúc
     chờ được xếp hàng để không mở hai bản ghi song song. */
  function settle(j) {
    S.status = (j && j.ok) ? j : { enabled: false, available: false };
    /* Từ vựng ký hiệu toán học đi kèm status: nạp trước khi có lượt nhận dạng nào. */
    LAW.setVocab(S.status.vocab);
    S.probing = false;
    var list = S.waiting;
    S.waiting = [];
    for (var i = 0; i < list.length; i++) { list[i](); }
  }

  function probeStatus(done) {
    if (S.status) { done(); return; }
    S.waiting.push(done);
    if (S.probing) return;
    S.probing = true;
    fetch(STATUS_URL, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) { settle(j); })
      .catch(function () { settle(null); });   // không hỏi được máy: coi như chỉ còn đường cũ
  }

  /* Một dòng trạng thái dùng chung, nổi ở góc dưới phải — thanh CKEditor không đủ
     chỗ để nhét chữ "đang nghe..." bên cạnh nút. */
  function bar() {
    var b = document.getElementById(BAR_ID);
    if (b) return b;
    b = make('div', null, '');
    b.id = BAR_ID;
    document.body.appendChild(b);
    return b;
  }

  function say(msg, sticky) {
    var b = bar();
    b.textContent = msg || '';
    b.style.display = msg ? 'block' : 'none';
    if (S.timer) { window.clearTimeout(S.timer); S.timer = 0; }
    if (msg && !sticky) {
      S.timer = window.setTimeout(function () {
        b.style.display = 'none';
        b.textContent = '';
        S.timer = 0;
      }, 4000);
    }
  }

  function paint(on, btn) {
    S.on = !!on;
    var b = btn || S.btn;
    if (!b) return;
    var label = on ? LABEL_ON : LABEL;
    var span = b.querySelector('.ck-button__label');
    if (span) span.textContent = label; else b.textContent = label;
    if (on) b.classList.add('vm-on'); else b.classList.remove('vm-on');
  }

  function report(job, msg, sticky) {
    if (S.notice === job.notice) say(msg, sticky);
  }

  /* Chèn chữ vào bài: đi qua đúng lối của math_suggest.js (đã lo cả CKEditor lẫn
     textarea, và biết host theo qid). */
  function insert(qid, text) {
    if (window.mathSuggestText) return window.mathSuggestText(qid, text);
    var ta = document.querySelector('textarea[name="essay_' + qid + '"]')
          || document.querySelector('textarea[name="short_' + qid + '"]');
    if (!ta) return false;
    var value = String(ta.value || '');
    var caret = typeof ta.selectionStart === 'number' ? ta.selectionStart : value.length;
    var end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : caret;
    ta.value = value.slice(0, caret) + text + value.slice(end);
    ta.selectionStart = ta.selectionEnd = caret + text.length;
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* cũ */ }
    return true;
  }

  function errorText(code) {
    var map = {
      'not-allowed': 'Trình duyệt chưa được cho phép dùng micro.',
      'service-not-allowed': 'Trình duyệt đang chặn nhận dạng giọng nói.',
      'audio-capture': 'Không tìm thấy micro trên máy.',
      'no-speech': 'Không nghe thấy gì — em thử nói lại nhé.',
      'aborted': 'Đã dừng nghe.',
      'network': 'Lỗi mạng khi nhận dạng giọng nói.'
    };
    return map[code] || 'Lỗi nhận dạng giọng nói.';
  }

  function commit(job, spoken) {
    var text = LAW.parse(spoken);
    if (!text) { report(job, 'Chưa nghe rõ nội dung để chèn.'); return; }
    if (!insert(job.qid, text)) {
      report(job, 'Không chèn được — em gõ tay: ' + text);
      return;
    }
    report(job, 'Đã chèn: ' + text);
  }

  function makeRec(job) {
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return null;
    var r = new R();
    r.lang = 'vi-VN';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onstart = function () {
      if (job.cancelled) return;
      paint(true, job.btn);
      report(job, 'Đang nghe… ví dụ: "căn bậc hai của 5".', true);
    };
    r.onresult = function (ev) {
      if (job.cancelled) return;
      var interim = '';
      var fin = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var res = ev.results[i];
        if (res.isFinal) fin += res[0].transcript; else interim += res[0].transcript;
      }
      if (interim) report(job, 'Đang nghe: ' + interim, true);
      if (fin) commit(job, fin);
    };
    r.onerror = function (ev) {
      if (job.cancelled) return;
      report(job, errorText(ev && ev.error));
      finish(job);
    };
    r.onend = function () { finish(job); };
    return r;
  }

  var MIME_TRY = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

  function pickMime() {
    for (var i = 0; i < MIME_TRY.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(MIME_TRY[i])) return MIME_TRY[i];
      } catch (e) { /* trình duyệt cũ không có isTypeSupported */ }
    }
    return '';
  }

  function ext(mime) {
    if (mime.indexOf('ogg') >= 0) return 'ogg';
    if (mime.indexOf('mp4') >= 0) return 'm4a';
    return 'webm';
  }

  function stopTracks(stream) {
    var tracks = stream && stream.getTracks ? stream.getTracks() : [];
    for (var i = 0; i < tracks.length; i++) {
      try { tracks[i].stop(); } catch (e) { /* track đã tắt */ }
    }
  }

  /* Tắt micro + gỡ hẹn giờ của ĐÚNG lượt ghi. Chrome giữ đèn báo thu âm tới khi
     track.stop(), nên không được chờ bản nhận dạng khác của cùng máy. */
  function releaseMic(job) {
    if (job.limit) { window.clearTimeout(job.limit); job.limit = 0; }
    stopTracks(job.stream);
    job.stream = null;
  }

  function finish(job) {
    releaseMic(job);
    if (S.job !== job) return;
    S.job = null;
    S.media = null;
    S.rec = null;
    paint(false, job.btn);
  }

  function upload(job, mime) {
    var blob = new Blob(job.chunks, { type: mime || 'audio/webm' });
    job.chunks = [];
    if (!blob.size) { report(job, 'Không nghe thấy gì — em thử nói lại nhé.'); return; }
    report(job, 'Đang đổi lời nói thành chữ…', true);
    var fd = new FormData();
    fd.append('audio', blob, 'loino.' + ext(mime));
    fetch(TRANSCRIBE_URL, { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().then(function (j) { return j || null; },
                              function () { return null; });
      })
      .then(function (j) {
        if (j && j.ok) {
          if (!j.text) { report(job, 'Chưa nghe rõ nội dung để chèn.'); return; }
          commit(job, j.text);
          return;
        }
        report(job, (j && j.detail) || 'Máy không nhận dạng được câu này.');
        if (j && j.error === 'asr_offline') S.status = { enabled: false, available: false };
      })
      .catch(function () { report(job, 'Không gửi được bản ghi về máy.'); });
  }

  function startLocal(job) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (job.cancelled || S.job !== job) { stopTracks(stream); return; }
      job.stream = stream;
      var mime = pickMime();
      var rec;
      try {
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch (e) {
        finish(job);
        report(job, 'Trình duyệt không mở được bộ ghi âm.');
        return;
      }
      job.media = rec;
      S.media = rec;
      rec.ondataavailable = function (ev) {
        if (!job.cancelled && ev.data && ev.data.size) job.chunks.push(ev.data);
      };
      rec.onstop = function () {
        finish(job);
        if (!job.cancelled) upload(job, mime);
      };
      rec.onerror = function () {
        job.cancelled = true;
        finish(job);
        report(job, 'Bộ ghi âm gặp lỗi — em thử nói lại nhé.');
      };
      try { rec.start(); } catch (e) { job.cancelled = true; finish(job); }
      if (job.cancelled) { report(job, 'Không mở được micro.'); return; }
      paint(true, job.btn);
      var secs = (S.status && S.status.maxSeconds) || 20;
      report(job, 'Đang ghi âm… nói xong bấm "Dừng". Máy đổi ra chữ mất khoảng '
          + '8-14 giây.', true);
      job.limit = window.setTimeout(function () { if (S.job === job) stop(); }, secs * 1000);
    }, function () {
      if (job.cancelled || S.job !== job) return;
      finish(job);
      report(job, 'Trình duyệt chưa được cho phép dùng micro.');
    });
  }

  function stop() {
    var job = S.job;
    if (!job) return;
    if (job.starting) {
      job.cancelled = true;
      finish(job);
      report(job, 'Đã dừng nghe.');
      return;
    }
    S.job = null;
    S.media = null;
    S.rec = null;
    paint(false, job.btn);
    if (job.media) {
      if (job.media.state === 'inactive') { finish(job); return; }
      try { job.media.stop(); }
      catch (e) { job.cancelled = true; finish(job); }
      return;
    }
    if (job.rec) { try { job.rec.stop(); } catch (e) { /* đã dừng */ } }
    finish(job);
  }

  function start(qid, btn) {
    var job = {
      qid: String(qid), btn: btn, notice: ++S.notice, starting: true,
      cancelled: false, stream: null, media: null, rec: null, chunks: [], limit: 0
    };
    S.job = job;
    S.qid = job.qid;
    S.btn = btn;
    paint(true, btn);
    probeStatus(function () {
      if (S.job !== job || job.cancelled) return;
      job.starting = false;
      if (localReady()) { startLocal(job); return; }
      if (!cloudSupported()) {
        finish(job);
        report(job, 'Trình duyệt này không hỗ trợ nhận dạng giọng nói.');
        return;
      }
      job.rec = makeRec(job);
      S.rec = job.rec;
      if (!job.rec) { finish(job); return; }
      try { job.rec.start(); }
      catch (e) { finish(job); report(job, 'Không mở được micro.'); }
    });
  }

  function toggle(btn, qid) {
    S.btn = btn;
    if (S.job) { stop(); return; }
    start(qid, btn);
  }

  /* Thanh công cụ CKEditor: ưu tiên đối tượng toolbar, không có thì tìm .ck-toolbar
     quanh gốc soạn thảo (cùng lối với math_suggest.js). */
  function toolbarOf(editor) {
    try {
      var tv = editor.ui && editor.ui.view && editor.ui.view.toolbar;
      if (tv && tv.element) return tv.element;
    } catch (e) { /* editor chưa render xong */ }
    var root = null;
    try { root = editor.editing.view.getDomRoot(); } catch (e2) { return null; }
    var box = root && root.closest ? root.closest('.ck-editor') : null;
    return box ? box.querySelector('.ck-toolbar') : null;
  }

  function makeButton(ck) {
    var b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.title = 'Nhấn để nói — hệ thống đổi lời nói thành ký hiệu toán học';
    if (ck) {
      b.className = 'ck ck-button ck-button_with-text ms-ck-btn vm-btn';
      b.appendChild(make('span', 'ck-button__label', LABEL));
    } else {
      b.className = 'ms-plain-btn vm-btn';
      b.textContent = LABEL;
    }
    // mousedown.preventDefault: giữ nguyên con trỏ đang gõ trong CKEditor
    b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    return b;
  }

  /* host = editor CKEditor (gắn vào thanh công cụ) hoặc textarea (lúc CKEditor chưa
     tải được). Bấm nút để bắt đầu nghe, bấm lần nữa để dừng. */
  function mount(host, qid) {
    if (!host || !qid) return null;
    if (host.tagName === 'TEXTAREA') {
      if (host.dataset.voiceMath) return null;
      host.dataset.voiceMath = '1';
      var wrap = document.querySelector('.ms-plain-bar[data-ms-key="' + qid + '"]');
      if (!wrap) {
        wrap = make('div', 'ms-plain-bar', null);
        wrap.setAttribute('data-ms-key', qid);
        if (host.parentNode) host.parentNode.insertBefore(wrap, host);
      }
      var plain = makeButton(false);
      plain.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggle(plain, qid);
      });
      wrap.appendChild(plain);
      return plain;
    }
    var barEl = toolbarOf(host);
    if (!barEl || barEl.dataset.voiceMath) return null;
    barEl.dataset.voiceMath = '1';
    var btn = makeButton(true);
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      toggle(btn, qid);
    });
    barEl.appendChild(btn);
    return btn;
  }

  window.voiceMathMount = mount;
})();
