/* ==========================================================================
   admin_topics.js — xử lý xóa bài học SGK & tạo câu hỏi cho từng bài học SGK
   ========================================================================== */
var URL_TOPICS_CHECK_DELETE = '/admin_topics_check_delete';
var URL_TOPIC_BRANCH = '/admin_topic_branch';
var URL_TOPIC_CURRICULUM = '/admin_topic_curriculum';
var URL_ADD_QUESTION = '/admin_add_question';
var URL_AI_GENERATE = '/ai/generate_questions';
var URL_QUESTION_FROM_IMAGE = '/admin_question_from_image';

/* ==========================================================================
   Combobox "Loại" của từng bài học SGK: chọn là ghi xuống DB ngay (không nút Lưu).
   ========================================================================== */
var TOPIC_BRANCH_LABEL = { hinh_hoc: 'Hình học', dai_so: 'Đại số' };

function topicBranchCell(tid) {
  return {
    sel: document.querySelector('.topic-branch-select[data-topic-id="' + tid + '"]'),
    state: document.querySelector('[data-branch-state="' + tid + '"]')
  };
}

/* Dòng chữ trạng thái nhỏ dưới ô điều khiển của một bài học SGK (Loại, Bài học). Hai điều
   khiển cùng kiểu "lưu ngay, không nút Lưu" nên dùng chung cách báo. */
function topicCellSay(cell, msg, ms) {
  if (!cell.state) return;
  cell.state.textContent = msg;
  if (cell.state._timer) clearTimeout(cell.state._timer);
  // Khoảng hiện chữ: ngắn để ô không chiếm chỗ lâu, đủ dài để kịp đọc.
  cell.state._timer = setTimeout(function () {
    cell.state.textContent = '';
    cell.state._timer = null;
  }, ms == null ? 2500 : ms);
}

function saveTopicBranch(tid, value) {
  var cell = topicBranchCell(tid);
  if (!cell.sel) return;
  var prev = cell.sel.getAttribute('data-branch') || '';
  cell.sel.disabled = true;
  topicCellSay(cell, 'Đang lưu…', 60000);
  fetch(URL_TOPIC_BRANCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tid, branch: value })
  }).then(function (r) { return r.json(); }).then(function (d) {
    cell.sel.disabled = false;
    if (d && d.ok) {
      cell.sel.setAttribute('data-branch', value);
      topicCellSay(cell, 'Đã lưu: ' + (TOPIC_BRANCH_LABEL[value] || 'chưa phân loại'));
    } else {
      // Không lưu được -> trả combobox về loại đang có trong DB để chữ không dối.
      cell.sel.value = prev;
      topicCellSay(cell, 'Không lưu được');
    }
  }).catch(function () {
    cell.sel.disabled = false;
    cell.sel.value = prev;
    topicCellSay(cell, 'Lỗi mạng');
  });
}

/* ==========================================================================
   Công tắc "Bài học" của từng bài học SGK: bật/tắt `topics.is_curriculum`, lưu ngay.
   Tắt thì bài học SGK ẩn khỏi trang Học tập nhưng vẫn còn trong danh mục luyện tập.
   ========================================================================== */
function topicCurriculumCell(tid) {
  return {
    box: document.querySelector('.topic-curriculum-switch[data-topic-id="' + tid + '"]'),
    state: document.querySelector('[data-curriculum-state="' + tid + '"]')
  };
}

function saveTopicCurriculum(tid, on) {
  var cell = topicCurriculumCell(tid);
  if (!cell.box) return;
  var prev = cell.box.getAttribute('data-curriculum') === '1';
  cell.box.disabled = true;
  topicCellSay(cell, 'Đang lưu…', 60000);
  fetch(URL_TOPIC_CURRICULUM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tid, on: on ? 1 : 0 })
  }).then(function (r) { return r.json(); }).then(function (d) {
    cell.box.disabled = false;
    if (d && d.ok) {
      cell.box.setAttribute('data-curriculum', on ? '1' : '0');
      topicCellSay(cell, on ? 'Đã lưu: hiện ở trang Học tập'
                            : 'Đã lưu: ẩn khỏi trang Học tập');
    } else {
      // Không lưu được -> trả công tắc về trạng thái trong DB để chữ không dối.
      cell.box.checked = prev;
      topicCellSay(cell, 'Không lưu được');
    }
  }).catch(function () {
    cell.box.disabled = false;
    cell.box.checked = prev;
    topicCellSay(cell, 'Lỗi mạng');
  });
}

