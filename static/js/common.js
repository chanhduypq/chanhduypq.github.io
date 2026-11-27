/* ==========================================================================
   common.js — các hàm JS dùng chung cho nhiều trang
   ========================================================================== */

/* -----------------------------------------------------------------------
   GIẢI MÃ SSE — chiều ngược lại của utils.sse_escape bên Python.
   Server gửi `\\` cho một backslash và `\n` cho một dấu xuống dòng. Hai loại
   phải đọc trong MỘT lượt: chỉ thay `\n` trước đây đã ăn mất hai ký tự đầu
   của `\ne`, nên "$c \ne 0$" thành "$c<LF>e 0$" — regex toán của renderMd
   loại chuỗi có xuống dòng nên KaTeX không render, học sinh thấy nguyên
   "$c e 0$".
----------------------------------------------------------------------- */
function sseUnescape(s) {
  return String(s).replace(/\\\\|\\n/g, function (m) {
    return m === '\\n' ? '\n' : '\\';
  });
}
window.sseUnescape = sseUnescape;

/* -----------------------------------------------------------------------
   Chuẩn hóa góc theo SGK Việt Nam: mũ nằm TRÊN ký tự (\widehat{ABC})
   thay vì dấu ∠ đứng bên trái.
----------------------------------------------------------------------- */
function angleToWidehat(tex) {
  return String(tex)
    .replace(/\\angle\s*([A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,5})/g, '\\widehat{$1}')
    .replace(/∠\s*([A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,5})/g, '\\widehat{$1}');
}

/* MŨ GÓC KHÔNG ĐƯỢC CHỤP LÊN DẤU PRIME: "\widehat{ABy'}" -> "\widehat{ABy}'".
   "\widehat" là mũ RỘNG, hai đầu vểnh lên, nên prime cuối tên góc bị đè nằm GÓC
   MŨ chứ không phải trên phải như SGK in (user báo ở đề lớp 7: "∠ABy′ = 140°"
   hiện ra không đọc được tên góc). Đưa prime ra ngoài ngoặc thì KaTeX đặt nó
   trong <msup> bọc lấy <mover> — prime đứng kề chữ cuối, mũ ngắn lại đúng một
   ký tự. Thứ tự chữ hiển thị không đổi, nên "\widehat{x'Oy'}" vẫn là góc x'Oy′:
   prime GIỮA (của chữ x) ở nguyên trong mũ, chỉ prime cuối cùng bị dịch ra.
   Mũ rỗng sau luật ("{\prime}" chỉ có prime) không được phép sinh "\widehat{}"
   — KaTeX báo lỗi với đối tượng rỗng — nên phần thân bắt buộc có một ký tự. */
