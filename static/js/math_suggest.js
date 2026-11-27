/* Nút "Gợi ý" trên thanh CKEditor của ô trả lời tự luận (/practice, câu tu_luan).

   Bấm nút -> xổ ra hàng loạt gợi ý ký hiệu toán học theo nhóm. Gợi ý nào chỉ là một
   ký tự (×, ≤, ², ∈...) thì chèn thẳng vào con trỏ. Gợi ý nào là một KHUÔN (lũy thừa,
   căn, phân số, tích phân có cận, giới hạn, số đo góc, số kèm đơn vị) thì panel đổi
   sang Ô NHẬP RIÊNG đúng với khuôn đó — "Lũy thừa" hỏi cơ số và số mũ, "Căn" hỏi biểu
   thức và bậc, "Tích phân có cận" hỏi cận dưới/cận trên — có xem trước
   chạy theo từng chữ gõ vào, Enter hoặc nút "Chèn" mới đưa chữ vào bài.

   Hai lối sinh chữ (user chốt 2026-11-08):
     * Ký hiệu MỘT tầng (×, ≤, ², ∈, °...) giữ UNICODE — không cần tầng render nào,
       đúng như SGK (typing_hint.py cũng đổi "bình phương" -> "²").
     * Khuôn phải xếp chữ thành HAI tầng (tích phân, tổng xích ma, lim, góc, vectơ,
       căn lồng) sinh LaTeX trong cặp $...$: Unicode không có hình chỉ số trên/dưới để
       xếp cận trên/cận dưới, mũ góc hay mũi tên vectơ. Trang làm bài nạp KaTeX từ
       base/head.html, trang kết quả render lại bằng common.js (renderPageMath ->
       renderPageKatex), nên công thức hiện đúng ở cả hai nơi.
   Ô "Xem trước" của panel cũng render KaTeX để khớp với trang kết quả.

   Vì sao chữ đi qua editor: CKEditor giữ <textarea> làm field của form nhưng chỉ ghi
   HTML trở lại value lúc destroy()/nộp bài — dán chữ vào textarea là mất bài. Nên mọi
   lượt chèn đi qua ed.model.change(), dùng chung lối đã kiểm chứng ở typing_suggest.js.

   Trang nạp qua AJAX nên mảnh nội dung được tạo lại nhiều lần: nút gắn một lần cho mỗi
   toolbar (dấu trên chính phần tử toolbar), panel là MỘT phần tử dùng chung đặt trên
   body, state nằm trên window để browser-check đọc được. */