var __aqModal = null;
function getAqModal() {
  var el = document.getElementById('modal-add-question');
  if (!el || !window.bootstrap || !bootstrap.Modal) return null;
  /* Sau khi AJAX swap, element cu bi go -> dung getOrCreateInstance (khong cache). */
  try { return bootstrap.Modal.getOrCreateInstance(el); } catch (e) { return null; }
}

// CKEditor 5 tao tren #aq-prompt; null = vans dung textarea thuong.
// Gian tren window de initAdminTopics() lan sau (sau AJAX swap) tim duoc the bi
// gan vao DOM da bi go, huy bo truoc khi tao cai moi.
var __aqEditorTried = false;
window.__aqEditor = null;

// Ô "Nội dung câu hỏi" dùng đúng bảng gợi ý ký hiệu của lúc làm bài tự luận
// (static/js/math_suggest.js). Key không phải số nên không đụng qid câu hỏi mà
// bảng này từng nhận ở trang luyện tập.
var AQ_SUGGEST_KEY = 'aq-prompt';

function aqSuggestMount(host) {
  if (!host || !window.mathSuggestMount) return;
  try { window.mathSuggestMount(host, AQ_SUGGEST_KEY); } catch (e) { /* ô vẫn gõ được tay */ }
}

// Tao editor sau khi modal hien ra (CKEditor do kich thuuc luc khoi tao)
function aqEditorInit() {
  if (__aqEditorTried) return;
  __aqEditorTried = true;
  var el = document.getElementById('aq-prompt');
  if (!el || !window.ClassicEditor) { aqSuggestMount(el); return; }
  // licenseKey 'GPL' là bắt buộc với bản CKEditor tự host, không có thì create() fail
  window.ClassicEditor.create(el, { licenseKey: 'GPL', language: { ui: 'vi', content: 'vi' } })
    .then(function (editor) {
      // Neu AJAX swap xay ra luc dang create, el da bi go -> editor vo nghia.
      if (!document.body.contains(el)) { try { editor.destroy(); } catch (e) {} return; }
      window.__aqEditor = editor;
      // Nút "Gợi ý ∑" chỉ gắn được SAU khi editor dựng xong thanh công cụ của nó.
      aqSuggestMount(editor);
    })
    .catch(function (err) {
      if (window.console) console.warn('CKEditor khong san sang:', err);
      window.__aqEditor = null;
      __aqEditorTried = false;
      // Lúc này ô vẫn là textarea thường nên phải có nút chèn ký hiệu. Nếu lượt mở popup
      // sau CKEditor dựng được, math_suggest.js sẽ gỡ bar tạm này thay vì để hai nút.
      aqSuggestMount(el);
    });
}

function aqEditorValue() {
  if (window.__aqEditor) return window.__aqEditor.getData();
  return (document.getElementById('aq-prompt').value || '').trim();
}

function aqEditorClear() {
  if (window.__aqEditor) { window.__aqEditor.setData(''); return; }
  var el = document.getElementById('aq-prompt');
  if (el) el.value = '';
}

// Noi dung thuc sau khi bo the HTML — CKEditor luong tra ve <p>&nbsp;</p>
function aqEditorIsEmpty(html) {
  var text = String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ');
  return text.trim() === '';
}

/* ==========================================================================
   Ba cách nhập ở tab "Nhập thủ công": bàn phím / ảnh (OCR) / giọng nói.
   Cả ba đều viết vào ô "Nội dung câu hỏi" nên ô đó luôn hiện.
   ========================================================================== */
var __aqPrompts = [];        // danh sách câu OCR được từ ảnh (một ảnh có thể nhiều câu)
var __aqRec = null;          // SpeechRecognition đọc đề bài
var __aqVoiceOn = false;
var __aqVoiceRestarts = 0;
var AQ_VOICE_START = '🎤 Đọc đề bài';
var AQ_VOICE_STOP = '🛑 Dừng đọc đề';
var AQ_VOICE_FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture'];