var HAT_PRIME_RE = /(\\(?:wide)?hat)\{([^{}]+?)((?:['\u2032])+)\}/g;

function primeOutOfHat(tex) {
  return String(tex).replace(HAT_PRIME_RE, '$1{$2}$3');
}

function fixAngleMath(expr) {
  return primeOutOfHat(angleToWidehat(expr)).replace(/(\d)\s*°/g, '$1^{\\circ}');
}

/* "√(25)" / "√25" / "\sqrt(25)" -> "\sqrt{25}" (có vạch căn trên biểu thức) */
var RADICAL_SRC = '(?:√|\\\\sqrt)\\s*(?:\\(\\s*([^()\\n]+?)\\s*\\)|\\{\\s*([^{}\\n]+?)\\s*\\}|(\\d+(?:[.,]\\d+)?|[A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,4}))';
function fixRadicals(s) {
  return String(s).replace(new RegExp(RADICAL_SRC, 'g'), function(m, a, b, c) {
    return '\\sqrt{' + (a !== undefined ? a : (b !== undefined ? b : c)) + '}';
  });
}
window.angleToWidehat = angleToWidehat;
window.primeOutOfHat = primeOutOfHat;
window.fixAngleMath = fixAngleMath;
window.fixRadicals = fixRadicals;

/* Môi trường nhiều dòng (cases/aligned/matrix): AI thường ngắt hàng bằng `\ `
   (backslash + dấu cách) thay vì `\\`, nên KaTeX dồn cả hệ phương trình thành
   một dòng. Chỉ đổi backslash ĐƠN độc, giữ nguyên `\\` đã đúng. */
function fixEnvRows(s) {
  return String(s).replace(
    /\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}/g,
    function (env) { return env.replace(/(?<!\\)\\(?= )/g, '\\\\'); });
}
window.fixEnvRows = fixEnvRows;

/* Cột "đặt tính" kiểu TeX: "{c@{}c}" bỏ hẳn khoảng giữa hai cột (glue "@{}").
   KaTeX 0.16.9 KHÔNG hiểu "@{...}" trong khai báo cột của array/matrix và báo
   "Unknown column alignment: @", throwOnError:false nên kết quả là hộp đỏ in
   NGUYÊN mã LaTeX (lỗi user báo ở bài học lớp 6). KaTeX cũng không có cách
   viết tương đương, nên thay glue bằng cột thường: "{c@{}c}" -> "{cc}". Chỉ
   được xoá phần glue theo sau "@" — cả dạng có ngoặc "{c@{\,}c}" lẫn dạng không
   ngoặc "{c@\quad c}" — vì nó chỉ là khoảng trắng, không đổi số cột hay thứ tự
   cột; "{r}", "{c|c}" giữ nguyên. */
var ARRAY_PREAMBLE_RE =
  /(\\begin\{(?:array|subarray|smallmatrix|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}\s*\{)((?:[^{}]|\{[^{}]*\})*)(\})/g;
/* "@" trong khai báo cột luôn đi cùng một cỡ khoảng: hoặc "{...}", hoặc một
   lệnh ("@\quad", "@\!", "@\,"); ngoài khai báo cột thì "@" chỉ là chữ thường. */
var ARRAY_GLUE_RE = /@(?:\{[^{}]*\}|\\(?:[a-zA-Z]+|[,:;!]))/g;

function fixArrayPreamble(s) {
  return String(s).replace(ARRAY_PREAMBLE_RE, function (m, head, spec, tail) {
    var cleaned = spec.replace(ARRAY_GLUE_RE, '');
    return cleaned ? head + cleaned + tail : m;
  });
}
window.fixArrayPreamble = fixArrayPreamble;

/* -----------------------------------------------------------------------
   Render toán học LaTeX sang KaTeX — trả về HTML đã render
----------------------------------------------------------------------- */
window.renderMath = function(text) {
  if (!window.katex) return text;
  var parts = [];
  // Display math: $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, function(m, expr) {
    try {
      var html = katex.renderToString(gapUnitsInMath(fixLimitNotation(fixArrayPreamble(fixEnvRows(fixAngleMath(expr.trim()))))), { displayMode: true, throwOnError: false });
      parts.push(html);
      return '\x00M' + (parts.length - 1) + '\x00';
    } catch(e) { return m; }
  });
  // Inline math: $...$
  text = text.replace(/\$([^\$\n]+?)\$/g, function(m, expr) {
    try {
      var html = katex.renderToString(gapUnitsInMath(fixLimitNotation(fixArrayPreamble(fixEnvRows(fixAngleMath(expr.trim()))))), { displayMode: false, throwOnError: false });
      parts.push(html);
      return '\x00M' + (parts.length - 1) + '\x00';
    } catch(e) { return m; }
  });
  // Khôi phục placeholder
  text = text.replace(/\x00M(\d+)\x00/g, function(m, idx) {
    return parts[parseInt(idx)];
  });
  return text;
};

/* -----------------------------------------------------------------------
   Render markdown đơn giản thành HTML (có hỗ trợ KaTeX)
----------------------------------------------------------------------- */

/* Macro LaTeX -> ký hiệu Unicode (bản JS của _apply_latex_macros trong
   math_symbols.py). KaTeX lấy từ CDN nên khi không tải được, học sinh thấy
   nguyên "\notin"; ký hiệu Unicode thì hiển thị được ở cả hai đường.
   KHÔNG đổi \{ \} \frac (mất backslash là KaTeX hiểu thành nhóm/toán tử khác)
   và \angle (đã có lớp \widehat lo).
   Thứ tự dài -> ngắn để "\in" không ăn bớt phần đầu của "\infty". */
var LATEX_UNICODE = {
  '\\not\\in': '∉', '\\notin': '∉',
  '\\subseteq': '⊆', '\\supseteq': '⊇', '\\subset': '⊂', '\\supset': '⊃',
  '\\geqslant': '≥', '\\leqslant': '≤', '\\geq': '≥', '\\leq': '≤',
  '\\ge': '≥', '\\le': '≤',
  '\\neq': '≠', '\\ne': '≠', '\\equiv': '≡', '\\approx': '≈', '\\in': '∈',
  '\\times': '×', '\\cdot': '×', '\\div': ':',
  '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅', '\\varnothing': '∅',
  '\\infty': '∞', '\\pm': '±', '\\perp': '⊥', '\\parallel': '//',
  '\\to': '→', '\\triangle': '△'
};
var MATHBB = { 'N': 'ℕ', 'Z': 'ℤ', 'Q': 'ℚ', 'R': 'ℝ' };
var LATEX_MACRO_RE = /(?<!\\)\\(?:not\\in|notin|subseteq|supseteq|subset|supset|geqslant|leqslant|geq|leq|ge|le|neq|ne|equiv|approx|in|times|cdot|div|cup|cap|emptyset|varnothing|infty|pm|perp|parallel|to|triangle)(?![A-Za-z])/g;

// Lời giải cũ bị parser làm mất "u": \nderset -> \underset.
function fixLimitNotation(expr) {
  return String(expr).replace(/(?<!\\)\\nderset(?![A-Za-z])/g, '\\underset');
}
window.fixLimitNotation = fixLimitNotation;

function fixLatexMacros(s) {
  return String(s)
    .replace(/\\mathbb\s*\{\s*([NZQR])\s*\}/g, function (m, g) { return MATHBB[g]; })
    .replace(LATEX_MACRO_RE, function (m) { return LATEX_UNICODE[m]; })
    .replace(/\^\s*\\circ(?![A-Za-z])/g, '°');
}
window.fixLatexMacros = fixLatexMacros;

/* -----------------------------------------------------------------------
   KÝ HIỆU LaTeX Ở CHỮ TRẦN — bản JS của các luật trong math_symbols.py
   (_unwrap_text_units, _space_units_in_math, _plain_math_rules), ba khuyết tật
   user báo:
     * "220 \text{cm}^2" và "10\,cm" nằm NGOÀI cặp $...$: KaTeX chỉ render nội
       dung được $ bọc nên học sinh thấy cả tên lệnh. "\text{...}" chỉ là đoạn
       văn thường trong chế độ toán -> bỏ vỏ ngoặc, lấy chữ bên trong; "\,"
       "\;" "\:" ngoài công thức cũng chỉ là một khoảng trắng.
     * "$22 \text{cm}$" nằm BEN TRONG $...$ thì ngược lại: TeX coi khoảng trắng
       giữa số và \text là ký tự tách từ nên in ra "22cm" dính, trái chuẩn SGK
       ("3 m²", xem spaceNumberUnits bên dưới). Tách bằng "~" — "~" là khoảng
       trắng buộc trong chế độ toán, KaTeX giữ nguyên.
     * "cm^2" trong chữ trần: Flask đổi thành "cm²" (luật _plain_math_rules)
       còn hộp lời giải AI thì không, nên cùng một nội dung hiển thị hai kiểu.
   `(?<!\\)` chặn hai backslash liền nhau: "\\" là lệnh ngắt hàng trong môi
   trường LaTeX; không chặn thì "\ y" bị đổi thành khoảng trắng và lời giải mất
   ngắt hàng.
   ----------------------------------------------------------------------- */
var LATEX_TEXT_UNIT_RE = /(?<!\\)\\(?:text|textrm|mathrm|mathsf|operatorname)\s*\{([^{}]{1,24})\}/g;
var LATEX_TEX_SPACE_RE = /(?<!\\)\\([,;: ])/g;
/* $$...$$ (toán hiển thị) phải được che TRƯỚC $...$, cùng thứ tự bản Python
   (_MATH_SPAN trong math_symbols.py). Regex cũ `\$[^$]*\$` cắt hai dấu `$$`
   thành một span rỗng nên nội dung bên trong bị xử như văn thường: đơn vị
   "\text{cm}" bị bóc vỏ (KaTeX in "cm" nghiêng lệch, sai chuẩn SGK) và luật
   khoảng "~" giữa số với đơn vị không chạy. */
var LATEX_MATH_SPAN_RE = /\$\$[\s\S]*?\$\$|\$[^$]*\$/g;
var LATEX_UNIT_PROBE = /\\(?:text|textrm|mathrm|mathsf|operatorname)\s*\{|(?<!\\)\\([,;: ])|\^\s*\{?-?\d/;
var MATH_GLUED_UNIT_RE = /(\d)\s*(?=(?<!\\)\\(?:text|textrm|mathrm|mathsf|operatorname)\s*\{)/g;
/* Đơn vị viết chữ trần BEN TRONG công thức ("$120m$", "$60cm^2$"): chế độ toán
   của TeX ăn khoảng trắng nên in ra dính — cùng lớp lỗi user báo ("22cm"). Hai
   nhóm như _BARE_UNIT_IN_MATH bên math_symbols.py: nhiều chữ thì đổi thành
   "\text{...}" (không thể là biến), một chữ (m, g, l, t) thì chỉ chen "~" vì
   "2m" còn có thể là biến đại số, để đứng chữ lên là đổi nghĩa. */
var UNIT_MATH_MULTI = 'km|hm|dam|mm|cm|dm|mg|kg|hg|dag|ml|cl|dl|ha';
var UNIT_MATH_SINGLE = 'm|g|l|t';
/* `[ \t]*` (không `\s`, cũng không qua xuống dòng): renderMd cho lượt khoảng
   trắng đơn vị chạy trên TOÀN BỘ chuỗi, trước khi $$...$$ / $...$ bị che, nên
   "$15cm$" đã thành "$15 cm$" lúc gapUnitsInMath được gọi. Chấp khoảng trắng ở
   đây để chuỗi ấy vẫn nhận được "~" — TeX ăn khoảng trắng thường nên "~" vẫn
   cần để chuyển nó thành khoảng buộc. */
var BARE_UNIT_IN_MATH_RE = new RegExp('(\\d)[ \\t]*(' + UNIT_MATH_MULTI + ')(?![A-Za-z0-9])', 'g');
var BARE_SHORT_UNIT_IN_MATH_RE = new RegExp('(\\d)[ \\t]*(' + UNIT_MATH_SINGLE + ')(?![A-Za-z0-9])', 'g');
/* Mũ viết trần và dấu phẩy ngăn hai đầu mút khoảng — bản JS của _plain_math_rules
   trong math_symbols.py. Thiếu luật này thì cùng một chuỗi trong DB, trang do
   Flask in ra hiện "cm²" còn hộp lời giải AI (renderMd) hiện "cm^2". */
var SUPERSCRIPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
                    '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺' };
var BARE_POWER_RE = /\^\s*(?:\{(-?\d{1,3})\}|(-?\d{1,3}))/g;
var MATH_ENDPOINT = '[-+]?\\d+(?:[.,]\\d+)?|[-+]?\\s*∞';
/* Nhóm 1 = dấu ngoặc KÈM CẢ khoảng trắng sau nó, dùng như `_ENDPOINT` bên Python,
   để "( 2 , 3 )" ra "( 2; 3 )" thay vì "(2; 3 )". */
var BARE_INTERVAL_RE = new RegExp('([\\(\\[]\\s*)(' + MATH_ENDPOINT + ')\\s*,\\s*('
                                  + MATH_ENDPOINT + ')(\\s*[\\)\\]])', 'g');

/* Che mọi $...$ và $$...$$, cho `fn` chạy trên chữ văn thường rồi trả ven
   công thức về — bản JS của _outside_math trong math_symbols.py. */
function outsideMath(text, fn) {
  var keep = [];
  var masked = String(text == null ? '' : text).replace(LATEX_MATH_SPAN_RE, function (m) {
    keep.push(m);
    return '\x00LTX' + (keep.length - 1) + '\x00';
  });
  return fn(masked).replace(/\x00LTX(\d+)\x00/g, function (m, i) { return keep[parseInt(i)]; });
}

/* Bỏ vỏ LaTeX ở phần văn thường, giữ nguyên mọi $...$ (cùng kiểu che với
   withLinksMasked: luật chạy trên chữ hiển thị, không được đụng công thức). */
function unwrapTextUnits(chunk) {
  return String(chunk).replace(LATEX_TEXT_UNIT_RE, '$1').replace(LATEX_TEX_SPACE_RE, ' ');
}

function unwrapLatexText(s) {
  var text = String(s == null ? '' : s);
  if (text.indexOf('\\') < 0) return text;
  return outsideMath(text, unwrapTextUnits);
}

/* Trong biểu thức đã nằm gọn $...$: tách số khỏi đơn vị bằng "~" — TeX ăn
   khoảng trắng thường nên phải dùng khoảng trắng buộc. Bản JS của
   _space_units_in_math: "\text{...}" đã có thì chen "~", chữ trần thì đổi
   thành "\text{...}" (nhiều ký tự) hoặc chỉ chen "~" (một ký tự). Che
   "\text{...}" trước lúc dò chữ trần để không sinh vỏ lồng "\text{120~\text{m}}"
   mà KaTeX từ chối render. */
function gapUnitsInMath(expr) {
  var s = String(expr == null ? '' : expr).replace(MATH_GLUED_UNIT_RE, '$1~');
  var keep = [];
  s = s.replace(LATEX_TEXT_UNIT_RE, function (m) {
    keep.push(m);
    return '\x00U' + (keep.length - 1) + '\x00';
  });
  s = s.replace(BARE_UNIT_IN_MATH_RE, '$1~\\text{$2}');
  s = s.replace(BARE_SHORT_UNIT_IN_MATH_RE, '$1~$2');
  return s.replace(/\x00U(\d+)\x00/g, function (m, i) { return keep[parseInt(i)]; });
}

/* Chữ trần ngoài công thức: "x^2" -> "x²", "(2, +∞)" -> "(2; +∞)". */
function plainMathRules(chunk) {
  return String(chunk)
    .replace(BARE_INTERVAL_RE, function (m, open, a, b, close) {
      return open + a + '; ' + b + close;
    })
    .replace(BARE_POWER_RE, function (m, braced, bare) {
      var exp = braced !== undefined ? braced : bare;
      var out = '';
      for (var i = 0; i < exp.length; i++) out += SUPERSCRIPT[exp[i]] || ('^' + exp[i]);
      return out;
    });
}

function plainMathOutsideMath(s) {
  return outsideMath(s, plainMathRules);
}

/* Một lượt cho cả hai luật chữ trần: bóc vỏ "\text{...}" rồi đổi mũ trần thành
   mũ Unicode — đúng thứ tự như _normalize_masked bên Python. */
function fixProseLatex(s) {
  return plainMathOutsideMath(unwrapLatexText(s));
}

window.unwrapLatexText = unwrapLatexText;
window.gapUnitsInMath = gapUnitsInMath;
window.outsideMath = outsideMath;
window.plainMathOutsideMath = plainMathOutsideMath;
window.fixProseLatex = fixProseLatex;

/* Văn bản thường -> chuỗi an toàn khi gán vào innerHTML.
   "10<x<19" để nguyên thì trình duyệt hiểu là mở thẻ HTML và ăn luôn phần câu
   phía sau; nội dung AI/đề bài vì thế phải escape trước khi ghép thành HTML. */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
window.escapeHtml = escapeHtml;

/* -----------------------------------------------------------------------
   SỐ THEO CHUẨN VIỆT NAM: phần thập phân dùng DẤU PHẨY, hàng nghìn dùng
   DẤU CÁCH ("1 234,5"). Trước đây hàng nghìn viết bằng dấu chấm ("1.000") nên
   luật này luôn ĐỔI dấu chấm thành dấu cách chứ không giữ: chữ trong DB (kho
   crawler + lời giải AI) vẫn đầy "1.000", "2.400.000", chỉ lớp hiển thị chuẩn
   lại thành "1 000", "2 400 000".
   formatViNumbers là bản JS của _apply_decimal_comma trong math_symbols.py — giữ
   đúng ngoại lệ của Python: "0.833" là số thập phân chứ không phải hàng nghìn.
   Khác Python: JS còn gom nhóm hàng nghìn cho chuỗi chữ số dài ("200000" ->
   "200 000") — tầng server chưa làm việc này.
   Gọi ở mọi lối hiển thị: renderMd (lời giải đã lưu + đang stream) và
   renderPageMath (đề bài, đáp án, nội dung bài học SGK do Jinja vẽ, kể cả sau mỗi
   lần đổi trang bằng AJAX).
----------------------------------------------------------------------- */

/* Liên kết, ảnh nhúng và thuộc tính HTML chứa chữ số nhưng không phải một con
   số cần trình bày: "1000" trong "…/index?n=1000" đổi thành "1 000" là hỏng
   liên kết, chuỗi base64 trong "src=data:…" mà chèn dấu cách là vỡ ảnh.
   Che những đoạn đó rồi khôi phục sau khi đổi dấu. */
var VI_KEEP_RE = /(?:https?|ftp|mailto|data):[^\s<>"']+|(?:src|href|action|content|value)\s*=\s*"[^"]*"/gi;

/* Dấu chấm chỉ là dấu thập phân khi đứng giữa hai nhóm chữ số và phần lẻ không
   phải khối ba chữ số: "0.833" thành "0,833" vì phần nguyên bằng 0 thì không thể
   là hàng nghìn. "1.000" và "2.400.000" KHÔNG rơi vào đây — VI_DOT_GROUP_RE bên
   dưới đã đổi dấu chấm của chúng thành dấu cách trước, nên mẫu này chỉ còn gặp
   số thập phân thật ("3.14"). "1.2.3" (phiên bản) vẫn an toàn vì nhìn sau chặn
   dấu chấm kế tiếp và mỗi khối phải đủ ba chữ số. */
var VI_DECIMAL_RE = /(?<![\d.])\d+\.\d+(?![\d.])/g;

/* Hàng nghìn đang viết bằng dấu chấm theo kiểu cũ ("1.000", "2.400.000"): đổi
   MỖI dấu chấm thành dấu ngăn cách mới. Chặn cùng ký tự với VI_GROUP_RE (số,
   chấm, phẩy, "/", ":", "%", chữ ASCII) để không ăn vào base64 hay mã định
   danh; nhìn sau chặn số và dấu chấm nên "1.0000" và chuỗi ngày không bị cắt.
   Ngoại lệ duy nhất: đúng MỘT dấu chấm và phần trước là "0" ("0.833") — để lại
   cho VI_DECIMAL_RE xử thành số thập phân. */
var VI_DOT_GROUP_RE = /(?<![\d.,/:%A-Za-z])\d{1,3}(?:\.\d{3})+(?![\d.])/g;

/* Nhóm hàng nghìn: chỉ chuỗi >=4 chữ số đứng một mình.
   Nhìn sau chặn số, dấu chấm/phẩy, "/", ":", "%", "-" và chữ cái ASCII =>
   tránh ngày "30/11/2026", giờ "12:30", khoảng "2024-2025", mã "AB1000CD".
   Nhìn trước chặn "/:-%" (tỉ lệ, khoảng năm) và chữ cái không phải đơn vị đo,
   nên "8000g" sửa được mà "…1000xYz…" (base64/dịnh danh) còn nguyên. */
var VI_GROUP_RE = /(?<![\d.,/:%\-A-Za-z])(\d{4,})/g;
var VI_BLOCK_AFTER_RE = /^[/:%\-*+]/;
/* SĐT và dãy số gõ rời ("096 196 9489" ở footer): mỗi khối là một phần của dãy,
   chèn dấu chấm vào khối cuối là hỏng số liên hệ. Chỉ tính khoảng trắng nằm ngang
   để "1000\n2000" (hai đáp án liền dòng) vẫn được nhóm. */
var VI_SPACED_DIGIT_BEFORE_RE = /\d[ \t\u00a0]$/;
var VI_SPACED_DIGIT_AFTER_RE = /^[ \t\u00a0]\d/;
var VI_WORD_RE = /^[A-Za-zÀ-ỹ]+/;
/* Một bảng đơn vị dùng cho HAI luật: gom hàng nghìn (chữ số sát đơn vị mới được
   nhóm, "ABCD1000EF" thì không) và chèn khoảng trắng số <-> đơn vị (xem
   spaceNumberUnits bên dưới). Thêm chữ nào là thêm cho cả hai luật nên bảng phải
   cân nhắc:
     * có dm/dam/hm và hg/dag/yến vì kho thật ghi dính "5dm", "1000dm²", "0dam"...
       (đo độ dài + đo khối lượng theo SGK);
     * có đồng/đ vì tiền viết sát số: "4000đồng", "5000đ";
     * KHÔNG có x, y, a, b, c, d, i, n, u — đó là biến số/biểu thức đại số
       ("2x" 52 lần, "3x" 40 lần, "4ac"...), chèn space thành "2 x" là đổi đề;
     * KHÔNG có % và ° — SGK viết liền "62,5%", "30°". */
var VI_UNITS = {
  kg: 1, kilogam: 1, hg: 1, dag: 1, gam: 1, g: 1, tấn: 1, tạ: 1, yến: 1,
  km: 1, hm: 1, dam: 1, m: 1, dm: 1, cm: 1, mm: 1, mét: 1,
  lít: 1, lit: 1, l: 1,
  giây: 1, phút: 1, giờ: 1, ngày: 1, tháng: 1, năm: 1, tuần: 1,
  'm²': 1, 'm³': 1, m2: 1, m3: 1, 'km²': 1, km2: 1,
  'đồng': 1, đ: 1,
};

function viGroupDigits(digits, sep) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/* Che liên kết/ảnh nhúng/thuộc tính HTML, chạy `fn` lên phần còn lại rồi khôi
   phục. Dùng chung cho hai luật (số Việt Nam và khoảng trắng ký hiệu toán học):
   bỏ bước che thì "…/index?n=1000" thành "…/index?n = 1 000" là hỏng liên kết,
   base64 trong "src=data:…" mà chèn dấu là vỡ ảnh. */
function withLinksMasked(s, fn) {
  var keep = [];
  var masked = s.replace(VI_KEEP_RE, function (m) {
    keep.push(m);
    return '\x00VI' + (keep.length - 1) + '\x00';
  });
  return fn(masked).replace(/\x00VI(\d+)\x00/g, function (m, i) { return keep[parseInt(i)]; });
}

/* Một lượt đổi dấu trên chuỗi KHÔNG chứa công thức/liên kết (đã che sẵn).
   decSep/thouSep khác nhau giữa văn bản thường và LaTeX: trong công thức phải
   bọc dấu bằng {} — "1,5" trần bị KaTeX coi phẩy là dấu câu nên chèn khoảng
   trắng thành "1, 5"; "1{,}5" mới render ra "1,5". Dấu cách thì TeX ăn mất nên
   hàng nghìn trong công thức dùng "~" (khoảng trắng buộc, bản JS của
   gapUnitsInMath đã dùng ký hiệu này cho số ↔ đơn vị). */
function viNumbersCore(s, decSep, thouSep) {
  s = s.replace(VI_DOT_GROUP_RE, function (m) {
    if (/^0\.\d{3}$/.test(m)) return m;
    return m.replace(/\./g, thouSep);
  });
  s = s.replace(VI_DECIMAL_RE, function (m) {
    var parts = m.split('.');
    if (parts[1].length === 3 && parts[0] !== '0') return m;
    return parts[0] + decSep + parts[1];
  });
  return s.replace(VI_GROUP_RE, function (m, digits, offset, str) {
    var rest = str.slice(offset + digits.length);
    if (VI_SPACED_DIGIT_BEFORE_RE.test(str.slice(0, offset))) return m;
    if (VI_SPACED_DIGIT_AFTER_RE.test(rest)) return m;
    if (VI_BLOCK_AFTER_RE.test(rest)) return m;
    var word = rest.match(VI_WORD_RE);
    if (word && !Object.prototype.hasOwnProperty.call(VI_UNITS, word[0].toLowerCase())) return m;
    return viGroupDigits(digits, thouSep);
  });
}

/* Hàm hiển thị số theo chuẩn Việt Nam — dùng cho đề bài, đáp án, nội dung bài
   học SGK: phần thập phân dấu phẩy, hàng nghìn dấu cách ("1 234,5"). */
function formatViNumbers(text) {
  var s = String(text == null ? '' : text);
  if (!/\d/.test(s)) return s;
  return withLinksMasked(s, function (m) { return viNumbersCore(m, ',', ' '); });
}

/* Bản dành cho biểu thức LaTeX (trong $...$) trước khi đưa vào KaTeX. */
function formatViNumbersInMath(expr) {
  var s = String(expr == null ? '' : expr);
  if (!/\d/.test(s)) return s;
  return viNumbersCore(s, '{,}', '~');
}

/* -----------------------------------------------------------------------
   KHOẢNG TRẮNG QUANH KÝ HIỆU TOÁN HỌC: khi một con số đứng sát >, <, =, ≤,
   ≥, ≠, ≈, ∈, ∉, ⊂, ⊃, ⇒, ⇔, ×, ÷ thì chèn khoảng trắng vào hai bên:
   "10<x<19" -> "10 < x < 19", "3×4=12" -> "3 × 4 = 12".
   spaceMathOperators chạy TRƯỚC formatViNumbers ở mọi lối hiển thị (đúng thứ
   tự user yêu cầu) và cũng chỉ sửa ở lớp hiển thị — chữ trong DB giữ nguyên.
   Có ý KHÔNG đưa vào bảng:
     ":" — 490 lần gặp trong kho, tất cả là nhãn bước ("Bước 1:"), chèn space
           thành "Bước 1 :" là hỏng;
     "%" — "62,5%" theo SGK viết liền số;
     "/" — phân số "3/8", ngày "30/11/2026", đường dẫn;
     "-" / "+" — số âm "$-1$" (53 lần) và mã điện thoại "+84".
   ----------------------------------------------------------------------- */
var MATH_RUN_RE = /[<>=≤≥≠≈∈∉⊂⊃⇒⇔×÷]+/g;
var MATH_SPACE_PROBE = /[<>=≤≥≠≈∈∉⊂⊃⇒⇔×÷]/;
var MATH_DIGIT_RE = /\d/;

/* Trong "?a=1000" hoặc "&b=2000", dấu "=" phân cách tham số chứ không phải phép
   bằng; chèn khoảng trắng là hỏng chữ hiển thị của liên kết. Nhận ra bằng cách
   tìm "?" / "&" trong cùng chuỗi liền mạch (không khoảng trắng) đứng trước dấu. */
function inQueryContext(str, offset) {
  var k = offset;
  while (k > 0 && !/\s/.test(str.charAt(k - 1))) k--;
  return /[?&]/.test(str.slice(k, offset));
}

/* Đề bài, đáp án, nội dung bài học SGK — văn bản thường, chưa đưa vào KaTeX. */
function spaceMathOperators(text) {
  var s = String(text == null ? '' : text);
  if (!MATH_SPACE_PROBE.test(s)) return s;
  return withLinksMasked(s, function (m) {
    return m.replace(MATH_RUN_RE, function (run, offset, str) {
      var prev = offset > 0 ? str.charAt(offset - 1) : '';
      var next = str.charAt(offset + run.length);
      if (!MATH_DIGIT_RE.test(prev) && !MATH_DIGIT_RE.test(next)) return run;
      if (inQueryContext(str, offset)) return run;
      var left = (prev === '' || /\s/.test(prev)) ? '' : ' ';
      var right = (next === '' || /\s/.test(next)) ? '' : ' ';
      return left + run + right;
    });
  });
}

/* -----------------------------------------------------------------------
   KHOẢNG TRẮNG GIỮA SỐ VÀ ĐƠN VỊ: theo SGK, đơn vị đo viết tách khỏi con số —
   "3m²" hiển thị "3 m²", "1000cm³" -> "1 000 cm³", "4000đồng" -> "4 000 đồng".
   Danh sách đơn vị lấy đúng từ VI_UNITS (bảng đã cân nhắc ở luật số), nên
   "2x", "3y", "4ac" là biểu thức đại số vẫn giữ nguyên, "62,5%" và "30°" vẫn
   viết liền. Luật này chạy TRƯỚC formatViNumbers: "4000đồng" -> "4000 đồng"
   -> "4 000 đồng".
   ----------------------------------------------------------------------- */
/* Dài trước ngắn sau: "dam" phải thử trước "dm"/"m", "đồng" trước "đ",
   "mét" trước "m". Escape ký tự đặc biệt để bảng thêm "/" hay "." an toàn. */
var UNIT_ALT = Object.keys(VI_UNITS)
  .sort(function (a, b) { return b.length - a.length; })
  .map(function (u) { return u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
  .join('|');
/* Chữ số phải là số đứng một mình: nhìn sau chặn chữ cái nên "x2m", "AB2cm"
   (định danh/biến) không bị chèn; chữ số kề chữ số thì bỏ qua — máy sẽ khớp ở
   chữ số CUỐI của "1000kg". Nhìn trước chặn chữ cái nên "8gram" nguyên văn.
   "²"/"³" không phải chữ cái nên "3m²" khớp "m" rồi chèn, ra "3 m²". */
var UNIT_SPACE_RE = new RegExp('(?<![A-Za-zÀ-ỹ_])(\\d)(' + UNIT_ALT + ')(?![A-Za-zÀ-ỹ])', 'g');
var UNIT_SPACE_PROBE = new RegExp('\\d(?:' + UNIT_ALT + ')');

function spaceNumberUnits(text) {
  var s = String(text == null ? '' : text);
  if (!UNIT_SPACE_PROBE.test(s)) return s;
  return withLinksMasked(s, function (m) {
    return m.replace(UNIT_SPACE_RE, function (run, digit, unit) {
      return digit + ' ' + unit;
    });
  });
}

/* Hai luật khoảng trắng đi chung một lượt, thứ tự cố định: ký hiệu toán học rồi
   đơn vị. "3×4m²" -> "3 × 4 m²". */
function applySpacingLaws(text) {
  return spaceNumberUnits(spaceMathOperators(text));
}

window.formatViNumbers = formatViNumbers;
window.formatViNumbersInMath = formatViNumbersInMath;
window.spaceMathOperators = spaceMathOperators;
window.spaceNumberUnits = spaceNumberUnits;
window.applySpacingLaws = applySpacingLaws;

function renderMd(text) {
  // Ký hiệu LaTeX (\notin, \mathbb{N}) -> Unicode, xem giải thích ở fixLatexMacros
  text = fixLatexMacros(text);
  // "\text{cm}" ngoài công thức -> chữ trần để học sinh không thấy tên lệnh nữa.
  text = unwrapLatexText(text);
  // Mũ trần và dấu phẩy khoảng ở chữ trần -> "x²", "(2; +∞)". Luật
  // _plain_math_rules bên Python đã chạy cho chữ do Flask in ra; lời giải AI thì
  // trình duyệt tự dựng markdown nên phải chạy lại ở đây.
  text = plainMathOutsideMath(text);
  // Chuẩn hóa số đo góc thiếu ° theo SGK: "∠BAC=60" -> "∠BAC = 60°"
  text = text
    .replace(/(∠\s*[A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,4})\s*\+\s*(?=∠)/g, '$1 + ')
    .replace(/(∠\s*[A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,5})\s*=\s*(\d{1,3})(?![0-9°])/g, '$1 = $2°')
    .replace(/([Gg]óc\s*[A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,5})\s*=\s*(\d{1,3})(?![0-9°])/g, '$1 = $2°')
    .replace(/(\\angle\s*[A-Za-z][A-Za-z0-9]{0,5})\s*=\s*(\d{1,3})(?![0-9°^\\])/g, '$1 = $2^{\\circ}');
  // Khoảng trắng theo SGK: "10<x<19" -> "10 < x < 19", "3m²" -> "3 m²". Chạy
  // trước luật số Việt Nam và trước khi che công thức (TeX bỏ khoảng trắng thừa).
  text = applySpacingLaws(text);
  var mathParts = [];
  // Bảo vệ biểu thức toán chưa đóng (trong lúc streaming)
  var dollarCount = (text.match(/\$/g) || []).length;
  var trailing = '';
  if (dollarCount % 2 !== 0) {
    var lastDollar = text.lastIndexOf('$');
    trailing = text.substring(lastDollar);
    text = text.substring(0, lastDollar);
  }
  // Display math $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, function(m, expr) {
    mathParts.push({ expr: expr, display: true });
    return '\x00MATH' + (mathParts.length - 1) + '\x00';
  });
  // Inline math $...$
  text = text.replace(/\$([^\$\n]+?)\$/g, function(m, expr) {
    mathParts.push({ expr: expr, display: false });
    return '\x00MATH' + (mathParts.length - 1) + '\x00';
  });
  // Căn bậc hai đứng trần (chưa có $...$): "√(25)" hoặc "\sqrt{25}" -> KaTeX \sqrt{25}
  text = text.replace(new RegExp(RADICAL_SRC, 'g'), function(m, a, b, c) {
    mathParts.push({ expr: '\\sqrt{' + (a !== undefined ? a : (b !== undefined ? b : c)) + '}', display: false });
    return '\x00MATH' + (mathParts.length - 1) + '\x00';
  });
  // Góc ngoài công thức: "∠ABC" -> KaTeX "\widehat{ABC}" (mũ trên ký tự, chuẩn SGK)
  text = text.replace(/∠\s*([A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,5})/g, function(m, name) {
    mathParts.push({ expr: '\\widehat{' + name + '}', display: false });
    return '\x00MATH' + (mathParts.length - 1) + '\x00';
  });

  // Số theo chuẩn Việt Nam cho phần văn bản (công thức đã che nên không bị đổi)
  text = formatViNumbers(text);

  // Render markdown
  text = escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Khôi phục công thức toán
  text = text.replace(/\x00MATH(\d+)\x00/g, function(m, idx) {
    var item = mathParts[parseInt(idx)];
    var expr = formatViNumbersInMath(gapUnitsInMath(fixLimitNotation(fixArrayPreamble(fixEnvRows(fixAngleMath(fixRadicals(item.expr)))))).trim());
    try {
      if (window.katex) {
        return katex.renderToString(expr, { displayMode: item.display, throwOnError: false });
      }
    } catch(e) {}
    /* Không có KaTeX: giữ raw nhưng đổi ngược phép thu `60^{\circ}` -> `60°`,
       bỏ ngoặc bọc dấu "," của số Việt Nam và biến "~" (khoảng trắng buộc)
       thành dấu cách thường — ngoài TeX thì "~" chỉ là ký tự thừa. */
    return escapeHtml(('$' + expr + '$')
      .replace(/(\d)\s*\^\{\\circ\}/g, '$1°')
      .replace(/\{([,.])\}/g, '$1')
      .replace(/(?<=\d)~(?=[\d\\])/g, ' '));
  });

  return text + escapeHtml(trailing);
}

/* Đổi số và chèn khoảng trắng quanh ký hiệu toán học trong chữ hiển thị của
   toàn trang. Chỉ ghi lại node khi chuỗi thật sự đổi, nên trang không có gì
   phải sửa thì không DOM thay đổi nào xảy ra. */
/* Probe cho patchTextNodes: có gì để đổi hay không. Ngoài chuỗi chữ số dài và
   số thập phân kiểu "3.14", phải kể cả hàng nghìn viết bằng dấu chấm kiểu cũ
   ("1.000", "2.400.000") — nếu bỏ thì node chứa "2.400.000" bị coi là ổn và vẫn
   hiện dấu chấm. */
var VI_PAGE_PROBE = /(?<![\d.,/:%\-A-Za-z])\d{4,}|(?<![\d.])\d+\.\d+(?![\d.])|\d{1,3}(?:\.\d{3})+/;
/* Lượt quét khoảng trắng cần cả hai dấu hiệu: ký hiệu toán học dính số ("10<x")
   và số dính đơn vị ("3m²", "4000đồng"). Ghép từ .source của hai luật nên bảng
   đơn vị thêm chữ nào cũng tự được lượt quét DOM biết. */
var SPACE_PROBE = new RegExp(MATH_SPACE_PROBE.source + '|' + UNIT_SPACE_PROBE.source);
var VI_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, SELECT: 1,
                    CODE: 1, PRE: 1, INPUT: 1, NOSCRIPT: 1 };

/* Lược đồ chung cho hai lượt quét trang: đi qua text node nên không phá form,
   không đụng thẻ đã render KaTeX và ô soạn thảo CKEditor (sửa text node trong
   CKEditor là lệch dữ liệu của editor). */
function patchTextNodes(root, probe, fn) {
  root = root || document.body;
  if (!root || !root.ownerDocument) return 0;
  var doc = root.ownerDocument;
  var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      var t = node.nodeValue || '';
      if (!probe.test(t)) return NodeFilter.FILTER_REJECT;
      var p = node.parentNode;
      if (!p || VI_SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
      if (p.closest && p.closest('.katex, [contenteditable="true"], .ck-editor__editable')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var changed = 0;
  while (walker.nextNode()) {
    var node = walker.currentNode;
    var v = fn(node.nodeValue);
    if (v !== node.nodeValue) { node.nodeValue = v; changed++; }
  }
  return changed;
}

window.renderMathSpacing = function (root) {
  return patchTextNodes(root, SPACE_PROBE, applySpacingLaws);
};

window.renderViNumbers = function (root) {
  return patchTextNodes(root, VI_PAGE_PROBE, formatViNumbers);
};

/* Bỏ vỏ "\text{cm}"/"\," và đổi mũ trần ở chữ trần do server in ra — chạy TRƯỚC
   lượt render KaTeX nên công thức $...$ còn nguyên, chỉ phần chữ thường đổi. */
window.renderLatexUnits = function (root) {
  return patchTextNodes(root, LATEX_UNIT_PROBE, fixProseLatex);
};

/* -----------------------------------------------------------------------
   Quét toàn trang (đề bài, đáp án, nội dung bài học SGK): bỏ vỏ "\text{...}" ở chữ
   trần, render $...$ và ∠ABC bằng KaTeX, sau đó chèn khoảng trắng theo SGK (ký
   hiệu toán học, đơn vị đo) rồi đổi số sang chuẩn Việt Nam ở mọi chữ còn lại
   (thứ tự user chốt).
   Chạy một lần khi tải trang và sau mỗi lần đổi trang bằng AJAX — đi qua
   text node nên không phá form.
----------------------------------------------------------------------- */
window.renderPageMath = function(root) {
  window.renderLatexUnits(root);
  if (window.katex) renderPageKatex(root || document.body);
  window.renderMathSpacing(root);
  window.renderViNumbers(root);
};

function renderPageKatex(root) {
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node) {
      var t = node.nodeValue || '';
      if (t.indexOf('∠') < 0 && t.indexOf('$') < 0 && t.indexOf('√') < 0 && t.indexOf('\\sqrt') < 0) return NodeFilter.FILTER_REJECT;
      var p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      var tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' ||
          tag === 'OPTION' || tag === 'CODE' || tag === 'PRE') return NodeFilter.FILTER_REJECT;
      if (p.closest && p.closest('.katex')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  var re = new RegExp('\\$([^$\\n]+?)\\$|∠\\s*([A-Za-zÀ-ỹ][A-Za-z0-9À-ỹ]{0,5})|' + RADICAL_SRC, 'g');
  nodes.forEach(function(node) {
    var text = node.nodeValue;
    var frag = document.createDocumentFragment();
    var last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var expr;
      if (m[1] !== undefined) expr = formatViNumbersInMath(gapUnitsInMath(fixLimitNotation(fixArrayPreamble(fixEnvRows(fixAngleMath(fixRadicals(m[1])))))));
      else if (m[2] !== undefined) expr = '\\widehat{' + m[2] + '}';
      else expr = '\\sqrt{' + (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5])) + '}';
      var html = null;
      try { html = katex.renderToString(expr, { displayMode: false, throwOnError: false }); } catch (e) {}
      if (html) {
        var tmp = document.createElement('span');
        tmp.innerHTML = html;
        frag.appendChild(tmp);
      } else {
        frag.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last === 0) return;
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  window.renderStoredSolutions(document.body);
  window.renderPageMath(document.body);
});

/* -----------------------------------------------------------------------
   SSE streaming cho AI explain
----------------------------------------------------------------------- */

/* Nhúng hình vào đầu hộp lời giải AI: ảnh của đề (nạp từ file).
   Meta tới từ sự kiện SSE "event: meta" nên không lẫn vào text giải thích. */
function insertAiFigure(box, meta) {
  if (!meta || meta.branch !== 'hinh_hoc') return;
  var imgs = (meta.image_urls && meta.image_urls.length) ? meta.image_urls
             : (meta.image_url ? [meta.image_url] : []);

  var wrap = document.createElement('div');
  wrap.className = 'q-figure q-figure-solution';

  var title = document.createElement('div');
  title.className = 'q-figure-title';
  title.textContent = 'Hình vẽ của đề bài';
  wrap.appendChild(title);

  if (imgs.length) {
    var strip = document.createElement('div');
    strip.className = 'q-figure-imgs';
    imgs.forEach(function (src) {
      var im = document.createElement('img');
      im.className = 'q-figure-img';
      im.alt = 'Hình vẽ bài tập';
      im.src = src;
      strip.appendChild(im);
    });
    wrap.appendChild(strip);
  }

  if (!meta.has_figure) {
    var hint = document.createElement('div');
    hint.className = 'q-figure-note';
    hint.textContent = 'Bài hình học không có hình sẵn — hãy tự vẽ hình theo mô tả của đề.';
    wrap.appendChild(hint);
  } else if (meta.figure_note) {
    var note = document.createElement('div');
    note.className = 'q-figure-note';
    note.textContent = meta.figure_note;
    wrap.appendChild(note);
  }
  box.insertBefore(wrap, box.firstChild);
}

function startSSE(url, box, btn, doneLabel, doneSuffix, onDone, onMeta) {
  var suffix = (doneSuffix === undefined) ? ' (ẩn/hiện)' : doneSuffix;
  var es = new EventSource(url);
  var buffer = '';
  var meta = null;
  var note = '';
  box.classList.add('visible');
  box.innerHTML = '<span style="color:var(--meta-fg);font-size:.85rem">⏳ Đang phân tích…</span>';

  /* Sự kiện ten "meta" chi goi listener nay, khong bo vao buffer loi giai */
  es.addEventListener('meta', function(e) {
    try { meta = JSON.parse(e.data); } catch (err) { meta = null; }
    /* onMeta: hộp thoại lý thuyết cần biết bài học SGK ngay khi meta đến (trước cả chữ đầu
       tiên) để hiện ảnh đính kèm và bài giảng MP3 của bài học SGK đó. */
    if (meta && onMeta) onMeta(meta);
  });
  /* Sự kiện "note": giải thích vì sao không lưu được, không lẫn vào text lời giải */
  es.addEventListener('note', function(e) {
    try { note = (JSON.parse(e.data) || {}).text || ''; } catch (err) { note = ''; }
  });

  es.onmessage = function(e) {
    if (e.data === '[DONE]') {
      es.close();
      btn.disabled = false;
      btn.innerHTML = doneLabel + suffix;
      box.dataset.loaded = '1';
      if (note) { box.dataset.note = note; } else { delete box.dataset.note; }
      fillSolutionBox(box, buffer, meta);
      /* onDone nhận thêm bản Markdown thô + meta: bài học cần đúng hai thứ đó để
         mở khung soạn thảo. Các chỗ gọi cũ chỉ dùng tham số đầu nên không ảnh hưởng. */
      if (onDone) onDone(!!buffer.trim(), buffer, meta);
      return;
    }
    if (e.data === '') return;
    buffer += sseUnescape(e.data);
    box.innerHTML = '<p>' + renderMd(buffer) + '</p>';
  };

  es.onerror = function() {
    es.close();
    btn.disabled = false;
    btn.innerHTML = doneLabel;
    if (!buffer) {
      box.innerHTML = '<span style="color:#9f1239">❌ Không kết nối được AI. Chắc chắn Ollama đang chạy (<code>ollama serve</code>).</span>';
      box.dataset.loaded = '1';
    }
    if (onDone) onDone(!!buffer.trim(), buffer, meta);
  };
  return es;
}

function toggleBox(btn, box, doneLabel) {
  if (box.dataset.loaded) {
    box.classList.toggle('visible');
    var showing = box.classList.contains('visible');
    btn.innerHTML = doneLabel + (showing ? ' (ẩn/hiện)' : '');
    return true;
  }
  return false;
}

/* -----------------------------------------------------------------------
   Một mạch render cho mọi lời giải: khung AI sau khi stream (startSSE) và
   khối "Lời giải đã lưu" khi nạp trang — để hai nơi hiển thị giống hệt nhau.
----------------------------------------------------------------------- */
function fillSolutionBox(box, text, meta) {
  box.innerHTML = '<p>' + renderMd(text || '') + '</p>';
  insertAiFigure(box, meta);
  showAlgoNote(box, meta);
  insertSolutionEditButton(box, meta, text || '');
  insertMethodSwitch(box, meta);
  showBoxNote(box);
}

/* Server đặt meta (đúng dạng sự kiện 'meta' của SSE) vào data-stored-solution. */
window.renderStoredSolutions = function(root) {
  var boxes = (root || document).querySelectorAll('[data-stored-solution]');
  Array.prototype.forEach.call(boxes, function(box) {
    if (box.dataset.loaded) return;
    var meta = null;
    try { meta = JSON.parse(box.getAttribute('data-stored-solution')); } catch (e) {}
    box.classList.add('visible');
    fillSolutionBox(box, (meta && meta.solution && meta.solution.text) || '', meta);
    box.dataset.loaded = '1';
  });
};

/* -----------------------------------------------------------------------
   Nhiều cách giải của cùng một câu hỏi (solution_methods).
   Meta gửi xuống đã chứa hết các cách nên đổi cách chỉ là đổi trong DOM —
   không gọi server, học sinh không bị trừ thêm lượt xem lời giải.
----------------------------------------------------------------------- */
function solutionMethods(meta) {
  return (meta && meta.solution && meta.solution.methods) || [];
}

/* Meta của một cách giải: giữ hình + nhánh của đề, thay phần lời giải bằng cách đó. */
function methodMeta(meta, m) {
  var copy = {}, sol = {}, k;
  for (k in meta) copy[k] = meta[k];
  for (k in (meta.solution || {})) sol[k] = meta.solution[k];
  sol.text = m.text || '';
  sol.branch = m.branch || '';
  sol.has_figure = m.has_figure || 0;
  sol.figure_note = m.figure_note || '';
  sol.source = m.source || 'ai';
  sol.format = m.format || 'text';
  copy.solution = sol;
  copy.method_no = m.method_no;
  /* Cách phụ không phải lời giải chính: sửa nó sẽ ghi đè lời giải chính nên không nút sửa */
  copy.no_edit = !m.is_primary;
  return copy;
}

function currentMethodIndex(meta) {
  var list = solutionMethods(meta);
  var want = meta && meta.method_no;
  for (var i = 0; i < list.length; i++) {
    if (want ? list[i].method_no === want : list[i].is_primary) return i;
  }
  return 0;
}

function showMethod(box, meta, index) {
  var m = solutionMethods(meta)[index];
  if (!m) return;
  box.classList.add('visible');
  fillSolutionBox(box, m.text || '', methodMeta(meta, m));
}

function insertMethodSwitch(box, meta) {
  var list = solutionMethods(meta);
  if (list.length < 2) return;
  var i = currentMethodIndex(meta);
  var bar = document.createElement('div');
  bar.className = 'method-switch mt-2';

  var label = document.createElement('span');
  label.className = 'method-label';
  label.style.cssText = 'font-size:.78rem;color:var(--meta-fg);margin-right:8px';
  label.textContent = 'Cách ' + (i + 1) + '/' + list.length;
  bar.appendChild(label);

  var next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-outline-secondary btn-sm me-2';
  next.textContent = '🔁 Xem cách giải khác';
  next.addEventListener('click', function () { showMethod(box, meta, (i + 1) % list.length); });
  bar.appendChild(next);

  /* Chọn lời giải chính là thao tác quản lý — làm ở trang "Quản lý câu hỏi",
     không đặt ở đây để học sinh làm bài không thấy nút ghi đè lời giải. */
  box.appendChild(bar);
}

/* Dòng chú thích SSE trả về khi không lưu được cách giải. */
function showBoxNote(box) {
  var text = box.dataset && box.dataset.note;
  if (!text) return;
  var div = document.createElement('div');
  div.className = 'sse-note';
  div.style.cssText = 'font-size:.78rem;color:#92400e;margin-top:6px';
  div.textContent = '⚠️ ' + text;
  box.appendChild(div);
}

/* -----------------------------------------------------------------------
   AI explain cho từng loại câu hỏi
----------------------------------------------------------------------- */
function aiExplainMC(btn, qid, selected) {
  var box = document.getElementById('ai-' + qid);
  if (!box) return;
  var label = '🤖 Giải thích lời giải';
  if (toggleBox(btn, box, label)) return;
  btn.disabled = true;
  btn.innerHTML = '⏳ Đang phân tích…';
  var url = '/ai/explain_stream?question_id=' + qid
          + (selected ? '&selected=' + encodeURIComponent(selected) : '');
  startSSE(url, box, btn, label);
}

/* Nút "Giải thích lời giải lại" ở trang quản lý câu hỏi: mỗi lần bấm là AI tìm một
   cách giải khác với lời giải đang lưu trong question_solutions và ghi đè kết quả,
   nên không dùng cơ chế ẩn/hiện — luôn chạy lại stream. */
function aiRegenerate(btn, qid) {
  var box = document.getElementById('ai-' + qid);
  if (!box || btn.disabled) return;
  var label = '🔁 Giải thích lời giải lại';
  btn.disabled = true;
  btn.innerHTML = '⏳ Đang tìm cách giải khác…';
  delete box.dataset.loaded;
  box.innerHTML = '';
  startSSE('/ai/regenerate_stream?question_id=' + qid, box, btn, label, '');
}

/* Bài tự luận không còn đi qua URL: lượt nộp đã lưu nguyên văn vào student_essays, nên
   server đọc lại từ DB theo question_id (bài dài hàng nghìn chữ, đưa vào query string là
   bị cắt và bị log lại). selected/bài viết đều để server tự lấy. */
function aiExplainEssay(btn, qid) {
  var box = document.getElementById('ai-' + qid);
  if (!box) return;
  var label = '🤖 Xem lời giải AI';
  if (toggleBox(btn, box, label)) return;
  btn.disabled = true;
  btn.innerHTML = '⏳ Đang phân tích…';
  startSSE('/ai/explain_essay_stream?question_id=' + qid, box, btn, label);
}

function aiExplainBoth(btn, qid, selected) {
  var box = document.getElementById('ai-' + qid);
  if (!box) return;
  var label = '🤖 Xem lời giải AI';
  if (toggleBox(btn, box, label)) return;
  btn.disabled = true;
  btn.innerHTML = '⏳ Đang phân tích…';
  var url = selected
    ? '/ai/explain_stream?question_id=' + qid + '&selected=' + encodeURIComponent(selected)
    : '/ai/explain_essay_stream?question_id=' + qid;
  startSSE(url, box, btn, label);
}

/* -----------------------------------------------------------------------
   Nút "Xem lý thuyết": mở popup chứa bài giảng của bài học SGK câu hỏi.
   Nội dung do AI sinh theo bài học SGK và lưu lại trong topic_lessons, nên lượt đầu
   chậm (gọi Ollama), các lượt sau server phát lại ngay.
----------------------------------------------------------------------- */
var LESSON_MODAL_TITLE = '📖 Lý thuyết';

/* Ảnh SGK đính kèm bài học (topic_lessons.image), đặt trong #lesson-image.
   Hộp đó nằm NGOÀI #lesson-body vì body bị stream ghi đè innerHTML mỗi lần nhận
   chunk, ảnh chèn vào trong đó sẽ bị xoá mất. */
function lessonClearImage() {
  var holder = lessonEl('lesson-image');
  if (!holder) return;
  holder.innerHTML = '';
  holder.classList.add('d-none');
}

/* Trình phát bài giảng đọc (MP3) của bài học SGK (topic_audios), đặt trong #lesson-audio.
   Cùng lý do như khung ảnh: hộp này nằm NGOÀI #lesson-body nên không bị stream xoá.

   pause() rồi mới gỡ thẻ: đóng popup lý thuyết cũng đi qua đây, mà modal của Bootstrap chỉ
   `display: none` — thẻ <audio> vẫn nằm trong DOM nên tiếng vẫn chạy. Không được dựa vào
   việc trình duyệt tự dừng một thẻ đã gỡ khỏi DOM (hành vi riêng của từng trình duyệt). */
function lessonClearAudio() {
  var holder = lessonEl('lesson-audio');
  if (!holder) return;
  var players = holder.querySelectorAll('audio');
  for (var i = 0; i < players.length; i++) players[i].pause();
  holder.innerHTML = '';
  holder.classList.add('d-none');
}

/* SSE báo sự kiện meta với số trang ảnh (image_count): chỉ khi bài học SGK có ảnh mới xin
   tải ảnh, vì mỗi trang ~100-200 KB không đi qua luồng chữ. Meta đến trước cả chữ đầu
   tiên nên ảnh hiện lên trong lúc AI còn đang soạn. Một bài học SGK dài nhiều trang nên
   mỗi trang là một thẻ <img>, xếp theo đúng thứ tự trang trong sách. */
function lessonShowImage(meta) {
  var holder = lessonEl('lesson-image');
  if (!holder || !meta || !meta.has_image || !meta.lesson_topic_id) return;
  var count = Math.max(1, parseInt(meta.image_count, 10) || 1);
  holder.innerHTML = '';
  for (var i = 0; i < count; i++) {
    var img = document.createElement('img');
    img.className = 'img-fluid border rounded mb-2';
    img.alt = 'Ảnh SGK, trang ' + (i + 1);
    img.src = '/ai/lesson_image?topic_id=' + encodeURIComponent(meta.lesson_topic_id)
      + '&i=' + i;
    holder.appendChild(img);
  }
  holder.classList.remove('d-none');
}

/* SSE meta báo bài học SGK đã có bài giảng đọc (has_audio): chèn trình phát MP3 trỏ thẳng
   /ai/lesson_audio?topic_id=N. preload="none" để không tải cả file khi học sinh chỉ mở
   popup xem chữ; bấm phát mới tải. */
function lessonShowAudio(meta) {
  var holder = lessonEl('lesson-audio');
  if (!holder || !meta || !meta.has_audio || !meta.lesson_topic_id) return;
  holder.innerHTML = '';
  var player = document.createElement('audio');
  player.controls = true;
  player.preload = 'none';
  player.className = 'w-100';
  player.src = '/ai/lesson_audio?topic_id=' + encodeURIComponent(meta.lesson_topic_id);
  var label = document.createElement('div');
  label.className = 'small text-muted mb-1';
  label.textContent = '🎧 Nghe bài giảng';
  holder.appendChild(label);
  holder.appendChild(player);
  holder.classList.remove('d-none');
}

/* Sự kiện meta mang cả ảnh lẫn bài giảng đọc -> một điểm vào cho startSSE. */
function lessonShowMedia(meta) {
  lessonShowImage(meta);
  lessonShowAudio(meta);
}

/* Đóng popup lý thuyết thì bài giảng đang nghe phải tắt theo. Lối đóng nào cũng bắn
   `hidden.bs.modal` trên #modal-lesson (nút Đóng, dấu X, ESC, bấm nền mờ) và sự kiện
   đó nổi lên tới document, nên đăng ký một lần ở đây phủ mọi trang — common.js nạp ở
   <head> nên không thể getElementById lấy modal lúc này. */
document.addEventListener('hidden.bs.modal', function (ev) {
  if (ev.target && ev.target.id === 'modal-lesson') lessonClearAudio();
});

/* Mở #modal-lesson (base.html) và stream bài học về khung #lesson-body.
   Hai lối vào dùng chung mạch này: theo câu hỏi (trang kết quả) và theo thẳng
   bài học (trang Học tập) — chỉ khác URL và tiêu đề popup. Mỗi lần mở đều quên
   ảnh của lần xem trước, để ảnh cũ không dính sang bài học SGK vừa xem.

   Hệ thống không còn soạn bài bằng AI: luồng SSE chỉ phát lại thứ đã có nên nút không
   đổi nhãn sau khi mở, và bài học SGK chưa có gì trả về một dòng chú thích chứ không phải
   bài đang viết dở. */
function openLessonModal(url, btn, doneLabel, title, onDone) {
  var modalEl = document.getElementById('modal-lesson');
  var box = document.getElementById('lesson-body');
  if (!modalEl || !box || !window.bootstrap || !bootstrap.Modal) return;
  var head = modalEl.querySelector('.modal-title');
  if (head) head.textContent = title || LESSON_MODAL_TITLE;
  delete box.dataset.loaded;
  box.innerHTML = '';
  lessonClearImage();
  lessonClearAudio();
  var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
  btn.disabled = true;
  btn.innerHTML = '⏳ Đang mở lý thuyết…';
  startSSE(url, box, btn, doneLabel, '', function (gotText) {
    if (onDone) onDone(gotText);
  }, lessonShowMedia);
}

function showLesson(btn, qid) {
  openLessonModal('/ai/lesson_stream?question_id=' + qid, btn,
                  '📖 Xem lý thuyết', LESSON_MODAL_TITLE);
}

var LESSON_OPEN_LABEL = '📖 Mở lý thuyết';

/* Trang "Học tập" và trang Bài học SGK: mỗi hàng bài học mang data-topic-id + data-topic-name
   (Jinja escape sẵn), nên tham số không đi qua chuỗi JS nào cả. Hàng chưa có bài học lẫn
   ảnh SGK không có nút này — template đặt nhãn "Chúng tôi đang cập nhật lý thuyết này"
   (.lesson-soon) thay thế, nên popup chỉ có một nhãn duy nhất, không lật qua lật lại. */
function showLessonTopic(btn) {
  var tid = btn.getAttribute('data-topic-id') || '';
  var title = btn.getAttribute('data-topic-name') || LESSON_MODAL_TITLE;
  openLessonModal('/ai/lesson_stream?topic_id=' + encodeURIComponent(tid), btn,
                  LESSON_OPEN_LABEL, '📖 ' + title);
}

/* Tra phần tử trong popup lý thuyết — dùng chung cho khung ảnh và khung nội dung. */
function lessonEl(id) { return document.getElementById(id); }

/* Tên gọi cũ, dùng chung đúng một mạch escape với escapeHtml ở trên — chỉ khác là
   chịu được giá trị rỗng/None (nhiều nơi gọi escHtml(x) với x có thể undefined). */
function escHtml(s) { return escapeHtml(s == null ? '' : s); }
window.escHtml = escHtml;

/* Toast dùng chung: hiện một dòng thông báo trong thẻ `#toast` của trang rồi tự ẩn.
   `holdMs` bỏ trống -> 2500ms; `holdMs = 0` -> giữ tới khi có thông báo khác thay thế
   (dùng cho việc chờ lâu). Gọi lại thì huỷ hẹn giờ cũ để thông
   báo mới không bị ẩn sớm. Trước đây mỗi trang admin tự định nghĩa một bản (showToast,
   upToast) — giờ chỉ còn hàm này. */
function showToast(msg, holdMs) {
  var t = document.getElementById('toast');
  if (!t) return;
  if (window.__toastTimer) { clearTimeout(window.__toastTimer); window.__toastTimer = null; }
  t.textContent = msg;
  t.style.display = 'block';
  var ms = (holdMs == null ? 2500 : holdMs);
  if (ms > 0) {
    window.__toastTimer = setTimeout(function () {
      t.style.display = 'none';
      window.__toastTimer = null;
    }, ms);
  }
}
window.showToast = showToast;

/* Hộp thông báo dùng chung thay cho alert() của trình duyệt: alert chặn hết script đang
   chạy và mỗi trình duyệt vẽ một kiểu, còn modal này dùng đúng Bootstrap 5 đã nạp ở
   head.html. `#modal-notice` nằm trong base.html nên tồn tại ở mọi trang. Nội dung ghi
   bằng textContent — không đường nào biến thông báo thành HTML chạy trên máy người xem
   (nhiều thông báo nối thẳng chuỗi lỗi từ server vào). Xuống dòng giữ được nhờ
   white-space:pre-line. Thiếu modal (trang cũ còn sót) thì rơi về toast. */
function showNotice(message, title) {
  var el = document.getElementById('modal-notice');
  var body = document.getElementById('notice-body');
  if (!el || !body || !window.bootstrap || !bootstrap.Modal) {
    showToast(String(message == null ? '' : message));
    return;
  }
  body.textContent = message == null ? '' : String(message);
  var head = document.getElementById('notice-title');
  head.textContent = title || 'Thông báo';
  bootstrap.Modal.getOrCreateInstance(el).show();
}
window.showNotice = showNotice;

/* Hộp hỏi Có/Không dùng chung thay cho confirm() của trình duyệt. Khác biệt lớn nhất so
   với alert: confirm trả lời ngay tại chỗ còn modal thì không — trình duyệt đã đóng cửa
   sổ script từ lâu trước khi người dùng bấm "Có". Vì vậy hành động phải đi vào `onYes`
   và chỉ chạy khi người dùng đồng ý; đóng bằng ESC hay nền mờ coi như trả lời Không nên
   không có đường nào chạy nhầm. callback gắn vào nút "Có" mỗi lần gọi (gán trực tiếp,
   không addEventListener) nên lời hỏi mới luôn thay lời hỏi cũ. Thiếu modal (trang không
   nối base.html) thì rơi về confirm cũ để hành động không chết. */
function askConfirm(message, onYes, title) {
  var el = document.getElementById('modal-confirm');
  var body = document.getElementById('confirm-body');
  var yes = document.getElementById('confirm-yes');
  var text = message == null ? '' : String(message);
  if (!el || !body || !yes || !window.bootstrap || !window.bootstrap.Modal) {
    if (window.confirm(text)) { onYes(); }
    return;
  }
  body.textContent = text;
  var head = document.getElementById('confirm-title');
  head.textContent = title || 'Xác nhận';
  var modal = bootstrap.Modal.getOrCreateInstance(el);
  /* Nút "Có" vẫn còn bấm được trong lúc modal đang mờ dần, nên một cú nhấp đúp gọi
     onYes hai lần — với hành động hàng loạt (xóa câu, sinh đáp án) là chạy hai lượt.
     Mỗi lần hỏi chỉ được trả lời một lần: cửa chốt đặt ở đây, theo từng lời gọi. */
  var answered = false;
  yes.onclick = function () {
    if (answered) return;
    answered = true;
    modal.hide();
    onYes();
  };
  modal.show();
}
window.askConfirm = askConfirm;

/* Nút bấm mang `data-confirm="..."`: hỏi xác nhận TRƯỚC rồi mới cho hành động xảy ra.
   Dùng cho các form gửi thẳng trong template (onclick="return confirm(...)") — ở đó không
   có callback nào để bọc, nên cách duy nhất là chặn cú bấm đầu rồi mô phỏng lại cú bấm
   khi người dùng trả lời "Có". Cú bấm mô phỏng đi qua chính bộ nghe này, do đó phải gác
   bằng cờ `__askSkip` trong lúc nó chạy; cờ đặt/xá đồng bộ quanh `click()` nên không bao
   giờ kẹt lại nếu người dùng bấm "Không". */
document.addEventListener('click', function (ev) {
  var el = ev.target && ev.target.closest ? ev.target.closest('[data-confirm]') : null;
  if (!el || el.__askSkip || el.disabled) return;
  ev.preventDefault();
  ev.stopPropagation();
  askConfirm(el.getAttribute('data-confirm'), function () {
    el.__askSkip = true;
    try { el.click(); } finally { el.__askSkip = false; }
  });
}, true);

/* -----------------------------------------------------------------------
   Đo chiều cao lớp đỉnh. Chỉ banner + menu (`.site-top`) còn là position:fixed;
   footer đã về dòng thường ở cuối tài liệu nên không che ai nữa.
   - --fixed-top: chỗ body phải chừa ra để cột nội dung không chui dưới menu.
     Bắt buộc đo bằng JS vì menu tự xuống dòng theo bề ngang màn hình.
   - --fixed-bottom: không còn để trừ vào khung cố định nữa, mà là SÀN chiều cao
     của #page-body (trang ngắn vẫn đẩy footer xuống sát đáy trình duyệt).
     Footer cao lên chậm hơn lượt vẽ (chữ tải xong, ảnh vào chỗ) nên
     vẫn phải đo thật, không để hardcoded 60px.
----------------------------------------------------------------------- */
function syncFixedLayout() {
  var root = document.documentElement;
  function heightOf(sel) {
    var el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  }
  root.style.setProperty('--fixed-top', heightOf('.site-top') + 'px');
  root.style.setProperty('--fixed-bottom', heightOf('.footer-shell') + 'px');
}
window.syncFixedLayout = syncFixedLayout;

document.addEventListener('DOMContentLoaded', function () {
  syncFixedLayout();
  window.addEventListener('resize', syncFixedLayout);
  if (!window.ResizeObserver) return;
  var ro = new ResizeObserver(syncFixedLayout);
  ['.site-top', '.footer-shell'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) ro.observe(el);
  });
});

/* -----------------------------------------------------------------------
   Sửa lời giải + lưu thuật toán bài học SGK (chỉ khi có quyền quản trị)
----------------------------------------------------------------------- */
var URL_SOLUTION_SAVE = '/ai/solution_save';
var URL_SOLUTION_PRIMARY = '/ai/solution_primary';
var URL_SOLUTION_METHOD_DELETE = '/ai/solution_method_delete';
var URL_TOPIC_ALGORITHMS = '/ai/topic_algorithms';
var URL_TOPIC_ALGORITHM_DELETE = '/ai/topic_algorithm_delete';
var URL_TOPIC_ALGORITHM_DIGEST = '/ai/topic_algorithm_digest';

var __seModal = null;
var __seEditor = null;
var __seCtx = null;         // {qid, meta, html}
var __seCKPromise = null;

function qidFromBox(box) {
  var m = /^ai-(\d+)$/.exec(box.id || '');
  return m ? parseInt(m[1], 10) : 0;
}

function algoNoteHtml(meta) {
  var parts = [];
  var used = (meta && meta.algorithms) || [];
  if (used.length) parts.push('📐 Bám thuật toán: ' + escHtml(used.join(' · ')));
  if (meta && meta.locked) parts.push('🔒 Lời giải đã được duyệt — AI không ghi đè');
  return parts.join('<br>');
}

function showAlgoNote(box, meta) {
  var note = algoNoteHtml(meta);
  if (!note) return;
  var div = document.createElement('div');
  div.className = 'algo-note';
  div.style.cssText = 'font-size:.76rem;color:var(--meta-fg);margin-top:6px';
  div.innerHTML = note;
  box.appendChild(div);
}

function insertSolutionEditButton(box, meta, streamedText) {
  if (!window.CAN_EDIT_SOLUTION) return;
  /* Nút sửa lời giải chỉ có ở trang /admin_questions; mọi trang khác (kết quả làm bài,
     lịch sử, chi tiết bài nộp) không có phần tử đánh dấu nên không hiện nút. */
  if (!box.closest('[data-solution-edit-host]')) return;
  if (meta && meta.no_edit) return;   /* cách phụ: sửa là ghi đè lời giải chính */
  var qid = (meta && meta.question_id) || qidFromBox(box);
  if (!qid) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-outline-primary btn-sm mt-2';
  btn.textContent = '✏️ Sửa & lưu thuật toán';
  btn.addEventListener('click', function () { openSolutionEditor(qid, meta, streamedText); });
  box.appendChild(document.createElement('div'));
  box.appendChild(btn);
}

/* Loi giai luu dang HTML (do nguoi soa) thi giu nguyen; con lai chuyen text -> doan HTML */
function solutionToEditorHtml(meta, streamedText) {
  var sol = (meta && meta.solution) || {};
  if (sol.format === 'html' && sol.text) return sol.text;
  var src = (streamedText || sol.text || '').trim();
  if (!src) return '';
  return '<p>' + escHtml(src)
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>') + '</p>';
}

function loadScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('Khong tai duoc ' + src)); };
    document.head.appendChild(s);
  });
}

