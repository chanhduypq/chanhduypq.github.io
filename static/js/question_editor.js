/* Hộp "Sửa câu hỏi" dùng chung: danh sách quản lý + trang xem kết quả làm bài.
   Sửa được: đề bài, đáp án theo kiểu câu (4 phương án / 4 phát biểu Đúng-Sai / một biểu
   thức), kiểu câu hỏi và trạng thái duyệt (có hiện khi làm bài hay không).
   File này chỉ được nạp cùng _question_editor_modal.html, tức khi can_edit_question. */

var QE_URL = {
  get: '/admin_get_question',
  settings: '/admin_question_settings',
  options: '/admin_set_options'
};
var QE_MAX_OPTIONS = 8;
/* Số phát biểu của một câu Đúng/Sai: 2..8 ý a..h, số ý thật do người soạn quyết (server
   kiểm lại theo `question_admin.STATEMENT_MIN/STATEMENT_MAX`). Dựng sẵn 4 hàng cho khớp
   khuôn đề tốt nghiệp; thêm/bớt được. Đây chỉ là gợi ý để báo sớm, không phải để tin. */
var QE_STATEMENTS_DEFAULT = 4;
var QE_STATEMENTS_MIN = 2;
var QE_STATEMENTS_MAX = 8;
var QE_FORMATS = ['trac_nghiem', 'tu_luan', 'dung_sai', 'tra_loi_ngan', 'dien_so'];
var qeCurrentQ = null;

/* Khong cache instance: manh ket qua nap bang AJAX thay the DOM that cua modal,
   bootstrap.Modal.getOrCreateInstance lay element hien tai nen khong bi loi. */
function qeGetModal(id) {
  try {
    var el = document.getElementById(id);
    if (!el || !window.bootstrap || !bootstrap.Modal) return null;
    return bootstrap.Modal.getOrCreateInstance(el);
  } catch (e) { return null; }
}

function qeToast(msg, bg) {
  try {
    var el = document.getElementById('qe-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'qe-toast';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#111;color:#fff;' +
        'padding:10px 14px;border-radius:6px;z-index:2000;max-width:360px';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = bg || '#111';
    el.style.display = 'block';
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.style.display = 'none'; }, bg ? 5200 : 2600);
  } catch (e) { }
}

var QE_ERRORS = {
  need_2_options: 'Cần ít nhất 2 phương án.',
  max_8_options: 'Chỉ tối đa 8 phương án.',
  need_one_correct: 'Chọn đúng một phương án.',
  unknown_correct_label: 'Nhãn đáp án đúng không hợp lệ.',
  options_must_be_list: 'Danh sách phương án không hợp lệ.',
  need_2_statements: 'Cần ít nhất 2 phát biểu.',
  max_8_statements: 'Chỉ tối đa 8 phát biểu.',
  statements_must_be_list: 'Danh sách phát biểu không hợp lệ.',
  statement_needs_answer: 'Mỗi phát biểu phải được chọn Đúng hoặc Sai.',
  need_short_answer: 'Câu trả lời ngắn cần một đáp án.',
  duplicate_prompt: 'Đề bài trùng với câu hỏi khác.',
  empty_prompt: 'Đề bài rỗng.',
  bad_question_format: 'Kiểu câu hỏi không hợp lệ.',
  bad_difficulty: 'Độ khó không hợp lệ.',
  bad_grade: 'Lớp không hợp lệ.',
  prompt_needs_single_id: 'Chỉ sửa đề bài cho từng câu một.',
  has_history: 'Câu hỏi còn lịch sử làm bài.',
  in_exam: 'Câu đang nằm trong đề thi đã nhập — dùng Bỏ duyệt thay vì xóa hẳn.',
  forbidden: 'Không có quyền sửa câu hỏi.',
  not_found: 'Không tìm thấy câu hỏi.',
  load_failed: 'Không tải được câu hỏi.',
  save_failed: 'Không lưu được.',
  no_question_id: 'Thiếu mã câu hỏi.',
  no_ids: 'Chưa chọn câu hỏi.'
};

function qeErrText(d, fallback) {
  if (!d) return fallback;
  return QE_ERRORS[d.error] || (d.error || fallback);
}
window.qeErrorText = qeErrText;