// OCR và giọng nói trả ra chữ thuần, còn ô nội dung là HTML (CKEditor) -> phải
// bọc mỗi dòng trong <p> và thoát ký tự đặc biệt, không thì nội dung bị hiểu là thẻ HTML.
function aqTextToHtml(text) {
  return String(text || '').split(/\r?\n/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; })
    .map(function (s) { return '<p>' + escapeHtml(s) + '</p>'; })
    .join('');
}

function aqSetPlainText(text) {
  if (window.__aqEditor) { window.__aqEditor.setData(aqTextToHtml(text)); return; }
  var el = document.getElementById('aq-prompt');
  if (el) el.value = String(text || '').trim();
}

// Nối dần cho giọng nói: đọc từng câu, câu nào chốt thì thêm vào cuối nội dung.
function aqAppendPlainText(text) {
  var t = String(text || '').trim();
  if (!t) return;
  if (window.__aqEditor) {
    window.__aqEditor.setData(window.__aqEditor.getData() + aqTextToHtml(t));
    return;
  }
  var el = document.getElementById('aq-prompt');
  if (el) el.value = (el.value.trim() ? el.value.trim() + ' ' : '') + t;
}

function switchAqMethod(name) {
  document.querySelectorAll('#aq-methods .aq-method').forEach(function (b) {
    var on = b.getAttribute('data-aq-method') === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('.aq-method-pane').forEach(function (p) {
    p.style.display = p.getAttribute('data-aq-method-pane') === name ? '' : 'none';
  });
  if (name !== 'voice') aqVoiceStop();   // mic không được còn mở khi rời cách nhập này
}

function aqImageReset() {
  __aqPrompts = [];
  var f = document.getElementById('aq-image-file');
  if (f) f.value = '';
  var s = document.getElementById('aq-image-status');
  if (s) { s.textContent = ''; s.className = 'mt-2 text-muted'; }
  var r = document.getElementById('aq-image-results');
  if (r) r.innerHTML = '';
}

function aqImageStatus(msg, cls) {
  var el = document.getElementById('aq-image-status');
  if (!el) return;
  el.className = 'mt-2 ' + (cls || 'text-muted');
  el.textContent = msg;
}

// Ảnh có nhiều câu thì cho chọn từng câu; một câu thì vào thẳng ô nội dung.
function aqShowImagePrompts() {
  var box = document.getElementById('aq-image-results');
  if (!box) return;
  var list = __aqPrompts || [];
  if (!list.length) { box.innerHTML = ''; return; }
  if (list.length === 1) {
    aqSetPlainText(list[0]);
    box.innerHTML = '<div class="form-text">Đã đọc xong. Kiểm tra lại ô nội dung rồi lưu câu hỏi.</div>';
    return;
  }
  var html = '<div class="form-text">Ảnh có ' + list.length +
             ' câu. Nhấn một câu để đưa vào ô nội dung.</div><div class="list-group">';
  list.forEach(function (p, i) {
    var shown = p.length > 160 ? p.slice(0, 160) + '…' : p;
    // OCR thường đã giữ nguyên nhãn "Câu 2:" trong ảnh -> chỉ thêm nhãn khi thiếu,
    // không thì danh sách hiện trùng ("Câu 2: Câu 2: ...").
    var coNhan = /^\s*(câu|cau)\s*\d/i.test(p) || /^\s*\d+\s*[.)]\s/.test(p);
    html += '<button type="button" class="list-group-item list-group-item-action aq-pick-prompt" ' +
            'data-idx="' + i + '">' +
            (coNhan ? '' : '<strong>Câu ' + (i + 1) + ':</strong> ') + escapeHtml(shown) + '</button>';
  });
  box.innerHTML = html + '</div>';
  // Danh sách câu đọc từ ảnh: hiển thị số theo chuẩn VN như mọi trang khác
  if (window.renderPageMath) window.renderPageMath(box);
}

function readQuestionFromImage() {
  var input = document.getElementById('aq-image-file');
  var file = input && input.files && input.files[0];
  if (!file) { aqImageStatus('Chưa chọn ảnh.', 'text-danger'); return; }

  var btn = document.getElementById('aq-image-read');
  var origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Đang đọc ảnh...';
  aqImageStatus('Đang nhận dạng nội dung trong ảnh — thường mất vài giây, nhưng ảnh có '
                + 'công thức phải dùng model thị giác nên có thể chờ tới ~12 phút...');
  var box = document.getElementById('aq-image-results');
  if (box) box.innerHTML = '';

  var fd = new FormData();
  fd.append('file', file);
  fetch(URL_QUESTION_FROM_IMAGE, { method: 'POST', body: fd })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      btn.textContent = origText;
      if (!d || !d.ok) { aqImageStatus((d && d.error) || 'Không đọc được ảnh.', 'text-danger'); return; }
      __aqPrompts = d.prompts || [];
      aqImageStatus(d.note || 'Đã đọc xong ảnh.', 'text-success');
      aqShowImagePrompts();
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = origText;
      aqImageStatus('Lỗi kết nối khi gửi ảnh.', 'text-danger');
    });
}