/* CKEditor 5 nang ~1.4MB -> chi tai khi giao vien thuc su mo form soa */
function ensureCKEditor() {
  if (window.ClassicEditor) return Promise.resolve();
  if (!__seCKPromise) {
    __seCKPromise = loadScriptOnce('static/ckeditor/ckeditor.js')
      .then(function () { return loadScriptOnce('static/ckeditor/translations/vi.js'); });
  }
  return __seCKPromise;
}

function seEditorValue() {
  if (__seEditor) return __seEditor.getData();
  return (__seCtx && __seCtx.html) || '';
}

function seSetStatus(msg) {
  var el = document.getElementById('se-status');
  if (el) el.innerHTML = msg;
}

function openSolutionEditor(qid, meta, streamedText) {
  var modalEl = document.getElementById('modal-solution-edit');
  if (!modalEl || !window.bootstrap || !bootstrap.Modal) return;
  __seCtx = { qid: qid, meta: meta || {}, html: solutionToEditorHtml(meta, streamedText) };
  if (!__seModal) __seModal = new bootstrap.Modal(modalEl);
  seSetStatus('');
  loadSeTopics();
  __seModal.show();
  ensureCKEditor().then(function () {
    if (__seEditor) { __seEditor.setData(__seCtx.html); return null; }
    return window.ClassicEditor.create(document.getElementById('se-editor-src'),
      { licenseKey: 'GPL', language: { ui: 'vi', content: 'vi' } })
      .then(function (editor) { __seEditor = editor; editor.setData(__seCtx.html); });
  }).catch(function (err) {
    if (window.console) console.warn('CKEditor khong san sang:', err);
    seSetStatus('⚠️ Trình soạn thảo không tải được — lưu nguyên văn lời giải đang hiển thị.');
  });
}