/* Mọi lượt gọi máy chủ của hộp sửa câu hỏi (tải câu hỏi, lưu thiết lập, lưu phương án)
   đều phải có loading như các trang khác; bộ bọc thật sống ở ajax.js (AJAX.busyFetch).
   Thiếu ajax.js thì rơi về fetch cũ để hộp sửa vẫn dùng được. */
function qeBusyFetch(url, init) {
  return (window.AJAX && window.AJAX.busyFetch) ? window.AJAX.busyFetch(url, init) : fetch(url, init);
}

function qeMsg(txt) {
  var el = document.getElementById('qe-msg');
  if (!el) return;
  el.textContent = txt || '';
  el.style.color = txt ? '#b91c1c' : '';
}

function qeRows() { return Array.from(document.querySelectorAll('#qe-opts .opt-row')); }

function qeLabel(i) { return String.fromCharCode(65 + i) + ')'; }

function qeRenumber() {
  var rows = qeRows();
  rows.forEach(function (row, i) {
    var lab = row.querySelector('.opt-label');
    if (lab) lab.textContent = qeLabel(i);
  });
  var add = document.getElementById('qe-add-option');
  if (add) add.disabled = rows.length >= QE_MAX_OPTIONS;
}

function addEditOption(text, isCorrect) {
  var box = document.getElementById('qe-opts');
  if (!box) return;
  if (qeRows().length >= QE_MAX_OPTIONS) { qeToast('Chỉ tối đa ' + QE_MAX_OPTIONS + ' phương án'); return; }
  var row = document.createElement('div');
  row.className = 'opt-row';
  var lab = document.createElement('span');
  lab.className = 'opt-label';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'form-control opt-text';
  inp.value = (text == null ? '' : String(text));
  var radio = document.createElement('label');
  radio.className = 'opt-correct small';
  var r = document.createElement('input');
  r.type = 'radio';
  r.name = 'qe-correct';
  r.checked = !!isCorrect;
  radio.appendChild(r);
  radio.appendChild(document.createTextNode(' Đúng'));
  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-outline-danger btn-sm opt-del';
  del.textContent = '×';
  del.title = 'Xóa phương án này';
  del.addEventListener('click', function () {
    if (row.parentNode) row.parentNode.removeChild(row);
    qeRenumber();
  });
  row.appendChild(lab); row.appendChild(inp); row.appendChild(radio); row.appendChild(del);
  box.appendChild(row);
  qeRenumber();
  if (text == null) inp.focus();
}

function qeCollect() {
  return qeRows().map(function (row) {
    var t = row.querySelector('.opt-text');
    var r = row.querySelector('.opt-correct input');
    return { text: t ? (t.value || '') : '', is_correct: (r && r.checked) ? 1 : 0 };
  });
}

function qeStatRows() { return Array.from(document.querySelectorAll('#qe-stats .opt-row')); }

function qeStatLabel(i) { return String.fromCharCode(97 + i) + ')'; }

function qeRenumberStats() {
  var rows = qeStatRows();
  rows.forEach(function (row, i) {
    var lab = row.querySelector('.opt-label');
    if (lab) lab.textContent = qeStatLabel(i);
  });
  var add = document.getElementById('qe-add-statement');
  if (add) add.disabled = rows.length >= QE_STATEMENTS_MAX;
}

/* Một hàng phát biểu: nhãn a.. theo vị trí, ô nội dung, combobox Đúng/Sai (để trống = chưa
   khẳng định) và nút xóa. Thứ tự ý là nội dung in trong đề nên KHÔNG bị xáo như phương án,
   nhưng SỐ ý thì thêm/bớt được trong khoảng 2..8. */