function aqVoiceUi(on) {
  var btn = document.getElementById('aq-voice-toggle');
  if (!btn) return;
  btn.textContent = on ? AQ_VOICE_STOP : AQ_VOICE_START;
  btn.classList.toggle('btn-danger', on);
  btn.classList.toggle('btn-primary', !on);
}

function aqVoiceStatus(msg, cls) {
  var el = document.getElementById('aq-voice-status');
  if (!el) return;
  el.className = 'mt-2 ' + (cls || 'text-muted');
  el.textContent = msg;
}

function aqVoiceCaption(msg) {
  var el = document.getElementById('aq-voice-caption');
  if (el) el.textContent = msg;
}

function aqVoiceStop() {
  __aqVoiceOn = false;
  if (__aqRec) { try { __aqRec.stop(); } catch (e) { /* đã dừng */ } }
  aqVoiceUi(false);
}

function aqVoiceToggle() {
  if (__aqVoiceOn) { aqVoiceStop(); aqVoiceStatus('Đã dừng đọc đề.'); return; }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    aqVoiceStatus('Trình duyệt không có nhận dạng giọng nói — hãy dùng bàn phím hoặc upload ảnh.',
                  'text-danger');
    return;
  }
  if (!__aqRec) {
    __aqRec = new SR();
    __aqRec.lang = 'vi-VN';
    __aqRec.interimResults = true;
    __aqRec.maxAlternatives = 1;
    __aqRec.continuous = true;              // giữ phiên qua chỗ ngắt nhỏ khi đọc đề

    __aqRec.onresult = function (ev) {
      __aqVoiceRestarts = 0;               // có chữ thì được phép mở lại mic
      var interim = '', final = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      if (final.trim()) { aqAppendPlainText(final); aqVoiceCaption(''); return; }
      aqVoiceCaption('…' + interim);
    };
    __aqRec.onerror = function (ev) {
      var code = (ev && ev.error) || 'unknown';
      var msg = code === 'not-allowed' ? 'Trình duyệt chặn micro — bật quyền rồi thử lại'
        : code === 'service-not-allowed' ? 'Dịch vụ nhận dạng bị chặn — thử lại sau'
        : code === 'audio-capture' ? 'Không tìm thấy micro'
        : code === 'no-speech' ? 'Không nghe thấy gì'
        : code === 'aborted' ? ''
        : 'Nhận dạng giọng nói lỗi (' + code + ')';
      if (msg) aqVoiceStatus(msg, 'text-danger');
      if (AQ_VOICE_FATAL.indexOf(code) >= 0) aqVoiceStop();
    };
    // Im lặng lâu thì Chrome kết thúc phiên: mở lại nếu người dùng chưa bấm dừng, nhưng
    // tự dừng sau vài lần để không thành vòng lặp mở mic vô hạn.
    __aqRec.onend = function () {
      if (!__aqVoiceOn) { aqVoiceUi(false); return; }
      if (++__aqVoiceRestarts > 8) {
        aqVoiceStop();
        aqVoiceStatus('Mic tạm dừng vì không nghe thấy gì — nhấn nút để đọc tiếp.');
        return;
      }
      setTimeout(function () {
        if (!__aqVoiceOn) return;
        try { __aqRec.start(); } catch (e) { /* đang chạy */ }
      }, 300);
    };
  }
  __aqVoiceOn = true;
  __aqVoiceRestarts = 0;
  aqVoiceCaption('');
  aqVoiceStatus('Đang nghe — đọc to đề bài, chữ sẽ hiện vào ô Nội dung câu hỏi.');
  aqVoiceUi(true);
  try { __aqRec.start(); } catch (e) { /* đang chạy */ }
}