function loadSeTopics() {
  if (!__seCtx) return;
  fetch(URL_TOPIC_ALGORITHMS + '?question_id=' + __seCtx.qid, { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { renderSeTopics(d && d.ok ? (d.topics || []) : []); })
    .catch(function () { renderSeTopics([]); });
}

function renderSeTopics(topics) {
  var sel = document.getElementById('se-topic');
  var exist = document.getElementById('se-existing');
  var dig = document.getElementById('se-digest');
  if (sel) {
    sel.innerHTML = '';
    topics.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.topic_id;
      o.textContent = t.topic_name + ' (' + (t.algorithm_count || 0) + ' thuật toán)';
      sel.appendChild(o);
    });
    sel.onchange = function () { renderSeTopicsBody(topics); };
  }
  renderSeTopicsBody(topics);
}

function renderSeTopicsBody(topics) {
  var sel = document.getElementById('se-topic');
  var tid = sel ? parseInt(sel.value || '0', 10) : 0;
  var cur = null;
  (topics || []).forEach(function (t) { if (String(t.topic_id) === String(tid)) cur = t; });
  var exist = document.getElementById('se-existing');
  var dig = document.getElementById('se-digest');
  if (exist) {
    if (!cur || !(cur.algorithms || []).length) {
      exist.innerHTML = '<em>Bài học SGK này chưa có thuật toán nào.</em>';
    } else {
      exist.innerHTML = '<strong>Thuật toán của bài học SGK</strong>' + cur.algorithms.map(function (a) {
        return '<div class="border-top pt-1 mt-1">' + escHtml(a.title)
          + ' <span class="text-muted small">#' + a.id + '</span>'
          + ' <a href="#" class="se-alg-del small ms-2" data-id="' + a.id + '">xóa</a>'
          + '<div class="text-muted" style="font-size:.75rem">'
          + escHtml((a.steps_text || '').slice(0, 200)) + '</div></div>';
      }).join('');
      Array.prototype.forEach.call(exist.querySelectorAll('.se-alg-del'), function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          deleteSeAlgorithm(parseInt(link.getAttribute('data-id'), 10));
        });
      });
    }
  }
  if (dig) {
    if (!cur) {
      dig.innerHTML = '';
    } else if (cur.digest_ready) {
      dig.innerHTML = '<strong>Quy trình chuẩn của bài học SGK</strong><div class="text-muted" style="font-size:.78rem">'
        + escHtml(cur.digest) + '</div>';
    } else {
      dig.innerHTML = '<em>Chưa có quy trình chuẩn (cần từ 2 thuật toán). Bấm "Gom thành quy trình chuẩn" '
        + 'khi bài học SGK đã đủ.</em>';
    }
  }
}

