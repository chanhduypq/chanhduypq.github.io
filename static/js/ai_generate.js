/* ==========================================================================
   ai_generate.js — trang sinh câu hỏi AI
   ========================================================================== */
var lastQuestions = [];
var lastGrade = 6;
var allTopics = [];
var selectedTopicId = null;
var selectedTopicName = '';

// URL các API
var URL_CURRICULUM_TOPICS = '/curriculum_topics';
var URL_GENERATE = '/ai/generate_questions';

// Khởi tạo: trang này còn được nạp bằng AJAX (không reload) nên DOMContentLoaded có
// thể đã chạy xong trước khi script được chèn — khi đó chạy ngay, và chạy lại mỗi lượt
// đổi trang để danh sách bài học SGK khớp DOM mới.
function aiInit() {
  if (document.getElementById('inp-grade')) onGradeChange();
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', aiInit);
} else {
  aiInit();
}
document.addEventListener('ajax:swapped', aiInit);

function onGradeChange() {
  var grade = parseInt(document.getElementById('inp-grade').value);
  lastGrade = grade;
  selectedTopicId = null;
  selectedTopicName = '';
  fetch(URL_CURRICULUM_TOPICS + '?grade=' + grade)
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (!data.ok) return;
      allTopics = data.topics || [];
      populateTopics();
      updatePreview();
    })
    .catch(function(){});
}

function populateTopics() {
  var sel = document.getElementById('inp-topic');
  var html = '<option value="">-- Chọn bài học SGK --</option>';
  allTopics.forEach(function(t) {
    html += '<option value="' + t.id + '">' + escHtml(t.name) + '</option>';
  });
  sel.innerHTML = html;
}

function onTopicChange() {
  var tid = parseInt(document.getElementById('inp-topic').value) || 0;
  var found = allTopics.find(function(t){ return t.id === tid; });
  selectedTopicId = found ? found.id : null;
  selectedTopicName = found ? found.name : '';
  updatePreview();
}

function updatePreview() {
  var prev = document.getElementById('topic-preview');
  if (selectedTopicId) {
    prev.innerHTML = 'Bài học SGK đã chọn: <strong>' + escHtml(selectedTopicName) + '</strong>';
  } else {
    prev.textContent = 'Chọn lớp và bài học SGK để AI sinh câu hỏi đúng theo SGK.';
  }
}

function doGenerate() {
  if (!selectedTopicId) { showNotice('Vui lòng chọn bài học SGK của chương trình.'); return; }
  var grade = parseInt(document.getElementById('inp-grade').value);
  var count = parseInt(document.getElementById('inp-count').value) || 3;
  var diff  = document.getElementById('inp-diff').value;
  lastGrade = grade;

  setLoading(true, 'Đang sinh câu hỏi…');
  document.getElementById('results-section').style.display = 'none';

  fetch(URL_GENERATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic_id: selectedTopicId,
      topic: selectedTopicName,
      grade: grade,
      count: count,
      difficulty: diff,
      save: false
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data) {
    setLoading(false, '');
    if (!data.ok) { showNotice('Lỗi: ' + (data.error || 'Không xác định')); return; }
    lastQuestions = data.questions || [];
    renderResults(lastQuestions);
    document.getElementById('results-section').style.display = 'block';
    // Model chạy CPU nên một lô có thể hỏng giữa chừng: nói rõ AI chỉ sinh được bao nhiêu.
    var msg = '';
    if (data.requested && lastQuestions.length < data.requested) {
      msg = 'AI chỉ sinh được ' + lastQuestions.length + '/' + data.requested +
            ' câu (máy đang bận). Bấm sinh lại để lấy thêm.';
    }
    var off = (data.skipped_off_topic || []).length;
    if (off) {
      msg += (msg ? ' ' : '') + off + ' câu dùng đơn vị của đại lượng khác bài học SGK'
        + ' (nhãn "Có thể lạc đề") sẽ không được lưu.';
    }
    if (msg) document.getElementById('gen-status').textContent = msg;
  })
  .catch(function(e) {
    setLoading(false, '');
    showNotice('Lỗi kết nối: ' + e.message);
  });
}

// Nhãn kết quả đối chiếu đáp án với lời giải (server trả verify_status/verify_note)
var VERIFY_BADGE = {
  match: ['Lời giải xác nhận', 'bg-success'],
  solution_wins: ['Lời giải đã đổi đáp án đúng', 'bg-warning text-dark'],
  rule_conflict: ['Theo công thức tính', 'bg-info text-dark'],
  unverified: ['Chưa có lời giải xác nhận — không lưu được', 'bg-danger'],
  off_topic: ['Có thể lạc đề — không lưu được', 'bg-danger'],
  error: ['Lỗi khi đối chiếu lời giải — không lưu được', 'bg-danger']
};