// Mở modal tạo câu hỏi cho bài học SGK
function openAddQuestionForTopic(tid, tname, grade) {
  var modal = getAqModal();
  if (!modal) return;
  document.getElementById('aq-topic-id').value = tid;
  document.getElementById('aq-topic-name').textContent = tname;
  // Reset tab manual
  aqEditorClear();
  document.getElementById('aq-grade').value = (grade && grade > 0) ? grade : 6;
  document.getElementById('aq-source').value = '';
  aqVoiceStop();
  aqImageReset();
  switchAqMethod('keyboard');
  // Reset tab AI
  document.getElementById('aq-ai-grade').value = (grade && grade > 0) ? grade : 6;
  document.getElementById('aq-ai-count').value = 5;
  document.getElementById('aq-ai-diff').value = 'trung bình';
  document.getElementById('aq-ai-status').textContent = '';
  document.getElementById('aq-ai-results').innerHTML = '';
  // Khối gợi ý luôn đóng khi mở modal: lần trước gõ gì không được âm thầm sinh lại.
  aqAiHintReset();
  document.getElementById('aq-msg').textContent = '';
  // Luôn mở ở tab Nhập thủ công
  switchAqTab('manual');
  modal.show();
}

// Chuyển đổi giữa 2 tab
function switchAqTab(name) {
  var tabs = document.querySelectorAll('#aq-tabs .nav-link');
  tabs.forEach(function(t) {
    if (t.getAttribute('data-aq-tab') === name) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  var manualPane = document.getElementById('aq-pane-manual');
  var aiPane = document.getElementById('aq-pane-ai');
  var saveBtn = document.getElementById('aq-save');
  if (name === 'ai') {
    manualPane.style.display = 'none';
    aiPane.style.display = '';
    if (saveBtn) saveBtn.style.display = 'none';
  } else {
    manualPane.style.display = '';
    aiPane.style.display = 'none';
    if (saveBtn) saveBtn.style.display = '';
  }
  document.getElementById('aq-msg').textContent = '';
}

/* ==========================================================================
  Tab AI: hỏi "Có cần gợi ý nội dung không?" trước khi sinh. Đồng ý thì giáo viên
   viết yêu cầu (dạng bài, số liệu, tình huống) và AI soạn câu đúng theo yêu cầu đó;
   từ chối thì sinh thẳng như trước.
   ========================================================================== */
function aqAiStatus(msg, cls) {
  var el = document.getElementById('aq-ai-status');
  if (el) {
    el.textContent = msg;
    el.className = cls || '';
  }
}

function aqAiTopicId() {
  var el = document.getElementById('aq-topic-id');
  var tid = parseInt((el && el.value) || '0', 10);
  if (!tid) aqAiStatus('Thiếu bài học SGK', 'text-danger');
  return tid;
}

function aqAiHintReset() {
  var ask = document.getElementById('aq-ai-hint-ask');
  var panel = document.getElementById('aq-ai-hint');
  var box = document.getElementById('aq-ai-hint-text');
  if (ask) ask.style.display = 'none';
  if (panel) panel.style.display = 'none';
  if (box) box.value = '';
}

// Bấm "Sinh & Lưu câu hỏi": chỉ hỏi lại có cần gợi ý nội dung hay không, chưa gọi AI.
function askAiContentHint() {
  if (!aqAiTopicId()) return;
  var ask = document.getElementById('aq-ai-hint-ask');
  var panel = document.getElementById('aq-ai-hint');
  // Template cũ không có hộp hỏi (hoặc DOM đã bị AJAX thay) thì sinh thẳng, không treo nút.
  if (!ask || !panel) {
    generateQuestionsAI('');
    return;
  }
  panel.style.display = 'none';
  ask.style.display = '';
  var yes = document.getElementById('aq-ai-hint-yes');
  if (yes) yes.focus();
}

// Trả lời "Có": mở ô nhập gợi ý nội dung.
function showContentHintInput() {
  var ask = document.getElementById('aq-ai-hint-ask');
  var panel = document.getElementById('aq-ai-hint');
  if (ask) ask.style.display = 'none';
  if (panel) panel.style.display = '';
  var box = document.getElementById('aq-ai-hint-text');
  if (box) box.focus();
}

function generateFromContentHint() {
  var box = document.getElementById('aq-ai-hint-text');
  var hint = ((box && box.value) || '').trim();
  if (!hint) {
    aqAiStatus('Chưa có nội dung gợi ý — hãy viết yêu cầu, hoặc bấm "Bỏ gợi ý, sinh luôn".',
               'text-warning');
    return;
  }
  generateQuestionsAI(hint);
}

// Trả lời "Không" (hoặc đổi ý sau khi đã gõ): đóng cả hộp hỏi lẫn ô nhập rồi sinh không gợi ý.
function skipContentHint() {
  aqAiHintReset();
  generateQuestionsAI('');
}

// Bốn loại bài AI soạn được, key -> nhãn in trên nút radio. Cùng bộ key với cột
// questions.question_format, nên nhãn dưới đây là chỗ duy nhất dịch key ra chữ Việt.
var AQ_AI_FORMATS = { 'trac_nghiem': 'trắc nghiệm', 'tu_luan': 'tự luận',
                      'dung_sai': 'Đúng/Sai', 'tra_loi_ngan': 'trả lời ngắn' };

// Radio "Loại bài": trả đúng key DB, mặc định trắc nghiệm khi không chọn loại nào.
function aqAiFormat() {
  var el = document.querySelector('input[name="aq-ai-format"]:checked');
  var v = el && el.value;
  return AQ_AI_FORMATS[v] ? v : 'trac_nghiem';
}

function aqAiBusy(busy, label) {
  /* Khoá cả ba nút sinh khi đang chờ AI: bấm thêm "Sinh theo gợi ý" lần nữa là nhân đôi
     đề bài vào DB, mà một lượt sinh đã mất hàng chục giây nên rất dễ bấm lại. */
  var ids = ['aq-ai-generate', 'aq-ai-hint-go', 'aq-ai-hint-skip'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.disabled = busy;
  }
  var gen = document.getElementById('aq-ai-generate');
  if (gen && label) gen.textContent = busy ? 'Đang sinh...' : label;
}

// Sinh câu hỏi bằng AI và lưu luôn vào DB. `hint` = nội dung gợi ý giáo viên nhập ở
// khối "Có cần gợi ý nội dung không?"; rỗng = không gợi ý, AI tự do trong bài học SGK.
function generateQuestionsAI(hint) {
  hint = (hint || '').trim();
  var tid = aqAiTopicId();
  if (!tid) return;
  var tname = (document.getElementById('aq-topic-name').textContent || '').trim();
  var count = parseInt(document.getElementById('aq-ai-count').value || '5', 10);
  var diff = document.getElementById('aq-ai-diff').value;
  var grade = parseInt(document.getElementById('aq-ai-grade').value || '6', 10);
  var fmt = aqAiFormat();
  var fmtLabel = AQ_AI_FORMATS[fmt];
  var statusEl = document.getElementById('aq-ai-status');
  var resultsEl = document.getElementById('aq-ai-results');

  if (count < 1) count = 1;
  //tuetc
  // if (count > 10) count = 10;

  var origText = document.getElementById('aq-ai-generate').textContent;
  aqAiBusy(true, origText);
  statusEl.className = 'text-muted';
  statusEl.textContent = 'Đang gọi AI sinh ' + count + ' câu hỏi ' + fmtLabel
    + ' cho bài học SGK "' + tname + '"'
    + (hint ? ' theo gợi ý đã nhập' : '') + '...';
  resultsEl.innerHTML = '';

  fetch(URL_AI_GENERATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic_id: tid,
      topic: tname,
      grade: grade,
      count: count,
      difficulty: diff,
      hint: hint,
      question_format: fmt,
      save: true
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    aqAiBusy(false, origText);
    if (d && d.ok) {
      var saved = (d.saved_ids && d.saved_ids.length) ? d.saved_ids.length : 0;
      var unv = (d.skipped_unverified || []).length;
      var short = (d.requested && (d.questions || []).length < d.requested)
        ? ' AI chỉ sinh được ' + (d.questions || []).length + '/' + d.requested + ' câu (máy đang bận).' : '';
      statusEl.textContent = 'Đã lưu ' + saved + ' câu hỏi ' + fmtLabel
        + ' vào bài học SGK "' + tname + '".'
        + (unv ? ' Bỏ ' + unv + ' câu vì lời giải không xác nhận đáp án đúng.' : '') + short;
      statusEl.className = (unv || short) ? 'text-warning' : 'text-success';
      // Hiển thị danh sách câu hỏi đã sinh
      var html = '<ul class="list-group">';
      (d.questions || []).forEach(function(q, i) {
        var extra = '';
        if (q.statements && q.statements.length) {
          // Chỉ liệt kê nội dung bốn phát biểu, không in cờ Đúng/Sai: model tự khai thì
          // chưa được lưu, đáp án do "Sinh đáp án" kiểm chứng và ghi sau.
          extra = '<ul class="mb-0">' + q.statements.map(function(s, k) {
            return '<li>' + 'abcd'.charAt(k) + '. ' + (s.text || '') + '</li>';
          }).join('') + '</ul>';
        } else if (q.answer) {
          extra = '<div class="text-muted">Kết quả model nêu: ' + q.answer + '</div>';
        }
        html += '<li class="list-group-item"><strong>Câu ' + (i + 1) + ':</strong> ' +
          (q.prompt || '') + extra + '</li>';
      });
      html += '</ul>';
      if (fmt === 'dung_sai' || fmt === 'tra_loi_ngan') {
        html += '<div class="text-muted mt-2">Đã lưu đề bài, chưa lưu phần trả lời.'
          + ' Ở trang Quản lý câu hỏi, bấm "Sinh đáp án (theo kiểu câu)" để AI tự giải,'
          + ' đối chiếu rồi ghi đáp án cho từng câu.</div>';
      }
      resultsEl.innerHTML = html;
      if (window.renderPageMath) window.renderPageMath(resultsEl);
      setTimeout(function() {
        var modal = getAqModal();
        if (modal) modal.hide();
      }, 1500);
    } else {
      statusEl.textContent = 'Lỗi: ' + (d.error || 'Không sinh được câu hỏi');
      statusEl.className = 'text-danger';
    }
  })
  .catch(function() {
    aqAiBusy(false, origText);
    statusEl.textContent = 'Lỗi kết nối';
    statusEl.className = 'text-danger';
  });
}

// Lưu câu hỏi
function saveQuestionForTopic() {
  var tid = parseInt(document.getElementById('aq-topic-id').value || '0', 10);
  var prompt = aqEditorValue();
  var grade = parseInt(document.getElementById('aq-grade').value || '6', 10);
  var source = (document.getElementById('aq-source').value || '').trim();
  var msgEl = document.getElementById('aq-msg');

  if (!tid) {
    msgEl.textContent = 'Thiếu bài học SGK';
    msgEl.className = 'text-danger';
    return;
  }
  if (!prompt || aqEditorIsEmpty(prompt)) {
    msgEl.textContent = 'Vui lòng nhập nội dung câu hỏi';
    msgEl.className = 'text-danger';
    return;
  }

  var btn = document.getElementById('aq-save');
  btn.disabled = true;
  var origText = btn.textContent;
  btn.textContent = 'Đang lưu...';

  fetch(URL_ADD_QUESTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt,
      grade: grade,
      source_url: source,
      topic_ids: [tid]
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    btn.disabled = false;
    btn.textContent = origText;
    if (d && d.ok) {
      msgEl.textContent = 'Đã lưu câu hỏi #' + d.id;
      msgEl.className = 'text-success';
      aqEditorClear();
      setTimeout(function() {
        var modal = getAqModal();
        if (modal) modal.hide();
      }, 800);
    } else {
      msgEl.textContent = 'Lỗi lưu câu hỏi';
      msgEl.className = 'text-danger';
    }
  })
  .catch(function() {
    btn.disabled = false;
    btn.textContent = origText;
    msgEl.textContent = 'Lỗi kết nối';
    msgEl.className = 'text-danger';
  });
}