function deleteSeAlgorithm(id) {
  if (!id) return;
  postSeJson(URL_TOPIC_ALGORITHM_DELETE, { id: id }).then(function (d) {
    if (d && d.ok) loadSeTopics();
    else seSetStatus('❌ ' + ((d && d.error) || 'Không xóa được'));
  });
}

/* Lưu lời giải của câu hỏi, đặt lời giải chính, xóa cách giải là hành động trên câu hỏi
   ở trang "Quản lý câu hỏi" nên phải có loading như mọi trang khác. Bộ bọc sống ở
   ajax.js (AJAX.busyFetch); thiếu nó (trang mở một mình) thì rơi về fetch cũ. */
function postSeJson(url, payload) {
  var send = (window.AJAX && window.AJAX.busyFetch) || fetch;
  return send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  }).then(function (r) { return r.json(); }).catch(function (e) { return { ok: false, error: String(e) }; });
}

function saveSolutionEdit() {
  if (!__seCtx) return;
  var btn = document.getElementById('se-save');
  if (btn) btn.disabled = true;
  seSetStatus('⏳ Đang lưu…');
  var sel = document.getElementById('se-topic');
  var titleEl = document.getElementById('se-title');
  var chk = document.getElementById('se-save-alg');
  postSeJson(URL_SOLUTION_SAVE, {
    question_id: __seCtx.qid,
    solution: seEditorValue(),
    save_algorithm: chk ? chk.checked : false,
    topic_id: sel ? parseInt(sel.value || '0', 10) : 0,
    title: titleEl ? String(titleEl.value || '').trim() : ''
  }).then(function (d) {
    if (btn) btn.disabled = false;
    if (!d || !d.ok) { seSetStatus('❌ ' + ((d && d.error) || 'Lỗi khi lưu')); return; }
    seSetStatus('✅ Đã lưu lời giải.' + (d.algorithm ? ' Thuật toán: <strong>'
      + escHtml(d.algorithm.title) + '</strong>' : ''));
    applySavedSolution(d);
    loadSeTopics();
  });
}