function addEditStatement(text, flag) {
  var box = document.getElementById('qe-stats');
  if (!box) return;
  if (qeStatRows().length >= QE_STATEMENTS_MAX) { qeToast('Chỉ tối đa ' + QE_STATEMENTS_MAX + ' phát biểu'); return; }
  var row = document.createElement('div');
  row.className = 'opt-row';
  var lab = document.createElement('span');
  lab.className = 'opt-label';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'form-control opt-text';
  inp.value = (text == null ? '' : String(text));
  var sel = document.createElement('select');
  sel.className = 'form-select stat-flag';
  [['', '— chọn —'], ['1', 'Đúng'], ['0', 'Sai']].forEach(function (p) {
    var op = document.createElement('option');
    op.value = p[0];
    op.textContent = p[1];
    sel.appendChild(op);
  });
  if (flag === true || flag === 1 || flag === '1') sel.value = '1';
  else if (flag === false || flag === 0 || flag === '0') sel.value = '0';
  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-outline-danger btn-sm opt-del';
  del.textContent = '×';
  del.title = 'Xóa ý này';
  del.addEventListener('click', function () {
    if (row.parentNode) row.parentNode.removeChild(row);
    qeRenumberStats();
  });
  row.appendChild(lab); row.appendChild(inp); row.appendChild(sel); row.appendChild(del);
  box.appendChild(row);
  qeRenumberStats();
  if (text == null) inp.focus();
}

/* Dựng `n` hàng phát biểu (mặc định 4 cho khớp khuôn đề tốt nghiệp). */
function buildEditStatements(n) {
  var box = document.getElementById('qe-stats');
  if (!box) return;
  box.innerHTML = '';
  var count = parseInt(n, 10);
  if (!(count >= QE_STATEMENTS_MIN)) count = QE_STATEMENTS_DEFAULT;
  count = Math.min(count, QE_STATEMENTS_MAX);
  for (var i = 0; i < count; i++) { addEditStatement('', null); }
}

/* Ý chưa chọn trả is_correct = null, KHÁC với 0 là "đã khẳng định Sai". `to_flag` phía
   server gộp hai trạng thái đó, nên `normalize_statements` cần null để chặn ý bỏ trống. */
function qeCollectStatements() {
  return qeStatRows().map(function (row) {
    var t = row.querySelector('.opt-text');
    var s = row.querySelector('.stat-flag');
    var v = s ? (s.value || '') : '';
    return { text: t ? (t.value || '') : '', is_correct: v === '' ? null : (v === '1' ? 1 : 0) };
  });
}

function qeFormat() {
  var el = document.getElementById('qe-format');
  var v = (el && el.value) || 'trac_nghiem';
  return QE_FORMATS.indexOf(v) >= 0 ? v : 'trac_nghiem';
}

/* Một kiểu câu chỉ có đúng một ô đáp án: ẩn hai ô còn lại để người soạn không gõ vào khối
   đang ẩn rồi tưởng mình đã lưu. Tự luận không có ô nào — đáp án của nó là lời giải đã lưu.
   "Trả lời ngắn" và "Điền số" dùng CHUNG một ô (`questions.short_answer`), nên áp theo id
   khối chứ không theo kiểu, kẻo gán hai kiểu vào cùng một phần tử lại luân phiên bật/tắt. */
function qeApplyFormat() {
  var fmt = qeFormat();
  var singleAnswer = (fmt === 'tra_loi_ngan' || fmt === 'dien_so');
  var want = {
    'qe-answer-mc': fmt === 'trac_nghiem',
    'qe-answer-stat': fmt === 'dung_sai',
    'qe-answer-short': singleAnswer
  };
  Object.keys(want).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = want[id] ? '' : 'none';
  });
  var numHint = document.getElementById('qe-short-num');
  if (numHint) numHint.style.display = (fmt === 'dien_so') ? '' : 'none';
}
window.qeApplyFormat = qeApplyFormat;
window.buildEditStatements = buildEditStatements;