function verifyBadge(q) {
  var v = VERIFY_BADGE[q.verify_status] || [q.verify_status || '', 'bg-secondary'];
  var note = q.verify_note ? ' title="' + escHtml(q.verify_note) + '"' : '';
  return '<span class="ms-2 badge ' + v[1] + '" style="font-size:.72rem"' + note
    + '>' + escHtml(v[0]) + '</span>';
}

function renderResults(questions) {
  var labels = ['A', 'B', 'C', 'D'];
  var html = questions.map(function(q, idx) {
    var optsHtml = (q.options || []).map(function(opt, i) {
      var isCorrect = (i === (q.correct || 0));
      return '<div class="opt-row' + (isCorrect ? ' correct' : '') + '">'
        + '<span class="opt-label">' + labels[i] + ')</span>'
        + '<span>' + escHtml(opt) + '</span>'
        + (isCorrect ? ' <span class="ms-auto badge bg-success" style="font-size:.72rem">✓ Đúng</span>' : '')
        + '</div>';
    }).join('');
    var badge = q.branch
      ? '<span class="q-badge branch-' + escHtml(q.branch) + '">' + escHtml(q.branch_label || (q.branch === 'hinh_hoc' ? 'Hình học' : 'Đại số')) + '</span>'
        + (q.branch === 'hinh_hoc'
            ? '<span class="q-badge fig-' + (q.has_figure ? 1 : 0) + '">' + escHtml(q.figure_label || (q.has_figure ? 'Có vẽ hình' : 'Không vẽ hình')) + '</span>'
            : '')
      : '';
    var lock = q.verified === false
      ? '<button class="btn btn-outline-secondary save-btn" disabled>Không lưu được</button>'
      : '<button class="btn btn-outline-success save-btn" onclick="saveOne(' + idx + ')">Lưu câu này</button>';
    return '<div class="q-card">'
      + lock
      + '<div class="q-num">Câu ' + (idx+1) + '. ' + badge + verifyBadge(q) + '</div>'
      + '<div style="margin-bottom:10px">' + escHtml(q.prompt) + '</div>'
      + optsHtml
      + '</div>';
  }).join('');
  document.getElementById('results-list').innerHTML = html;
  // Một mạch hiển thị như mọi trang khác: KaTeX cho công thức + số chuẩn VN
  if (window.renderPageMath) window.renderPageMath(document.getElementById('results-list'));
}

function saveOne(idx) {
  var q = lastQuestions[idx];
  if (!q) return;
  saveQuestions([q], function(data) {
    var ids = (data && data.saved_ids) || [];
    if (ids.length) { showNotice('Đã lưu câu ' + (idx+1) + ' (ID: ' + ids[0] + ')'); return; }
    var off = (data && data.skipped_off_topic) || [];
    if (off.length) { showNotice('Không lưu được: ' + (off[0].note || 'đề lạc bài học SGK')); return; }
    var sk = (data && data.skipped_unverified) || [];
    showNotice(sk.length ? 'Không lưu được: ' + (sk[0].note || 'lời giải không xác nhận đáp án')
                         : 'Lưu không thành công.');
  });
}

function saveAll() {
  if (!lastQuestions.length) return;
  saveQuestions(lastQuestions, function(data) {
    var ids = (data && data.saved_ids) || [];
    var sk = (data && data.skipped_unverified) || [];
    var off = (data && data.skipped_off_topic) || [];
    showNotice('Đã lưu ' + ids.length + ' câu vào hệ thống!'
      + (sk.length ? '\n' + sk.length + ' câu bị bỏ vì lời giải không xác nhận đáp án.' : '')
      + (off.length ? '\n' + off.length + ' câu bị bỏ vì dùng đơn vị của đại lượng khác bài học SGK.' : ''));
  });
}

function saveQuestions(questions, cb) {
  fetch(URL_GENERATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic_id: selectedTopicId,
      topic: selectedTopicName,
      grade: lastGrade,
      count: questions.length,
      difficulty: document.getElementById('inp-diff').value,
      save: true,
      _questions_override: questions
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data) { if (cb) cb(data || {}); })
  .catch(function() { if (cb) cb({}); });
}

function setLoading(on, msg) {
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-generate').disabled = on;
  document.getElementById('gen-status').textContent = msg;
}