function initAdminTopics() {
  // Sau AJAX swap: editor cu co the gan tren DOM da bi go -> huy bo va cho phep tao lai.
  if (window.__aqEditor) {
    var staleEditor = window.__aqEditor;
    window.__aqEditor = null;
    try { staleEditor.destroy(); } catch (e) {}
  }
  __aqEditorTried = false;
  // Bộ nhận dạng cũ gắn trên DOM đã bị gỡ: dừng mic rồi bỏ hẳn để tạo cái mới.
  aqVoiceStop();
  __aqRec = null;
  __aqPrompts = [];

  // CKEditor can do kich thuuc cua so -> khoi tao khi modal da hien
  var aqModalEl = document.getElementById('modal-add-question');
  if (aqModalEl) {
    aqModalEl.addEventListener('shown.bs.modal', aqEditorInit);
  }

  // Nút lưu trong modal
  var saveBtn = document.getElementById('aq-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveQuestionForTopic);
  }

  // Chuyển đổi tab trong modal
  document.querySelectorAll('#aq-tabs .nav-link').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchAqTab(tab.getAttribute('data-aq-tab'));
    });
  });

  // 3 cách nhập ở tab "Nhập thủ công"
  document.querySelectorAll('#aq-methods .aq-method').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchAqMethod(btn.getAttribute('data-aq-method'));
    });
  });
  var imgBtn = document.getElementById('aq-image-read');
  if (imgBtn) imgBtn.addEventListener('click', readQuestionFromImage);
  var voiceBtn = document.getElementById('aq-voice-toggle');
  if (voiceBtn) voiceBtn.addEventListener('click', aqVoiceToggle);
  var imgResults = document.getElementById('aq-image-results');
  if (imgResults) {
    // Danh sách câu OCR vẽ lại bằng innerHTML -> gắn nút trên container để bắt cả ô mới.
    imgResults.addEventListener('click', function (ev) {
      var pick = ev.target.closest ? ev.target.closest('.aq-pick-prompt') : null;
      if (!pick) return;
      var i = parseInt(pick.getAttribute('data-idx') || '0', 10);
      aqSetPlainText(__aqPrompts[i] || '');
      document.querySelectorAll('#aq-image-results .aq-pick-prompt').forEach(function (n) {
        n.classList.toggle('active', n === pick);
      });
    });
  }

  // Nút sinh câu hỏi AI: bấm vào là hỏi "Có cần gợi ý nội dung không?" trước, không sinh ngay.
  var aiGenBtn = document.getElementById('aq-ai-generate');
  if (aiGenBtn) {
    aiGenBtn.addEventListener('click', function() { askAiContentHint(); });
  }
  var aiHintYes = document.getElementById('aq-ai-hint-yes');
  if (aiHintYes) {
    aiHintYes.addEventListener('click', showContentHintInput);
  }
  var aiHintNo = document.getElementById('aq-ai-hint-no');
  if (aiHintNo) {
    aiHintNo.addEventListener('click', skipContentHint);
  }
  var aiHintGo = document.getElementById('aq-ai-hint-go');
  if (aiHintGo) {
    aiHintGo.addEventListener('click', generateFromContentHint);
  }
  var aiHintSkip = document.getElementById('aq-ai-hint-skip');
  if (aiHintSkip) {
    aiHintSkip.addEventListener('click', skipContentHint);
  }

  // Nút "Tạo câu hỏi" trên từng dòng bài học SGK
  document.querySelectorAll('.add-q-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tid = parseInt(btn.getAttribute('data-tid') || '0', 10);
      var tname = btn.getAttribute('data-tname') || '';
      var grade = parseInt(btn.getAttribute('data-grade') || '0', 10);
      openAddQuestionForTopic(tid, tname, grade);
    });
  });

  // Xử lý xóa bài học SGK
  document.querySelectorAll('form.topic-delete-form').forEach(function(f) {
    f.addEventListener('submit', function(ev) {
      ev.preventDefault();
      var tid = f.querySelector('input[name="id"]').value;
      var fd = new FormData();
      fd.append('id', tid);
      fetch(URL_TOPICS_CHECK_DELETE, { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (!d.ok) { f.submit(); return; }
          if (d.has_questions) {
            /* Câu hỏi nằm trong bài học SGK bị xóa là mất theo — hỏi lại một lượt nữa. */
            askConfirm('Bài học SGK này có các câu hỏi, bạn có muốn xóa không', function () {
              f.querySelector('input[name="mode"]').value = 'with_questions';
              f.submit();
            });
            return;
          }
          f.querySelector('input[name="mode"]').value = '';
          f.submit();
        })
        .catch(function() { f.submit(); });
    });
  });
}

// DOMContentLoaded chi chay mot lan -> sau AJAX swap can goi lai truc tiep.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminTopics);
} else {
  initAdminTopics();
}