function openEditQuestion(qid) {
  if (!qid) return;
  qeCurrentQ = qid;
  var box = document.getElementById('qe-opts');
  if (box) box.innerHTML = '';
  var idEl = document.getElementById('qe-qid');
  if (idEl) idEl.textContent = '#' + qid;
  var modal = qeGetModal('modal-qedit');
  if (modal) modal.show();
  qeMsg('Đang tải câu hỏi…');
  qeBusyFetch(QE_URL.get + '?question_id=' + encodeURIComponent(qid))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok) { qeMsg(qeErrText(d, 'Không tải được câu hỏi')); return; }
      var q = d.question || {};
      var p = document.getElementById('qe-prompt');
      if (p) p.value = q.prompt || '';
      var gr = document.getElementById('qe-grade');
      if (gr) gr.value = '';
      var fm = document.getElementById('qe-format');
      var stored = QE_FORMATS.indexOf(q.question_format) >= 0 ? q.question_format : 'trac_nghiem';
      if (fm) fm.value = stored;
      var sa = document.getElementById('qe-short');
      if (sa) sa.value = q.short_answer || '';
      var df = document.getElementById('qe-difficulty');
      if (df) {
        var known = ['de', 'trung_binh', 'kho', 'van_dung_cao'];
        df.value = known.indexOf(q.difficulty) >= 0 ? q.difficulty : 'trung_binh';
      }
      var vi = document.getElementById('qe-visible');
      if (vi) vi.checked = !!q.visible;
      var h = d.history || {};
      var hist = document.getElementById('qe-history');
      if (hist) {
        hist.textContent = (h.submissions || h.essays)
          ? ('Câu này đã có ' + (h.submissions || 0) + ' lượt chọn trong bài làm, ' + (h.essays || 0) +
             ' bài tự luận.')
          : 'Câu này chưa có lịch sử làm bài.';
      }
      var opts = d.options || [];
      opts.forEach(function (o) { addEditOption(o.text, o.is_correct); });
      if (opts.length === 0) { addEditOption('', true); addEditOption('', false); }
      /* Cùng một hàng `options` vừa là phương án A.. vừa là phát biểu a..h, chỉ khác nhãn,
         nên điền cả hai khối: đổi kiểu câu hỏi tại chỗ thì chữ đã soạn không bốc đi.
         Dựng đủ hàng cho số ý đang lưu (2..8), tối thiểu 4; select để trống có nghĩa là
         "chưa khẳng định", khác với ý chọn "Sai". */
      var wantStats = Math.min(QE_STATEMENTS_MAX, Math.max(QE_STATEMENTS_DEFAULT, opts.length || 0));
      buildEditStatements(wantStats);
      var stats = qeStatRows();
      opts.slice(0, QE_STATEMENTS_MAX).forEach(function (o, i) {
        var row = stats[i];
        if (!row) return;
        row.querySelector('.opt-text').value = o.text || '';
        row.querySelector('.stat-flag').value = o.is_correct ? '1' : '0';
      });
      qeApplyFormat();
      qeMsg('');
    })
    .catch(function () { qeMsg('Lỗi mạng khi tải câu hỏi'); });
}

function closeEditQuestion() {
  var modal = qeGetModal('modal-qedit');
  if (modal) modal.hide();
  qeCurrentQ = null;
  var box = document.getElementById('qe-opts');
  if (box) box.innerHTML = '';
  buildEditStatements();
  var sa = document.getElementById('qe-short');
  if (sa) sa.value = '';
  qeMsg('');
}

function qeReloadIfNeeded() {
  var host = document.getElementById('modal-qedit');
  if (host && host.getAttribute('data-qe-reload') === '1') { location.reload(); }
}

/* Nhãn phần đáp án trong toast, theo kiểu câu: nói "đã lưu phương án" cho một câu
   Đúng/Sai là chữ sai ngay trên màn hình người vừa soạn 4 phát biểu. */
var QE_ANSWER_LABEL = {
  trac_nghiem: 'phương án và đáp án đúng',
  dung_sai: 'các phát biểu cùng đáp án từng ý',
  tra_loi_ngan: 'đáp án',
  dien_so: 'đáp án'
};