function applySavedSolution(d) {
  var box = document.getElementById('ai-' + d.question_id);
  if (!box || !d.solution_html) return;
  var meta = { question_id: d.question_id, locked: true, algorithms: [],
               solution: { format: 'html', text: d.solution_html } };
  box.innerHTML = '<p>' + d.solution_html + '</p>';
  showAlgoNote(box, meta);
  insertSolutionEditButton(box, meta, '');
  if (window.renderPageMath) window.renderPageMath(box);
}

function rebuildSeDigest() {
  var sel = document.getElementById('se-topic');
  var tid = sel ? parseInt(sel.value || '0', 10) : 0;
  if (!tid) { seSetStatus('❌ Chưa chọn bài học SGK'); return; }
  var btn = document.getElementById('se-digest-btn');
  if (btn) btn.disabled = true;
  seSetStatus('⏳ AI đang gom các thuật toán thành một quy trình (vài chục giây)…');
  postSeJson(URL_TOPIC_ALGORITHM_DIGEST, { topic_id: tid }).then(function (d) {
    if (btn) btn.disabled = false;
    if (!d || !d.ok) {
      seSetStatus('❌ ' + ((d && d.error) || 'Không gom được — cần từ 2 thuật toán và Ollama đang chạy.'));
      return;
    }
    seSetStatus('✅ Đã tạo quy trình chuẩn.');
    loadSeTopics();
  });
}

document.addEventListener('DOMContentLoaded', function () {
  var saveBtn = document.getElementById('se-save');
  if (saveBtn) saveBtn.addEventListener('click', saveSolutionEdit);
  var digBtn = document.getElementById('se-digest-btn');
  if (digBtn) digBtn.addEventListener('click', rebuildSeDigest);
});