(function () {
  /* ============================ LUẬT THUẦN ====================================
     Khối từ dòng này tới "window.__mathSuggestLaw = LAW;" không được chạm DOM:
     tests/test_math_suggest.py cắt đúng khoảng này bằng node và chạy bảng case
     trên chính mã mà trình duyệt đang dùng (kiểu tests/test_math_spacing.py). */

  /* Chỉ số trên Unicode. Không phải mọi chữ cái đều có hình superscript, chữ nào
     thiếu hình để thế thì giữ nguyên chữ đó — "x^n" ra "xⁿ", "2^ab" ra "2ᵃᵇ". */
  var MS_SUPERSCRIPT = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'g': 'ᵍ',
    'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ',
    'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ',
    'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ'
  };

  /* Chỉ số dưới Unicode (aₙ, u₁, log₂): đề thi THCS–THPT dùng rất nhiều. Cùng luật
     với chỉ số trên — chữ nào Unicode không có hình subscript thì giữ nguyên chữ. */
  var MS_SUBSCRIPT = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ',
    'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ',
    's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
  };

  /* Phân số có sẵn một ký tự trong Unicode — dùng được thì tốt hơn "1/2" vì SGK
     in phân số hạng tử trên/dưới và ô trả lời của học sinh lớp 6 thường chỉ có
     mấy số quen thuộc này. Ngoài bảng thì viết "tử/mẫu" (luật phân số của app
     sẽ đưa về dạng đẹp lúc hiển thị). */
  var MS_VULGAR = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
    '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘', '1/6': '⅙',
    '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
    '1/9': '⅑', '1/10': '⅒'
  };

  /* Bảng đơn vị cho ô "Số kèm đơn vị" — theo SGK và theo VI_UNITS của lớp hiển thị
     (static/js/common.js), thêm chữ ở đây là học sinh chọn được chữ đó. */
  var MS_UNITS = [
    'mm', 'cm', 'dm', 'm', 'km', 'g', 'kg', 'hg', 'dag', 'yến', 'tạ', 'tấn',
    'lít', 'ml', 'giờ', 'phút', 'giây', 'đồng', 'đ',
    'mm²', 'cm²', 'dm²', 'm²', 'km²', 'mm³', 'cm³', 'dm³', 'm³',
    'm/s', '°C'
  ];

  function toSuperscript(text) {
    var s = String(text == null ? '' : text).trim();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += MS_SUPERSCRIPT[ch] || MS_SUPERSCRIPT[ch.toLowerCase()] || ch;
    }
    return out;
  }

  function toSubscript(text) {
    var s = String(text == null ? '' : text).trim();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += MS_SUBSCRIPT[ch] || MS_SUBSCRIPT[ch.toLowerCase()] || ch;
    }
    return out;
  }

  /* Bảng tra NGƯỢC của hai bảng chỉ số: ký tự Unicode -> chữ ASCII gốc ("²" -> "2",
     "ₙ" -> "n") để chuyển công thức người dùng gõ sang LaTeX lúc ghép vào khuôn hai
     tầng ("x²" -> "x^{2}", "u₁" -> "u_{1}"). */
  var MS_SUPERSCRIPT_INV = {};
  var MS_SUBSCRIPT_INV = {};
  (function () {
    var ch;
    for (ch in MS_SUPERSCRIPT) MS_SUPERSCRIPT_INV[MS_SUPERSCRIPT[ch]] = ch;
    for (ch in MS_SUBSCRIPT) MS_SUBSCRIPT_INV[MS_SUBSCRIPT[ch]] = ch;
  })();

  /* Vài ký hiệu Unicode đổi sang LỆNH LaTeX cho chắc: trong khuôn hai tầng, KaTeX
     bản nào hỗ trợ ký tự nào là tuỳ phiên bản, còn lệnh thì luôn có. Ký hiệu đứng
     một mình vẫn giữ Unicode (xem các nhóm "Phép tính", "Tập hợp"...). */
  var MS_TEX_SYMBOL = {
    '∞': '\\infty', '∅': '\\varnothing', '∈': '\\in', '∉': '\\notin',
    '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '≈': '\\approx', '±': '\\pm',
    '→': '\\to', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow',
    '∑': '\\sum', '∏': '\\prod', '∫': '\\int',
    '×': '\\times', '·': '\\cdot', 'π': '\\pi', 'Δ': '\\Delta',
    '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '△': '\\triangle'
  };

  /* Công thức người dùng gõ (Unicode) -> LaTeX: gom chỉ số trên/dưới Unicode thành
     "^{...}"/"_{...}" rồi đổi vài ký hiệu phổ biến sang lệnh LaTeX. */
  function toTex(text) {
    var s = String(text == null ? '' : text);
    var out = '', run = '', kind = '';
    function flush() {
      if (!run) return;
      out += (kind === 'sup' ? '^{' : '_{') + run + '}';
      run = ''; kind = '';
    }
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var up = MS_SUPERSCRIPT_INV[ch];
      var dn = MS_SUBSCRIPT_INV[ch];
      if (up) {
        if (kind !== 'sup') { flush(); kind = 'sup'; }
        run += up;
      } else if (dn) {
        if (kind !== 'sub') { flush(); kind = 'sub'; }
        run += dn;
      } else {
        flush();
        out += MS_TEX_SYMBOL[ch] || ch;
      }
    }
    flush();
    return out;
  }

  /* Bỏ dấu để lọc gợi ý: học sinh gõ "pt" vẫn ra "Phương trình", "can bac" ra căn.
     Chữ có dấu trong bảng là của app, không phải do người dùng nhập. */
  function foldVi(text) {
    return String(text == null ? '' : text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase();
  }

  function msSym(group, sym, name, words) {
    return { id: sym, group: group, sym: sym, name: name, words: words || '', slots: [] };
  }

  function msTpl(group, id, name, sym, slots, build) {
    return { id: id, group: group, sym: sym, name: name, slots: slots, build: build, words: '' };
  }

  /* Khuôn "số hạng trước, chỉ số trên sau": không có ô nào được phép trống, vì
     "²" đứng một mình thì vẫn đúng (nối vào chữ đã gõ) còn "^" thiếu cơ số thì vô
     nghĩa — nên luật bắt buộc đủ cả hai ô chỉ áp dụng cho khuôn. */
  var MS_SUGGESTIONS = [
    msSym('Phép tính', '+', 'Cộng'),
    msSym('Phép tính', '−', 'Trừ'),
    msSym('Phép tính', '×', 'Nhân'),
    msSym('Phép tính', ':', 'Chia', 'chia dau hai cham'),
    msSym('Phép tính', '=', 'Bằng'),
    msSym('Phép tính', '≠', 'Khác'),
    msSym('Phép tính', '≈', 'Gần bằng'),
    msSym('Phép tính', '<', 'Nhỏ hơn'),
    msSym('Phép tính', '>', 'Lớn hơn'),
    msSym('Phép tính', '≤', 'Nhỏ hơn hoặc bằng'),
    msSym('Phép tính', '≥', 'Lớn hơn hoặc bằng'),
    msSym('Phép tính', '±', 'Cộng trừ'),
    msSym('Phép tính', '%', 'Phần trăm'),
    msSym('Phép tính', '‰', 'Phần nghìn'),
    msSym('Phép tính', '≪', 'Rất nhỏ hơn'),
    msSym('Phép tính', '≫', 'Rất lớn hơn'),
    msSym('Phép tính', '≮', 'Không nhỏ hơn'),
    msSym('Phép tính', '≯', 'Không lớn hơn'),
    msSym('Phép tính', '≢', 'Không đồng nhất', 'khong dong nhat'),

    msTpl('Mũ và căn', 'power', 'Lũy thừa (a mũ b)', 'aᵇ', [
      { key: 'base', label: 'Cơ số', ph: 'vd: 2 hoặc x' },
      { key: 'exp', label: 'Số mũ', ph: 'vd: 3' }
    ], function (v) {
      if (!v.base || !v.exp) return '';
      return v.base + toSuperscript(v.exp);
    }),
    msTpl('Mũ và căn', 'sqrt', 'Căn bậc n của a', '√(a)', [
      { key: 'expr', label: 'Biểu thức trong căn', ph: 'vd: 16 hoặc x+1' },
      { key: 'index', label: 'Bậc (bỏ trống = bậc 2)', ph: 'vd: 3' }
    ], function (v) {
      if (!v.expr) return '';
      var body = toTex(v.expr);
      var index = String(v.index || '').trim();
      if (!index || index === '2') return '$\\sqrt{' + body + '}$';
      return '$\\sqrt[' + toTex(index) + ']{' + body + '}$';
    }),
    /* Căn lồng nhiều cấp: trước đây muốn "căn của căn" thì phải chèn căn trong rồi
       copy đem dán vào căn ngoài (user báo 2026-11-08). Nay chỉ gõ biểu thức trong
       cùng một lần và chọn số lớp căn. */
    msTpl('Mũ và căn', 'nestsqrt', 'Căn lồng nhiều cấp', '√√(a)', [
      { key: 'expr', label: 'Biểu thức trong cùng', ph: 'vd: x+1' },
      { key: 'levels', label: 'Số lớp căn (bỏ trống = 2)', ph: 'vd: 3' }
    ], function (v) {
      if (!v.expr) return '';
      var n = parseInt(String(v.levels || '').trim(), 10);
      if (!n || n < 1) n = 2;
      if (n > 6) n = 6;
      var body = toTex(v.expr);
      for (var i = 0; i < n; i++) body = '\\sqrt{' + body + '}';
      return '$' + body + '$';
    }),
    msSym('Mũ và căn', '²', 'Bình phương'),
    msSym('Mũ và căn', '³', 'Lập phương'),
    msSym('Mũ và căn', '√', 'Căn bậc hai'),
    msSym('Mũ và căn', '∛', 'Căn bậc ba'),
    msTpl('Mũ và căn', 'sub', 'Chỉ số dưới (a dưới n)', 'aₙ', [
      { key: 'base', label: 'Ký hiệu', ph: 'vd: a hoặc u' },
      { key: 'index', label: 'Chỉ số', ph: 'vd: 1 hoặc n' }
    ], function (v) {
      if (!v.base || !v.index) return '';
      return v.base + toSubscript(v.index);
    }),

    msTpl('Phân số', 'frac', 'Phân số (tử, mẫu)', 'a/b', [
      { key: 'num', label: 'Tử số', ph: 'vd: 3' },
      { key: 'den', label: 'Mẫu số', ph: 'vd: 4' }
    ], function (v) {
      if (!v.num || !v.den) return '';
      if (v.den === '0') return '';
      return MS_VULGAR[v.num + '/' + v.den] || (v.num + '/' + v.den);
    }),
    msSym('Phân số', '½', 'Một phần hai'),
    msSym('Phân số', '⅓', 'Một phần ba'),
    msSym('Phân số', '¼', 'Một phần tư'),
    msSym('Phân số', '⅔', 'Hai phần ba'),
    msSym('Phân số', '¾', 'Ba phần tư'),

    msTpl('Hình học', 'angle', 'Góc có số đo', '∠A = 60°', [
      { key: 'name', label: 'Tên góc (bỏ trống nếu chỉ ghi số đo)', ph: 'vd: ABC' },
      { key: 'value', label: 'Số đo', ph: 'vd: 60' }
    ], function (v) {
      // Mũ đặt TRÊN tên góc (\widehat{ABC}), không phải dấu ∠ đứng bên trái (user báo
      // 2026-11-08). Chỉ có số đo thì giữ Unicode "60°" như khuôn "Số đo độ".
      if (v.name && v.value) return '$\\widehat{' + toTex(v.name) + '} = ' + toTex(v.value) + '^{\\circ}$';
      if (v.name) return '$\\widehat{' + toTex(v.name) + '}$';
      if (v.value) return v.value + '°';
      return '';
    }),
    msTpl('Hình học', 'degree', 'Số đo độ', '90°', [
      { key: 'value', label: 'Số đo', ph: 'vd: 90' }
    ], function (v) {
      return v.value ? v.value + '°' : '';
    }),
    msSym('Hình học', '∠', 'Góc'),
    msSym('Hình học', '°', 'Độ'),
    msSym('Hình học', '△', 'Tam giác'),
    msSym('Hình học', '⊥', 'Vuông góc'),
    msSym('Hình học', '∥', 'Song song'),
    msSym('Hình học', '∦', 'Không song song'),
    msSym('Hình học', '≅', 'Bằng nhau (hình)'),
    msSym('Hình học', '∽', 'Đồng dạng'),
    msSym('Hình học', '∼', 'Đồng dạng / tỉ lệ'),
    msSym('Hình học', '≃', 'Tương đương (hình học)'),
    msSym('Hình học', '⌢', 'Cung'),
    msSym('Hình học', '∡', 'Góc (ký hiệu)'),
    msTpl('Hình học', 'vec', 'Vectơ AB (mũi tên trên đầu)', '→AB', [
      { key: 'name', label: 'Tên vectơ', ph: 'vd: AB hoặc u' }
    ], function (v) {
      // Mũi tên nằm TRÊN tên vectơ (\vec{AB}) — "→AB" chỉ là hình trên chip gợi ý,
      // còn chữ chèn vào bài là công thức (user báo 2026-11-08).
      return v.name ? '$\\vec{' + toTex(v.name) + '}$' : '';
    }),

    msTpl('Đại lượng', 'numUnit', 'Số kèm đơn vị', '5 m', [
      { key: 'value', label: 'Số', ph: 'vd: 47' },
      { key: 'unit', label: 'Đơn vị', ph: 'vd: cm', list: true }
    ], function (v) {
      if (!v.value || !v.unit) return '';
      return v.value + ' ' + v.unit;
    }),
    msSym('Đại lượng', 'π', 'Pi'),
    msSym('Đại lượng', '∞', 'Vô cực'),

    msSym('Tập hợp', '∈', 'Thuộc'),
    msSym('Tập hợp', '∉', 'Không thuộc'),
    msSym('Tập hợp', '⊂', 'Tập con'),
    msSym('Tập hợp', '⊃', 'Chứa'),
    msSym('Tập hợp', '⊆', 'Tập con (hoặc bằng)'),
    msSym('Tập hợp', '⊇', 'Tập chứa (hoặc bằng)'),
    msSym('Tập hợp', '⊄', 'Không là tập con'),
    msSym('Tập hợp', '∪', 'Hợp'),
    msSym('Tập hợp', '∩', 'Giao'),
    msSym('Tập hợp', '∅', 'Tập rỗng'),
    msSym('Tập hợp', 'ℕ', 'Số tự nhiên'),
    msSym('Tập hợp', 'ℤ', 'Số nguyên'),
    msSym('Tập hợp', 'ℚ', 'Số hữu tỉ'),
    msSym('Tập hợp', 'ℝ', 'Số thực'),

    /* Các nhóm dưới đây phục vụ đề thi THCS–THPT (trang "Luyện thi" dùng chung bảng
       này với trang luyện tập): chữ Hy Lạp, lôgarit/lượng giác, giải tích, lôgic và
       số học. Ký hiệu MỘT tầng ở đây vẫn là Unicode; chỉ khuôn phải xếp chữ thành hai
       tầng mới sinh LaTeX trong $...$ (xem đầu file). */
    msSym('Chữ Hy Lạp', 'α', 'Anpha', 'alpha anpha'),
    msSym('Chữ Hy Lạp', 'β', 'Bêta', 'beta beta'),
    msSym('Chữ Hy Lạp', 'γ', 'Gamma', 'gamma'),
    msSym('Chữ Hy Lạp', 'δ', 'Đenta', 'delta denta'),
    msSym('Chữ Hy Lạp', 'ε', 'Êpxilon', 'epsilon epxilon'),
    msSym('Chữ Hy Lạp', 'θ', 'Têta', 'theta teta'),
    msSym('Chữ Hy Lạp', 'λ', 'Lamđa', 'lambda lamda'),
    msSym('Chữ Hy Lạp', 'μ', 'Muy', 'mu muy'),
    msSym('Chữ Hy Lạp', 'ν', 'Nuy', 'nu nuy'),
    msSym('Chữ Hy Lạp', 'ρ', 'Rô', 'rho ro'),
    msSym('Chữ Hy Lạp', 'σ', 'Xichma', 'sigma xichma'),
    msSym('Chữ Hy Lạp', 'τ', 'Tô', 'tau to'),
    msSym('Chữ Hy Lạp', 'φ', 'Phi', 'phi'),
    msSym('Chữ Hy Lạp', 'ω', 'Ômêga', 'omega omega'),
    msSym('Chữ Hy Lạp', 'Δ', 'Đenta hoa (biến thiên)', 'delta hoa bien thien'),
    msSym('Chữ Hy Lạp', 'Γ', 'Gamma hoa', 'gamma hoa'),
    msSym('Chữ Hy Lạp', 'Λ', 'Lamđa hoa', 'lambda hoa lamda'),
    msSym('Chữ Hy Lạp', 'Π', 'Pi hoa', 'pi hoa'),
    msSym('Chữ Hy Lạp', 'Σ', 'Xichma hoa', 'sigma hoa xichma hoa'),
    msSym('Chữ Hy Lạp', 'Ω', 'Ômêga hoa', 'omega hoa omego hoa'),

    msTpl('Lôgarit và lượng giác', 'logb', 'Lôgarit cơ số a của b', 'log₂8', [
      { key: 'base', label: 'Cơ số', ph: 'vd: 2 hoặc 10' },
      { key: 'arg', label: 'Đối số', ph: 'vd: 8 hoặc x+1' }
    ], function (v) {
      if (!v.base || !v.arg) return '';
      return 'log' + toSubscript(v.base) + v.arg;
    }),
    msSym('Lôgarit và lượng giác', 'log', 'Lôgarit', 'logarit'),
    msSym('Lôgarit và lượng giác', 'lg', 'Lôgarit thập phân (lg)', 'logarit thap phan'),
    msSym('Lôgarit và lượng giác', 'ln', 'Lôgarit tự nhiên (ln)', 'logarit tu nhien'),
    msSym('Lôgarit và lượng giác', 'sin', 'Sin'),
    msSym('Lôgarit và lượng giác', 'cos', 'Côsin', 'cosin'),
    msSym('Lôgarit và lượng giác', 'tan', 'Tang'),
    msSym('Lôgarit và lượng giác', 'cot', 'Côtang', 'cotang'),

    /* Ba khuôn "cận trên / cận dưới" mà thanh CKEditor không có nút nào làm được:
       tích phân, tổng xích ma và giới hạn. Unicode không xếp chữ thành hai tầng
       trên/dưới được nên phiên bản trước nhồi cận dưới vào chỉ số dưới, cận trên vào
       chỉ số trên ("∫ₐᵇ", "limₓ→₀") — học sinh muốn ghi cận là tham số a, b thì hiện
       ra méo mó, biểu thức dưới lim cũng không đẹp (user báo 2026-11-08). Nay sinh
       LaTeX trong $...$; KaTeX render ở ô "Xem trước" và ở trang kết quả. */
    msTpl('Giải tích', 'intdef', 'Tích phân có cận', '∫ₐᵇ', [
      { key: 'lower', label: 'Cận dưới', ph: 'vd: 0 hoặc a' },
      { key: 'upper', label: 'Cận trên', ph: 'vd: 1 hoặc b' },
      { key: 'expr', label: 'Biểu thức (bỏ trống nếu chỉ ghi dấu tích phân)', ph: 'vd: x²dx' }
    ], function (v) {
      if (!v.lower || !v.upper) return '';
      return '$\\int_{' + toTex(v.lower) + '}^{' + toTex(v.upper) + '}'
        + (v.expr ? ' ' + toTex(v.expr) : '') + '$';
    }),
    msTpl('Giải tích', 'sumdef', 'Tổng có cận (xích ma)', '∑ᵢ₌₁ⁿ', [
      { key: 'from', label: 'Cận dưới', ph: 'vd: i=1' },
      { key: 'to', label: 'Cận trên', ph: 'vd: n' },
      { key: 'expr', label: 'Biểu thức (bỏ trống nếu chỉ ghi dấu tổng)', ph: 'vd: i²' }
    ], function (v) {
      if (!v.from || !v.to) return '';
      return '$\\sum_{' + toTex(v.from) + '}^{' + toTex(v.to) + '}'
        + (v.expr ? ' ' + toTex(v.expr) : '') + '$';
    }),
    msTpl('Giải tích', 'limit', 'Giới hạn (biến tiến tới)', 'limₓ→₀', [
      { key: 'where', label: 'Biến tiến tới (viết dưới lim)', ph: 'vd: x→0 hoặc n→+∞' },
      { key: 'expr', label: 'Biểu thức (bỏ trống nếu chỉ ghi lim)', ph: 'vd: (x²+1)' }
    ], function (v) {
      if (!v.where) return '';
      // "x→0", "x->0" hay "x\to 0" đều thành "x \to 0" dưới dấu lim.
      var sub = toTex(v.where).replace(/\\to|->/g, ' \\to ').replace(/\s+/g, ' ').trim();
      return '$\\lim_{' + sub + '}' + (v.expr ? ' ' + toTex(v.expr) : '') + '$';
    }),
    msSym('Giải tích', '∑', 'Tổng (xích ma)', 'tong sigma xich ma'),
    msSym('Giải tích', '∏', 'Tích (pi)', 'tich pi'),
    msSym('Giải tích', '∫', 'Tích phân', 'tich phan'),
    msSym('Giải tích', 'lim', 'Giới hạn', 'gioi han'),

    /* Tổ hợp – chỉnh hợp (chỉ số n dưới, k trên: hai tầng) và hệ phương trình (dấu
       ngoặc nhọn bao nhiều hàng) cũng sinh LaTeX (user chọn 2026-11-08). */
    msTpl('Tổ hợp – chỉnh hợp', 'comb', 'Tổ hợp C(n, k)', 'Cₙᵏ', [
      { key: 'n', label: 'n (số phần tử)', ph: 'vd: 5' },
      { key: 'k', label: 'k (số phần tử chọn)', ph: 'vd: 2' }
    ], function (v) {
      if (!v.n || !v.k) return '';
      return '$C_{' + toTex(v.n) + '}^{' + toTex(v.k) + '}$';
    }),
    msTpl('Tổ hợp – chỉnh hợp', 'arr', 'Chỉnh hợp A(n, k)', 'Aₙᵏ', [
      { key: 'n', label: 'n (số phần tử)', ph: 'vd: 5' },
      { key: 'k', label: 'k (số phần tử chọn)', ph: 'vd: 2' }
    ], function (v) {
      if (!v.n || !v.k) return '';
      return '$A_{' + toTex(v.n) + '}^{' + toTex(v.k) + '}$';
    }),
    msTpl('Hệ phương trình', 'system', 'Hệ phương trình', '{x+y=2', [
      { key: 'eq1', label: 'Phương trình 1', ph: 'vd: x+y=2' },
      { key: 'eq2', label: 'Phương trình 2', ph: 'vd: x-y=0' },
      { key: 'eq3', label: 'Phương trình 3 (bỏ trống nếu hệ chỉ có 2)', ph: 'vd: 2x+z=3' }
    ], function (v) {
      if (!v.eq1 || !v.eq2) return '';
      var rows = [toTex(v.eq1), toTex(v.eq2)];
      if (v.eq3) rows.push(toTex(v.eq3));
      return '$\\begin{cases}' + rows.join(' \\\\ ') + '\\end{cases}$';
    }),

    msSym('Lôgic và suy luận', '⇒', 'Suy ra', 'suy ra'),
    msSym('Lôgic và suy luận', '⇔', 'Tương đương', 'tuong duong'),
    msSym('Lôgic và suy luận', '→', 'Tiến tới / suy ra', 'tien toi suy ra'),
    msSym('Lôgic và suy luận', '↔', 'Tương đương (mũi tên đôi)', 'tuong duong'),
    msSym('Lôgic và suy luận', '∀', 'Với mọi', 'voi moi'),
    msSym('Lôgic và suy luận', '∃', 'Tồn tại', 'ton tai'),
    msSym('Lôgic và suy luận', '∄', 'Không tồn tại', 'khong ton tai'),
    msSym('Lôgic và suy luận', '∵', 'Vì', 'vi'),
    msSym('Lôgic và suy luận', '∴', 'Do đó', 'do do'),
    msSym('Lôgic và suy luận', '¬', 'Phủ định', 'phu dinh'),
    msSym('Lôgic và suy luận', '∧', 'Và (hội)', 'va hoi'),
    msSym('Lôgic và suy luận', '∨', 'Hoặc (tuyển)', 'hoac tuyen'),

    msTpl('Số học', 'abs', 'Giá trị tuyệt đối', '|a|', [
      { key: 'expr', label: 'Biểu thức', ph: 'vd: -3 hoặc x-1' }
    ], function (v) {
      return v.expr ? '|' + v.expr + '|' : '';
    }),
    msTpl('Số học', 'floor', 'Phần nguyên (⌊x⌋)', '⌊a⌋', [
      { key: 'expr', label: 'Biểu thức', ph: 'vd: x hoặc 2,5' }
    ], function (v) {
      return v.expr ? '⌊' + v.expr + '⌋' : '';
    }),
    msTpl('Số học', 'ceil', 'Trần (⌈x⌉)', '⌈a⌉', [
      { key: 'expr', label: 'Biểu thức', ph: 'vd: x hoặc 2,5' }
    ], function (v) {
      return v.expr ? '⌈' + v.expr + '⌉' : '';
    }),
    msSym('Số học', '⋮', 'Chia hết', 'chia het'),
    msSym('Số học', '∤', 'Không chia hết', 'khong chia het'),
    msSym('Số học', '≡', 'Đồng dư', 'dong du')
  ];

  function findSuggestion(id) {
    for (var i = 0; i < MS_SUGGESTIONS.length; i++) {
      if (MS_SUGGESTIONS[i].id === id) return MS_SUGGESTIONS[i];
    }
    return null;
  }

  /* Chữ chèn vào bài cho một gợi ý. values là {key: chữ đã gõ}; ô của khuôn được cắt
     khoảng trắng trước khi dùng để "3 " không thành "3 /4". Gợi ý không có ô thì trả
     đúng ký tự. Khuôn thiếu ô bắt buộc -> chuỗi rỗng, UI coi đó là "chưa chèn được". */
  function buildInsert(id, values) {
    var s = findSuggestion(id);
    if (!s) return '';
    if (!s.slots.length) return String(s.sym || '');
    var v = {};
    for (var i = 0; i < s.slots.length; i++) {
      var key = s.slots[i].key;
      v[key] = String(values && values[key] != null ? values[key] : '').trim();
    }
    return String(s.build ? s.build(v) : '');
  }

  /* Lọc theo tên, ký tự, nhóm hoặc từ khoá không dấu ("can", "pt", "don vi"). */
  function filterSuggestions(query) {
    var q = foldVi(query);
    if (!q) return MS_SUGGESTIONS.slice();
    var out = [];
    for (var i = 0; i < MS_SUGGESTIONS.length; i++) {
      var s = MS_SUGGESTIONS[i];
      if (foldVi(s.name + ' ' + s.group + ' ' + s.words + ' ' + s.sym).indexOf(q) >= 0) {
        out.push(s);
      }
    }
    return out;
  }

  var LAW = {
    SUGGESTIONS: MS_SUGGESTIONS,
    UNITS: MS_UNITS,
    VULGAR: MS_VULGAR,
    toSuperscript: toSuperscript,
    toSubscript: toSubscript,
    buildInsert: buildInsert,
    filterSuggestions: filterSuggestions,
    find: findSuggestion,
    foldVi: foldVi
  };
  window.__mathSuggestLaw = LAW;
  /* ========================== hết phần luật thuần ============================== */

  var S = window.__mathSuggest = window.__mathSuggest || {
    qid: '',        // câu đang mở panel
    mode: 'list',   // 'list' | 'form'
    id: '',         // gợi ý đang có ô nhập riêng
    mem: {},        // id -> values đã dùng lần trước, để điền lại
    panel: null
  };
  /* Host đã gắn nút: key -> editor CKEditor hoặc <textarea>. Bảng gợi ý vốn chỉ
     biết ô tự luận của học sinh (essay_<qid>); quản trị cũng cần nó ở các ô soạn
     khác, nên thay vì đoán tên field, lối chèn chữ tìm tới đúng phần tử đã mount. */
  if (!S.hosts) S.hosts = {};

  var PANEL_ID = 'ms-panel';
  var DATALIST_ID = 'ms-units';

  function editors() { return window.__essayEditors || {}; }

  /* Editor của key này: danh bạ sống thắng host đã mount, vì mảnh AJAX có thể đã thay
     editor nhưng host cũ vẫn còn trong bảng tới lần gắn nút tiếp theo. */
  function editorOf(key) {
    var live = editors()[key];
    if (live) return live;
    var h = S.hosts[key];
    return h && h.model && h.isConnected !== false ? h : null;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent: không bao giờ ăn HTML
    return n;
  }

  function textareaOf(key) {
    var h = S.hosts[key];
    if (h && h.tagName === 'TEXTAREA' && h.isConnected !== false) return h;
    return document.querySelector('textarea[name="essay_' + key + '"]')
      || document.querySelector('textarea[name="short_' + key + '"]');
  }

  /* ---- chèn chữ vào con trỏ: đi qua editor, cùng lối với typing_suggest.js ---- */
  function insertIntoEditor(qid, text) {
    var ed = editorOf(qid);
    if (!ed) return false;
    // Công thức trong cặp $...$: nhường cho bộ soạn thảo vẽ KaTeX ngay trong ô
    // (window.essayInsertMath ở essay_editor.js) để học sinh thấy công thức đã render
    // thay vì mã LaTeX thô; chuỗi không có công thức thì trả về false và chèn như chữ.
    if (window.essayInsertMath && window.essayInsertMath(ed, text)) return true;
    try {
      ed.model.change(function (w) {
        var pos = ed.model.document.selection.getFirstPosition();
        w.insertText(text, pos);
        try {
          w.setSelection(ed.model.createPositionAt(pos.parent, pos.offset + text.length));
        } catch (e) { /* bản CKEditor cũ không có setSelection: chữ đã chèn là đủ */ }
      });
      return true;
    } catch (e) {
      try { ed.execute('input', { text: text }); return true; } catch (e2) { return false; }
    }
  }

  function insertIntoTextarea(ta, text) {
    if (!ta) return false;
    var v = String(ta.value || '');
    var caret = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    var end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : caret;
    ta.value = v.slice(0, caret) + text + v.slice(end);
    ta.selectionStart = ta.selectionEnd = caret + text.length;
    // cho typing_suggest/voice đọc được chữ mới, và form thấy value đã đổi
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* cũ */ }
    return true;
  }

  function insertText(qid, text) {
    if (!text) return false;
    if (insertIntoEditor(qid, text)) return true;
    return insertIntoTextarea(textareaOf(qid), text);
  }

  /* ------------------------------- panel ---------------------------------- */
  function panel() {
    var p = document.getElementById(PANEL_ID);
    if (p) return p;
    p = el('div', 'ms-panel');
    p.id = PANEL_ID;
    p.appendChild(el('div', 'ms-head'));
    p.appendChild(el('div', 'ms-body'));
    p.appendChild(el('div', 'ms-foot'));
    var dl = el('datalist');
    dl.id = DATALIST_ID;
    LAW.UNITS.forEach(function (u) {
      var o = el('option');
      o.value = u;
      dl.appendChild(o);
    });
    p.appendChild(dl);
    p.addEventListener('mousedown', function (ev) {
      // panel sống ngoài editor: giữ focus cho ô nhập của panel nhưng không cho
      // CKEditor mất selection lúc bấm chuột vào ô chữ
      if (ev.target.tagName !== 'INPUT') ev.preventDefault();
    });
    document.body.appendChild(p);
    return p;
  }

  function part(cls) {
    return panel().querySelector('.' + cls);
  }

  function show(anchor) {
    var p = panel();
    var rect = anchor.getBoundingClientRect();
    p.style.display = 'block';
    var left = Math.max(4, rect.left + window.pageXOffset);
    var width = p.offsetWidth || 320;
    if (left + width > window.pageXOffset + document.documentElement.clientWidth - 8) {
      left = Math.max(4, window.pageXOffset + document.documentElement.clientWidth - width - 8);
    }
    p.style.left = left + 'px';
    p.style.top = (rect.bottom + window.pageYOffset + 4) + 'px';
  }

  function close() {
    S.qid = '';
    S.mode = 'list';
    S.id = '';
    if (S.panel) S.panel.style.display = 'none';
  }

  function status(msg, ok) {
    var f = part('ms-foot');
    f.textContent = '';
    f.appendChild(el('div', 'ms-status' + (ok ? ' ms-ok' : ''), msg));
  }

  /* Hàng gợi ý: ký tự to + tên nhỏ. Có ô nhập riêng thì viền đứt, kèm dấu "⌨" để
     học sinh biết chọn xong còn phải gõ tiếp. */
  function chipFor(sug) {
    var chip = el('button', 'ms-chip' + (sug.slots.length ? ' ms-tpl' : ''));
    chip.type = 'button';
    chip.appendChild(el('span', 'ms-sym', sug.sym));
    chip.appendChild(el('span', 'ms-name', sug.name + (sug.slots.length ? ' ⌨' : '')));
    chip.title = sug.slots.length
      ? 'Điền vào ô riêng rồi chèn: ' + sug.name
      : 'Chèn ' + sug.name;
    chip.addEventListener('click', function () { pick(sug); });
    return chip;
  }

  function renderList() {
    S.mode = 'list';
    S.id = '';
    var head = part('ms-head');
    var body = part('ms-body');
    head.textContent = '';
    body.textContent = '';
    head.style.display = 'flex';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ms-filter';
    input.placeholder = 'Tìm gợi ý: "can", "phan so", "don vi"...';
    input.addEventListener('input', function () { renderChips(input.value); });
    head.appendChild(input);
    var x = el('button', 'ms-close', '×');
    x.type = 'button';
    x.title = 'Đóng';
    x.addEventListener('click', close);
    head.appendChild(x);

    renderChips('');
    window.setTimeout(function () { try { input.focus(); } catch (e) { /* cũ */ } }, 0);
  }

  function renderChips(query) {
    var body = part('ms-body');
    body.textContent = '';
    var list = LAW.filterSuggestions(query);
    if (!list.length) {
      body.appendChild(el('div', 'ms-empty', 'Không có gợi ý nào khớp "' + query + '".'));
      return;
    }
    var lastGroup = '';
    list.forEach(function (sug) {
      if (sug.group !== lastGroup) {
        lastGroup = sug.group;
        body.appendChild(el('div', 'ms-group', sug.group));
      }
      body.appendChild(chipFor(sug));
    });
  }

  function readValues(sug) {
    var v = {};
    var inputs = part('ms-body').querySelectorAll('.ms-slot-input');
    for (var i = 0; i < inputs.length; i++) {
      v[inputs[i].getAttribute('data-key')] = inputs[i].value;
    }
    return v;
  }

  function renderForm(sug) {
    S.mode = 'form';
    S.id = sug.id;
    part('ms-head').style.display = 'none';
    var body = part('ms-body');
    body.textContent = '';
    body.appendChild(el('div', 'ms-form-title', sug.name));

    var saved = S.mem[sug.id] || {};
    sug.slots.forEach(function (slot) {
      body.appendChild(el('label', 'ms-slot-label', slot.label));
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'ms-slot-input';
      input.setAttribute('data-key', slot.key);
      input.placeholder = slot.ph || '';
      if (slot.list) input.setAttribute('list', DATALIST_ID);
      input.value = saved[slot.key] || '';
      input.addEventListener('input', function () { preview(sug); });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); confirmInsert(sug); }
        else if (ev.key === 'Escape') { ev.preventDefault(); renderList(); }
      });
      body.appendChild(input);
    });

    body.appendChild(el('div', 'ms-preview-label', 'Xem trước:'));
    body.appendChild(el('div', 'ms-preview', ''));

    var row = el('div', 'ms-actions');
    var go = el('button', 'ms-btn-primary', 'Chèn');
    go.type = 'button';
    go.addEventListener('click', function () { confirmInsert(sug); });
    var back = el('button', 'ms-btn-ghost', '← Danh sách');
    back.type = 'button';
    back.addEventListener('click', function () { renderList(); });
    row.appendChild(go);
    row.appendChild(back);
    body.appendChild(row);

    preview(sug);
    var first = body.querySelector('.ms-slot-input');
    window.setTimeout(function () {
      try { first.focus(); first.select(); } catch (e) { /* cũ */ }
    }, 0);
  }

  /* Xem trước: khuôn hai tầng sinh LaTeX trong $...$ nên phải render bằng KaTeX cho
     khớp trang kết quả. KHÔNG ghi chuỗi thành HTML (panel không bao giờ nhận chữ của
     người dùng làm markup); KaTeX.render ghi thẳng vào phần tử, chữ thường thì là text node. */
  function preview(sug) {
    var text = LAW.buildInsert(sug.id, readValues(sug));
    var box = part('ms-preview');
    box.textContent = '';
    if (!text) { box.textContent = '—'; return; }
    var katex = window.katex;
    var re = /\$([^$\n]+?)\$/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) box.appendChild(document.createTextNode(text.slice(last, m.index)));
      var span = document.createElement('span');
      if (katex && typeof katex.render === 'function') {
        try { katex.render(m[1], span, { throwOnError: false }); }
        catch (e) { span.textContent = m[0]; }
      } else {
        span.textContent = m[0];
      }
      box.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) box.appendChild(document.createTextNode(text.slice(last)));
  }

  function confirmInsert(sug) {
    var values = readValues(sug);
    var text = LAW.buildInsert(sug.id, values);
    if (!text) { status('Điền đủ các ô để chèn.', false); return false; }
    if (!insertText(S.qid, text)) {
      status('Không chèn được vào bài — hãy gõ tay: ' + text, false);
      return false;
    }
    S.mem[sug.id] = values;
    status('Đã chèn "' + text + '".', true);
    renderList();   // ở lại danh sách để chèn tiếp ký hiệu khác
    return true;
  }

  function pick(sug) {
    if (sug.slots.length) { renderForm(sug); return true; }
    var text = LAW.buildInsert(sug.id, {});
    if (!insertText(S.qid, text)) { status('Không chèn được — hãy gõ tay: ' + text, false); return false; }
    status('Đã chèn "' + text + '".', true);
    return true;
  }

  /* ------------------------ gắn nút vào toolbar ----------------------------- */
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

  function buttonHtml() {
    var btn = el('button', 'ck ck-button ck-button_with-text ms-ck-btn');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.setAttribute('title', 'Chèn ký hiệu toán học vào bài');
    btn.appendChild(el('span', 'ck-button__label', 'Gợi ý ∑'));
    return btn;
  }

  function bindButton(btn, qid) {
    // mousedown.preventDefault: giữ con trỏ ở nguyên chỗ đang gõ trong CKEditor,
    // nếu không selection nhảy về đầu bài và chữ chèn sai chỗ.
    btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (S.panel && S.qid === qid && S.panel.style.display === 'block') { close(); return; }
      S.qid = qid;
      renderList();
      S.panel = panel();
      show(btn);
    });
  }

  function mountButton(host, qid) {
    var btn = buttonHtml();
    bindButton(btn, qid);
    host.appendChild(btn);
    return btn;
  }

  /* Nút tạm trên textarea (lúc CKEditor chưa tải được). Khi editor dựng xong ở lượt
     sau, textarea bị ẩn nhưng hàng bar này vẫn còn nhìn thấy -> gỡ bỏ, để một ô chỉ
     có một nút "Gợi ý ∑". */
  function dropPlainBar(qid) {
    [].slice.call(document.querySelectorAll('.ms-plain-bar')).forEach(function (bar) {
      if (bar.getAttribute('data-ms-key') !== qid) return;
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });
  }

  /* host = editor CKEditor (gắn vào thanh công cụ) hoặc textarea (CKEditor không tải
     được — học sinh vẫn cần lối chèn ký hiệu). Gọi một lần cho mỗi host. */
  function mount(host, qid) {
    if (!host || !qid) return null;
    if (host.tagName === 'TEXTAREA') {
      if (host.dataset.mathSuggest) return null;
      host.dataset.mathSuggest = '1';
      S.hosts[qid] = host;
      var wrap = el('div', 'ms-plain-bar');
      wrap.setAttribute('data-ms-key', qid);
      var plain = el('button', 'ms-plain-btn', 'Gợi ý ∑');
      plain.type = 'button';
      bindButton(plain, qid);
      wrap.appendChild(plain);
      if (host.parentNode) host.parentNode.insertBefore(wrap, host);
      S.panel = panel();
      return plain;
    }
    var bar = toolbarOf(host);
    if (!bar || bar.dataset.mathSuggest) return null;
    bar.dataset.mathSuggest = '1';
    S.hosts[qid] = host;
    dropPlainBar(qid);
    S.panel = panel();
    return mountButton(bar, qid);
  }

  /* Đóng panel khi click ra ngoài hoặc bấm Escape ở bất kỳ đâu. Gắn một lần trên
     document vì trang nạp lại mảnh nội dung qua AJAX. */
  if (!S.bound) {
    S.bound = true;
    document.addEventListener('click', function (ev) {
      var p = document.getElementById(PANEL_ID);
      if (!p || p.style.display === 'none') return;
      if (p.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest('.ms-ck-btn, .ms-plain-btn')) return;
      close();
    }, true);
    document.addEventListener('keydown', function (ev) {
      var p = document.getElementById(PANEL_ID);
      if (ev.key === 'Escape' && p && p.style.display === 'block') {
        ev.stopPropagation();
        close();
      }
    }, true);
  }

  window.mathSuggestMount = mount;
  window.mathSuggestClose = close;
  window.mathSuggestInsert = function (qid, id, values) {
    return insertText(qid, LAW.buildInsert(id, values || {}));
  };
  /* Chèn một chuỗi bất kì vào ô đang soạn — bộ mic "nói -> ký hiệu toán"
     (static/js/voice_math.js) dùng lối này thay vì mở lại đường chèn riêng. */
  window.mathSuggestText = function (qid, text) {
    return insertText(qid, String(text == null ? '' : text));
  };
})();