function applyEditQuestion() {
  var qid = qeCurrentQ;
  if (!qid) { qeMsg('Chưa chọn câu hỏi nào để sửa'); return; }
  var fmt = qeFormat();
  var visEl = document.getElementById('qe-visible');
  var settings = { question_id: qid, question_format: fmt, visible: (visEl && visEl.checked) ? 1 : 0 };
  var promptEl = document.getElementById('qe-prompt');
  var promptVal = ((promptEl && promptEl.value) || '').trim();
  if (promptVal) settings.prompt = promptVal;
  var gradeEl = document.getElementById('qe-grade');
  var gv = (gradeEl && gradeEl.value) || '';
  if (gv) settings.grade = parseInt(gv, 10);
  var diffEl = document.getElementById('qe-difficulty');
  var dv = (diffEl && diffEl.value) || '';
  if (dv) settings.difficulty = dv;

  var opts = qeCollect().filter(function (o) { return (o.text || '').trim() !== ''; });
  var stats = qeCollectStatements().filter(function (s) { return (s.text || '').trim() !== ''; });
  var shortEl = document.getElementById('qe-short');
  var shortVal = ((shortEl && shortEl.value) || '').trim();
  /* Ba khối dữ liệu, đúng một khối được gửi — và gửi theo kiểu vừa lưu xuống
     /admin_question_settings, vì route đáp án đọc kiểu ĐANG LƯU trong DB để chọn nhánh. */
  var payload = { question_id: qid };
  if (fmt === 'trac_nghiem') {
    if (opts.length < 2) { qeMsg('Câu trắc nghiệm cần ít nhất 2 phương án.'); return; }
    if (opts.filter(function (o) { return o.is_correct; }).length !== 1) {
      qeMsg('Cần chọn đúng một phương án đúng.'); return;
    }
    payload.options = opts;
  } else if (fmt === 'dung_sai') {
    if (stats.length < QE_STATEMENTS_MIN) { qeMsg('Cần ít nhất ' + QE_STATEMENTS_MIN + ' phát biểu có nội dung.'); return; }
    if (stats.length > QE_STATEMENTS_MAX) { qeMsg('Chỉ tối đa ' + QE_STATEMENTS_MAX + ' phát biểu.'); return; }
    if (stats.some(function (s) { return s.is_correct === null; })) {
      qeMsg('Mỗi phát biểu phải được chọn Đúng hoặc Sai.'); return;
    }
    payload.statements = stats;
  } else if (fmt === 'tra_loi_ngan') {
    if (!shortVal) { qeMsg('Câu trả lời ngắn cần một đáp án.'); return; }
    payload.short_answer = shortVal;
  } else if (fmt === 'dien_so') {
    /* Đáp án "Điền số" là TUỲ CHỌN: có sẵn thì lưu vào `questions.short_answer` để chấm
       khỏi gọi model; để trống thì AI tự giải lúc học sinh nộp bài (services/number_answer). */
    if (shortVal) payload.short_answer = shortVal;
  }
  /* Tự luận không có ô đáp án ở đây (đáp án là lời giải đã lưu); trắc nghiệm mới soạn
     dở dưới 2 phương án thì chỉ lưu thiết lập, đúng như cách hộp sửa vẫn xử lý từ trước.
     "Điền số" để trống đáp án cũng chỉ lưu thiết lập — đó là trạng thái bình thường của nó. */
  var needsAnswer = fmt !== 'tu_luan' && !(fmt === 'trac_nghiem' && opts.length < 2)
    && !(fmt === 'dien_so' && !payload.short_answer);
  qeMsg('');
  qeBusyFetch(QE_URL.settings, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(settings)
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok) { qeMsg(qeErrText(d, 'không lưu được thiết lập câu hỏi')); return; }
    if (!needsAnswer) {
      qeToast('Đã lưu thiết lập câu hỏi #' + qid);
      closeEditQuestion(); qeReloadIfNeeded(); return;
    }
    qeBusyFetch(QE_URL.options, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }).then(function (r2) { return r2.json(); }).then(function (d2) {
      if (d2 && d2.ok) {
        var v = d2.verify || {};
        var msg = 'Đã lưu ' + (QE_ANSWER_LABEL[fmt] || 'đáp án') + ' cho câu #' + qid;
        if (v.status === 'conflict') msg += '. Cảnh báo: ' + (v.note || 'lời giải đã lưu chỉ đáp án khác');
        else if (v.status === 'match') msg += ' · Lời giải đã lưu xác nhận đáp án này';
        qeToast(msg, v.status === 'conflict' ? '#b91c1c' : null);
        closeEditQuestion(); qeReloadIfNeeded();
      } else {
        qeToast(qeErrText(d2, 'lưu thiết lập xong nhưng lỗi phần đáp án'));
        qeReloadIfNeeded();
      }
    }).catch(function () { qeMsg('Lỗi mạng khi lưu phần đáp án'); });
  }).catch(function () { qeMsg('Lỗi mạng khi lưu'); });
}
