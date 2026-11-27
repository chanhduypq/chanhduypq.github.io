var currentQ = null;
function getModal(id){ try{ var el=document.getElementById(id); if(!el) return null; if(!window.bootstrap || !bootstrap.Modal) return null; /* Sau AJAX swap element cu bi go -> getOrCreateInstance, khong cache theo id. */ return bootstrap.Modal.getOrCreateInstance(el); }catch(e){ return null; } }

/* showToast nay o static/js/common.js — dung chung voi trang Nap bai tap. */

var routes = {
  topicsByGrade: '/admin_topics_by_grade',
  updateQuestion: '/admin_update_question',
  bulkUpdateQuestions: '/admin_bulk_update_questions',
  setOptions: '/admin_set_options',
  generateSimilar: '/admin_generate_similar_questions',
  verifySimilar: '/admin_verify_similarity',
  deleteQuestion: '/admin_delete_question',
  getOptions: '/admin_get_options',
  optionsHtml: '/admin_question_options_html',
  questionSettings: '/admin_question_settings',
  bulkReview: '/admin_bulk_review_questions',
  dedupeOptions: '/admin_dedupe_options',
  bulkDedupeOptions: '/admin_bulk_dedupe_options',
  bulkDeleteQuestions: '/admin_bulk_delete_questions',
  reclassify: '/admin_reclassify_questions',
  bulkAiContent: '/admin_bulk_ai_content',
  bulkFlagNumber: '/admin_flag_number_questions',
  bulkFixAnswers: '/admin_bulk_fix_answers',
  bulkCheckAnswers: '/admin_bulk_check_answers',
  bulkCheckDuplicates: '/admin_bulk_check_duplicates',
  bulkCloneEssay: '/admin_bulk_clone_essay',
  bulkDropOptions: '/admin_bulk_drop_options',
  bulkDropSolutions: '/admin_bulk_drop_solutions',
  bulkTrimResultLines: '/admin_bulk_trim_result_lines',
  generateOptions: '/admin_generate_options',
  adminQuestions: '/admin_questions'
};

function rowClick(qid){ openEditQuestion(qid); }
function openChange(qid){ currentQ=qid; var modal=getModal('modal-change'); if(modal){ modal.show(); } var gsel=document.getElementById('chg-grade'); var tsel=document.getElementById('chg-topics'); if(gsel){ gsel.value=''; } if(tsel){ tsel.innerHTML=''; }
  if(gsel){ gsel.onchange=function(){ var g=gsel.value||''; if(tsel){ tsel.innerHTML=''; } if(!g){ return; } fetch(routes.topicsByGrade+'?grade='+encodeURIComponent(g)).then(function(r){ return r.json(); }).then(function(d){ var items=(d.topics||[]); if(tsel){ tsel.innerHTML=''; items.forEach(function(t){ var op=document.createElement('option'); op.value=t.id; op.textContent=t.name; tsel.appendChild(op); }); } }); } }
}
function closeChange(){ currentQ=null; var modal=getModal('modal-change'); if(modal){ modal.hide(); } }
function applyChange(){ var gval=(document.getElementById('chg-grade').value||''); if(!gval){ showToast('Vui lòng chọn lớp'); return; } var g=parseInt(gval); var sel=document.getElementById('chg-topics'); var tids=Array.from(sel.selectedOptions).map(function(o){ return parseInt(o.value); }); busyFetch(routes.updateQuestion, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: currentQ, new_grade: g, topic_ids: tids})}).then(function(r){ return r.json(); }).then(function(d){ if(d && d.ok){ showToast('Đã cập nhật'); closeChange(); location.reload(); } else { showToast(errText(d, 'không cập nhật được')); } }); }

function errText(d, fallback){ return (window.qeErrorText ? window.qeErrorText(d, fallback) : fallback); }

/* Loading chung của hệ thống do ajax.js nắm (AJAX.busyFetch): cùng bộ đếm `pending`,
   cùng lớp phủ .ajax-overlay chặn mọi cú bấm và thanh tiến trình ở đỉnh trang như mọi
   trang khác. Trang này gọi fetch trực tiếp chứ không đi qua AJAX.load nên đi qua hàm
   bọc; thiếu ajax.js (trang mở một mình) thì rơi về fetch cũ, hành động vẫn chạy. */
function busyFetch(url, init){
  return (window.AJAX && window.AJAX.busyFetch) ? window.AJAX.busyFetch(url, init) : fetch(url, init);
}

/* Câu nằm trong đề thi thì server từ chối CẢ LÔ xóa, nên phải nói rõ mã nào đang chặn:
   nếu không, người quản lý chỉ thấy "không xóa được" mà không biết bỏ câu nào ra khỏi
   lựa chọn. (Dùng cho cả nút Xóa từng câu và "Xóa hẳn hàng loạt".) */
function deleteErrText(d, fallback){
  var text = errText(d, fallback);
  var ids = (d && d.error === 'in_exam' && d.blocked) || [];
  if(ids.length){
    text += ' — câu ' + ids.slice(0, 5).join(', ') + (ids.length > 5 ? ', …' : '');
  }
  return text;
}


function toggleVisible(qid, current){
  var next = current ? 0 : 1;
  busyFetch(routes.questionSettings, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids:[qid], visible: next})}).then(function(r){ return r.json(); }).then(function(d){
    if(d && d.ok){ showToast(next ? 'Đã duyệt: câu hỏi ra trong bài làm của học sinh' : 'Đã bỏ duyệt: câu hỏi chuyển về chờ duyệt'); refreshRowVisibility(qid, next); }
    else { showToast(errText(d, 'không đổi được trạng thái duyệt')); }
  }).catch(function(){ showToast('Lỗi mạng'); });
}
function refreshRowVisibility(qid, next){
  var badge = document.querySelector('[data-visible-badge="' + qid + '"]');
  if(badge){ badge.textContent = next ? 'Đã duyệt' : 'Chờ duyệt'; badge.className = 'badge ' + (next ? 'bg-secondary' : 'badge-hidden bg-dark'); }
  var btn = document.querySelector('[data-toggle-visible="' + qid + '"]');
  if(btn){ btn.textContent = next ? 'Bỏ duyệt' : 'Duyệt'; }
}

// Do kho chon truc tiep tu combobox (Dễ / Trung bình / Khó / Vận dụng cao) — lưu ngay khi đổi.
var DIFF_LABEL = { de: 'Dễ', trung_binh: 'Trung bình', kho: 'Khó', van_dung_cao: 'Vận dụng cao' };
function saveDifficulty(qid, value){
  var sel = document.querySelector('[data-difficulty-select="' + qid + '"]');
  if(sel){ sel.disabled = true; }
  busyFetch(routes.questionSettings, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids:[qid], difficulty: value})}).then(function(r){ return r.json(); }).then(function(d){
    if(sel){ sel.disabled = false; }
    if(d && d.ok){ refreshRowDifficulty(qid, value); showToast('Độ khó: ' + DIFF_LABEL[value]); }
    else { showToast(errText(d, 'không đổi được độ khó')); }
  }).catch(function(){ if(sel){ sel.disabled = false; } showToast('Lỗi mạng'); });
}
function refreshRowDifficulty(qid, value){
  var sel = document.querySelector('[data-difficulty-select="' + qid + '"]');
  if(sel){ sel.setAttribute('data-difficulty', value); if(sel.value !== value){ sel.value = value; } }
}
function bulkReview(ids, visible){
  askConfirm((visible ? 'Duyệt ' : 'Bỏ duyệt ') + ids.length + ' câu hỏi đã chọn?', function(){
    busyFetch(routes.bulkReview, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids, visible: visible})}).then(function(r){ return r.json(); }).then(function(d){
      if(d && d.ok){ showToast('Đã cập nhật ' + d.updated + ' câu hỏi'); location.reload(); }
      else { showToast(errText(d, 'không cập nhật hàng loạt được')); }
    });
  });
}
// Hai cờ per-question (questions.allow_explain / allow_lesson): admin cho phép hay
// không cho phép hiện nút "Giải thích lời giải" và "Xem lý thuyết" trên
// trang kết quả làm bài + trang chi tiết lịch sử.
var FLAG_LABEL = { allow_explain: '"Giải thích lời giải"', allow_lesson: '"Xem lý thuyết"' };
function bulkSetFlag(ids, key, value){
  var mo = value ? 'Cho phép ' : 'Không cho phép ';
  askConfirm(mo + FLAG_LABEL[key] + ' ở ' + ids.length + ' câu hỏi đã chọn?', function(){
    var body = { question_ids: ids };
    body[key] = value;
    busyFetch(routes.questionSettings, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}).then(function(r){ return r.json(); }).then(function(d){
      if(d && d.ok){ showToast((value ? 'Đã cho phép ' : 'Đã tắt ') + FLAG_LABEL[key] + ' ở ' + d.updated + ' câu hỏi'); location.reload(); }
      else { showToast(errText(d, 'không đổi được quyền hiển thị nút')); }
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Chỉnh lại đáp án": lấy LỜI GIẢI ĐÃ LƯU của từng câu làm chuẩn (server không gọi
   model ở lượt này) và ghi đè đáp án đúng khi lời giải chỉ phương án khác. */
function bulkFixAnswers(ids){
  askConfirm('Đối chiếu '+ids.length+' câu hỏi đã chọn với LỜI GIẢI đang lưu?\n\n'
      + 'Câu nào có lời giải chỉ đáp án khác sẽ được ghi lại đáp án đúng.\n'
      + 'Câu chưa có lời giải sẽ được bỏ qua (hãy bấm "Giải thích lời giải" cho từng câu, '
      + 'hoặc chạy tools/generate_missing_solutions.py trước).', function(){
    showToast('Đang đối chiếu lời giải…');
    busyFetch(routes.bulkFixAnswers, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không chỉnh lại đáp án được')); return; }
      var msg = 'Đã chỉnh '+ (d.fixed||[]).length +' câu · '+(d.matched||0)+' câu đã đúng'
        + ' trong '+d.requested+' câu';
      var chiTiet = (d.fixed||[]).slice(0,3).map(function(f){
        return '#'+f.question_id+(f.to===f.from ? ' (sửa chữ đáp án)' : ' '+f.from+'→'+f.to);
      }).join(', ');
      if(chiTiet){ msg += ': ' + chiTiet + ((d.fixed||[]).length>3 ? '…' : ''); }
      var sk = d.skipped||[];
      if(sk.length){ msg += ' · bỏ qua '+sk.length+' câu ('+(sk[0].note||'chưa có lời giải')+')'; }
      showToast(msg);
      location.reload();
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Đối chiếu lời giải với đáp án đúng": bản CHỈ ĐỌC của hành động trên — server so đáp án
   đang đánh dấu đúng với đáp án của lời giải đang lưu, không ghi gì xuống DB, và trả về
   danh sách câu lệch để tô đỏ tại chỗ. Không tải lại trang vì tải lại là mất dấu đỏ. */
var CHECK_SKIP_REASONS = { no_solution: 'chưa có lời giải',
  no_options: 'không có phương án trắc nghiệm',
  no_correct_flag: 'chưa đánh dấu đáp án đúng',
  unverified: 'lời giải không chốt được đáp án',
  not_found: 'không tồn tại', error: 'lỗi' };
function answerConflictText(c){
  if(c && c.flipped){ return 'Cờ Đúng/Sai lệch với lời giải (lật ý ' + c.flipped + ')'; }
  if(!c || !c.from){ return 'Đáp án lệch với lời giải'; }
  if(c.to === c.from){ return 'Đáp án lệch với lời giải (sửa chữ đáp án ' + c.from + ')'; }
  return 'Đáp án lệch với lời giải (' + c.from + ' → ' + c.to + ')';
}
function clearAnswerConflicts(){
  Array.from(document.querySelectorAll('.row-answer-conflict')).forEach(function(tr){
    tr.classList.remove('row-answer-conflict');
  });
  Array.from(document.querySelectorAll('[data-answer-check]')).forEach(function(b){
    b.textContent = ''; b.style.display = 'none';
  });
}
function markAnswerConflict(c){
  var qid = c && c.question_id; if(!qid) return;
  var row = document.querySelector('[data-question-row="' + qid + '"]');
  if(row){ row.classList.add('row-answer-conflict'); }
  var badge = document.querySelector('[data-answer-check="' + qid + '"]');
  if(badge){ badge.textContent = answerConflictText(c); badge.style.display = ''; }
}
function bulkCheckAnswers(ids){
  askConfirm('Đối chiếu '+ids.length+' câu hỏi đã chọn với LỜI GIẢI đang lưu?\n\n'
      + 'Hệ thống CHỈ so sánh, không sửa đáp án nào. Câu có đáp án không trùng với lời giải sẽ được tô đỏ.\n'
      + 'Câu chưa có lời giải sẽ được bỏ qua (hãy bấm "Giải thích lời giải" cho từng câu, '
      + 'hoặc chạy tools/generate_missing_solutions.py trước).', function(){
    showToast('Đang đối chiếu lời giải với đáp án…');
    busyFetch(routes.bulkCheckAnswers, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không đối chiếu được')); return; }
      clearAnswerConflicts();
      (d.conflicts||[]).forEach(markAnswerConflict);
      var n = (d.conflicts||[]).length;
      var msg = n ? ('Có '+n+'/'+d.requested+' câu có đáp án KHÔNG trùng lời giải — đã tô đỏ.')
                  : ('Cả '+d.requested+' câu đều trùng lời giải.');
      var sk = d.skipped||[];
      if(sk.length){
        var dem = {};
        sk.forEach(function(s){ dem[s.status] = (dem[s.status]||0)+1; });
        msg += ' Bỏ qua '+sk.length+' câu ('+Object.keys(dem).map(function(k){
          return dem[k]+' câu '+(CHECK_SKIP_REASONS[k]||k); }).join(', ')+').';
      }
      showToast(msg, 8000);
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Nhân bản thành Tự luận": mỗi câu đã chọn thêm MỘT câu Tự luận cùng đề bài, lớp, bài học SGK.
   Lời giải đang lưu của câu gốc trở thành nội dung trả lời của câu mới; câu gốc không bị
   sửa và không bị xóa. Server bỏ qua câu chưa có lời giải (xem clone_as_essay). */
var CLONE_REASONS = {no_solution:'chưa có lời giải', already_essay:'đã là tự luận',
  exists:'đã có bản sao tự luận', not_found:'không tồn tại', error:'lỗi'};
function bulkCloneEssay(ids){
  askConfirm('Nhân bản '+ids.length+' câu đã chọn thành câu TỰ LUẬN?\n\n'
      + 'Câu mới giữ nguyên đề bài, lớp, bài học SGK của câu gốc và mang lời giải đang lưu làm nội dung trả lời.\n'
      + 'Câu chưa có lời giải sẽ bị bỏ qua — hãy bấm "Giải thích lời giải" hoặc chạy tools/generate_missing_solutions.py trước.\n'
      + 'Câu gốc vẫn là trắc nghiệm, không bị sửa hay xóa.', function(){
    showToast('Đang nhân bản…');
    busyFetch(routes.bulkCloneEssay, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không nhân bản được')); return; }
      var msg = 'Đã tạo '+(d.created||[]).length+' câu tự luận trong '+d.requested+' câu đã chọn';
      var sk = d.skipped||[];
      if(sk.length){
        var dem = {};
        sk.forEach(function(s){ dem[s.reason] = (dem[s.reason]||0)+1; });
        msg += ' · bỏ qua '+sk.length+' câu ('+Object.keys(dem).map(function(k){
          return dem[k]+' câu '+(CLONE_REASONS[k]||k); }).join(', ')+')';
      }
      showToast(msg);
      location.reload();
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Kiểm tra phương án trùng": bản CHỈ ĐỌC — server so nội dung các phương án của từng câu
   với nhau (cùng luật LOWER(TRIM) mà modal "Xoá đáp án trùng" dùng) rồi trả về câu có hai
   phương án viết giống nhau. Tô đỏ tại chỗ, không tải lại trang vì tải lại là mất dấu đỏ. */
var DUP_SKIP_REASONS = { no_options: 'chưa có phương án để so', not_found: 'không tồn tại' };
function duplicateBadgeText(item){
  var groups = (item && item.groups) || [];
  var pairs = groups.map(function(g){ return (g.labels || []).join(' = '); });
  return pairs.length ? ('Phương án trùng: ' + pairs.join('; ')) : 'Có phương án trùng';
}
function markDuplicate(item){
  var qid = item && item.question_id; if(!qid) return;
  var row = document.querySelector('[data-question-row="' + qid + '"]');
  if(row){ row.classList.add('row-answer-conflict'); }
  var badge = document.querySelector('[data-answer-check="' + qid + '"]');
  if(badge){ badge.textContent = duplicateBadgeText(item); badge.style.display = ''; }
}
function bulkCheckDuplicates(ids){
  askConfirm('Kiểm tra '+ids.length+' câu đã chọn xem có phương án viết giống nhau?\n\n'
      + 'Hệ thống CHỈ kiểm tra, không xóa hay sửa phương án nào. Câu có phương án trùng sẽ được tô đỏ.', function(){
    showToast('Đang kiểm tra phương án trùng…');
    busyFetch(routes.bulkCheckDuplicates, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không kiểm tra được')); return; }
      clearAnswerConflicts();
      (d.duplicates||[]).forEach(markDuplicate);
      var n = (d.duplicates||[]).length;
      var msg = n ? ('Có '+n+'/'+d.requested+' câu chứa phương án trùng — đã tô đỏ.')
                  : ('Cả '+d.requested+' câu đều không có phương án trùng.');
      var sk = d.skipped||[];
      if(sk.length){
        var dem = {};
        sk.forEach(function(s){ dem[s.reason] = (dem[s.reason]||0)+1; });
        msg += ' Bỏ qua '+sk.length+' câu ('+Object.keys(dem).map(function(k){
          return dem[k]+' câu '+(DUP_SKIP_REASONS[k]||k); }).join(', ')+').';
      }
      showToast(msg, 8000);
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Xóa các phương án": bỏ MỌI hàng options của câu Trắc nghiệm đã chọn, đưa câu về dạng chỉ
   còn đề bài (muốn có đáp án thì chạy "Sinh đáp án"). Server bỏ qua câu Đúng/Sai vì bốn
   phát biểu của loại đó nằm chính trong bảng options — xóa ở đó là xóa mất đề. */
var DROP_OPTION_REASONS = { not_multiple_choice: 'không phải câu Trắc nghiệm',
  no_options: 'chưa có phương án nào', not_found: 'không tồn tại', error: 'lỗi' };
function bulkDropOptions(ids){
  askConfirm('Xóa toàn bộ phương án của '+ids.length+' câu đã chọn?\n\n'
      + 'Chỉ câu kiểu Trắc nghiệm bị xóa; câu Đúng/Sai, Trả lời ngắn, Tự luận được bỏ qua.\n'
      + 'Đề bài, lời giải và lịch sử làm bài vẫn giữ nguyên. Phương án đã xóa được ghi ra file backup trong thư mục backups/.', function(){
    showToast('Đang xóa phương án…');
    busyFetch(routes.bulkDropOptions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không xóa phương án được')); return; }
      var dropped = d.dropped||[];
      var hang = dropped.reduce(function(s,x){ return s + (x.removed||0); }, 0);
      var msg = 'Đã xóa phương án của '+dropped.length+'/'+d.requested+' câu ('+hang+' hàng)';
      var sk = d.skipped||[];
      if(sk.length){
        var dem = {};
        sk.forEach(function(s){ dem[s.reason] = (dem[s.reason]||0)+1; });
        msg += ' · bỏ qua '+sk.length+' câu ('+Object.keys(dem).map(function(k){
          return dem[k]+' câu '+(DROP_OPTION_REASONS[k]||k); }).join(', ')+')';
      }
      if(d.backup){ msg += ' · backup: '+String(d.backup).split(/[\\/]/).pop(); }
      showToast(msg, 8000);
      location.reload();
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Xóa các lời giải thích": xóa lời giải chính VÀ mọi cách giải của câu đã chọn. Câu chưa
   có lời giải được bỏ qua để báo cáo đúng số câu vừa thay đổi. */
var DROP_SOLUTION_REASONS = { no_solution: 'chưa có lời giải', error: 'lỗi' };
function bulkDropSolutions(ids){
  askConfirm('Xóa toàn bộ lời giải thích của '+ids.length+' câu đã chọn?\n\n'
      + 'Gồm cả lời giải chính và mọi "cách giải khác". Câu chưa có lời giải sẽ bị bỏ qua.\n'
      + 'Lời giải đã xóa được ghi ra file backup trong thư mục backups/ — làm lại phải gọi AI từng câu.', function(){
    showToast('Đang xóa lời giải…');
    busyFetch(routes.bulkDropSolutions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không xóa lời giải được')); return; }
      var msg = 'Đã xóa lời giải của '+(d.deleted||[]).length+'/'+d.requested+' câu';
      var sk = d.skipped||[];
      if(sk.length){
        var dem = {};
        sk.forEach(function(s){ dem[s.reason] = (dem[s.reason]||0)+1; });
        msg += ' · bỏ qua '+sk.length+' câu ('+Object.keys(dem).map(function(k){
          return dem[k]+' câu '+(DROP_SOLUTION_REASONS[k]||k); }).join(', ')+')';
      }
      if(d.backup){ msg += ' · backup: '+String(d.backup).split(/[\\/]/).pop(); }
      showToast(msg, 8000);
      location.reload();
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Loại bớt 1 dòng Kết quả là: xxx": lời giải đúng luật chỉ chốt kết quả MỘT dòng ở cuối,
   model hay lặp thành hai ba dòng. Giữ dòng CUỐI vì mọi bộ đọc lời giải (kể cổng đối chiếu
   đáp án) chỉ nhìn dòng đó — mấy dòng phía trên là chữ chết, cắt đi không đổi đáp án.
   Không reload khi chẳng có gì thay đổi, khỏi mất công chọn lại câu. */
var TRIM_RESULT_REASONS = {
  no_solution: 'chưa có lời giải',
  no_result_line: 'lời giải không có dòng "Kết quả là"',
  one_result_line: 'đã chỉ có 1 dòng "Kết quả là"',
  error: 'lỗi'
};
function bulkTrimResultLines(ids){
  askConfirm('Kiểm tra '+ids.length+' câu đã chọn và cắt dòng "Kết quả là:" bị lặp?\n\n'
      + 'Lời giải có từ 2 dòng "Kết quả là:" sẽ giữ DÒNG CUỐI, bỏ các dòng phía trên.\n'
      + 'Lời giải đã sạch (1 dòng) hoặc chưa có thì không đụng tới. Nội dung cũ ghi ra backup trong backups/.', function(){
    showToast('Đang cắt dòng "Kết quả là" trùng…');
    busyFetch(routes.bulkTrimResultLines, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok){ showToast(errText(d, 'không cắt được dòng "Kết quả là"')); return; }
      var tr = d.trimmed||[];
      var soDong = tr.reduce(function(a, x){ return a + ((x.removed||[]).length); }, 0);
      var msg = tr.length ? ('Đã cắt '+soDong+' dòng "Kết quả là" trùng ở '+tr.length+'/'+d.requested+' lời giải (giữ dòng cuối).')
                          : ('Chưa câu nào trong '+d.requested+' câu đã chọn có dòng "Kết quả là" bị lặp.');
      var sk = d.skipped||[];
      if(sk.length){
        var dem = {};
        sk.forEach(function(s){ dem[s.reason] = (dem[s.reason]||0)+1; });
        msg += ' · bỏ qua '+sk.length+' ('+Object.keys(dem).map(function(k){
          return dem[k]+' câu '+(TRIM_RESULT_REASONS[k]||k); }).join(', ')+')';
      }
      if(d.backup){ msg += ' · backup: '+String(d.backup).split(/[\\/]/).pop(); }
      showToast(msg, 9000);
      if(tr.length){ location.reload(); }
    }).catch(function(){ showToast('Lỗi mạng'); });
  });
}
/* "Giải thích lời giải" hàng loạt: chạy đúng mạch của nút từng câu (SSE
   data-explain-url của hàng đó) cho từng câu đã chọn, hết câu này đến câu kế vì máy
   chạy CPU chỉ giải nổi một yêu cầu mỗi lúc. Câu đã có lời giải thì server phát lại
   cache (không gọi AI); câu chưa có thì AI giải và lưu vào question_solutions, nên
   lần sau bấm lại chỉ tốn công hiển thị. */
function bulkExplainSolutions(ids){
  if(!ids.length){ showToast('Chưa chọn câu hỏi'); return; }
  if(window.__bulkExplaining){ showToast('Đang giải thích hàng loạt, xin chờ…'); return; }
  var phut = Math.max(1, Math.round(ids.length*15/60));
  askConfirm('Giải thích lời giải cho '+ids.length+' câu đã chọn?\n\n'
      + 'Máy giải lần lượt từng câu, có thể mất khoảng '+phut+' phút — xin đừng tải lại trang.\n'
      + 'Câu chưa có lời giải sẽ được AI giải và lưu lại; câu đã có lời giải chỉ hiện lại.', function(){
    window.__bulkExplaining = true;
    var i = 0, done = 0, failed = 0, missing = 0;
    function step(){
      if(i >= ids.length){
        window.__bulkExplaining = false;
        var msg = 'Đã giải thích ' + done + '/' + ids.length + ' câu';
        if(failed){ msg += ' · ' + failed + ' câu lỗi (Ollama chưa chạy?)'; }
        if(missing){ msg += ' · ' + missing + ' câu không còn trong danh sách này'; }
        showToast(msg + '. Lời giải đã lưu vào từng câu — bấm lại nút trên hàng để xem mà không tốn lượt AI.', 0);
        return;
      }
      var qid = ids[i]; i++;
      var box = document.getElementById('ai-' + qid);
      var btn = document.querySelector('.ai-btn[data-qid="' + qid + '"]');
      if(!box || !btn){ missing++; step(); return; }
      if(box.dataset.loaded){ done++; step(); return; }  // đã stream xong trong lượt này
      showToast('Đang giải thích câu ' + qid + ' (' + i + '/' + ids.length + ')…', 0);
      btn.disabled = true;
      var url = (btn.getAttribute('data-explain-url') || '/ai/explain_stream') + '?question_id=' + qid;
      startSSE(url, box, btn, (btn.textContent || '').trim(), undefined, function(ok){
        if(ok){ done++; } else { failed++; }
        step();
      });
    }
    step();
  });
}
/* "Sinh 4 đáp án" hàng loạt: chỉ bù cho những câu CHƯA có phương án nào. Câu đã có
   đáp án thì server trả 409 has_options nên phương án soạn sẵn không bao giờ bị ghi
   đè; muốn sửa đáp án câu đã có dùng "Chỉnh lại đáp án" hoặc sửa tay trong popup.
   Chạy lần lượt từng câu bằng endpoint của MỘT câu vì mỗi câu cần AI tự giải để chốt
   đáp án đúng (hàng chục giây/câu) — một request gộp sẽ dễ đứt giữa chừng. */
function bulkGenerateOptions(ids){
  if(!ids.length){ showToast('Chưa chọn câu hỏi'); return; }
  if(window.__bulkGenOptions){ showToast('Đang sinh đáp án hàng loạt, xin chờ…'); return; }
  var phut = Math.max(1, Math.round(ids.length*40/60));
  askConfirm('Sinh đáp án cho '+ids.length+' câu đã chọn?\n\n'
      + 'Mỗi câu theo kiểu của nó: trắc nghiệm 4 phương án, Đúng/Sai 4 phát biểu, trả lời ngắn một giá trị.\n'
      + 'Chỉ sinh cho câu CHƯA có đáp án; câu đã có đáp án được giữ nguyên.\n'
      + 'Mỗi câu phải AI tự giải để chốt đáp án đúng — có thể mất khoảng '+phut+' phút, xin đừng tải lại trang.', function(){
    window.__bulkGenOptions = true;
    var i = 0, created = 0, kept = 0, blocked = [], netErr = 0;
    function step(){
      if(i >= ids.length){
        window.__bulkGenOptions = false;
        var msg = 'Đã sinh đáp án cho ' + created + '/' + ids.length + ' câu'
          + ' · giữ nguyên ' + kept + ' câu đã có đáp án';
        if(blocked.length){ msg += ' · ' + blocked.length + ' câu không sinh được (' + (blocked[0].note || blocked[0].error || 'lỗi') + ')'; }
        if(netErr){ msg += ' · ' + netErr + ' câu lỗi mạng'; }
        showToast(created ? (msg + ', đang tải lại…') : msg, created ? 2000 : 0);
        if(created){ setTimeout(function(){ location.reload(); }, 1500); }
        return;
      }
      var qid = ids[i]; i++;
      showToast('Đang sinh đáp án câu ' + qid + ' (' + i + '/' + ids.length + ')…', 0);
      busyFetch(routes.generateOptions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: qid})})
        .then(function(r){ return r.json().then(function(d){ return {status: r.status, d: d || {}}; }); })
        .then(function(res){
          var d = res.d;
          if(d && d.ok){ created++; }
          else if(d && d.error === 'has_options'){ kept++; }
          else { blocked.push({question_id: qid, error: (d && d.error) || ('http_' + res.status), note: (d && d.note) || ''}); }
          step();
        })
        .catch(function(){ netErr++; step(); });
    }
    step();
  });
}
function openBulkFormatModal(ids){
  window.__bulkFormatIds = ids;
  var modal = getModal('modal-bulk-format'); if(modal){ modal.show(); }
  var c = document.getElementById('bulk-format-count'); if(c){ c.textContent = 'Đổi kiểu cho ' + ids.length + ' câu hỏi đã chọn.'; }
}
function applyBulkFormat(){
  var ids = window.__bulkFormatIds || []; if(!ids.length){ showToast('Chưa chọn câu hỏi'); return; }
  var fmt = document.getElementById('bulk-format-value').value || 'trac_nghiem';
  busyFetch(routes.questionSettings, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids, question_format: fmt})}).then(function(r){ return r.json(); }).then(function(d){
    if(d && d.ok){ showToast('Đổi kiểu ' + d.updated + ' câu hỏi'); closeBulkFormat(); location.reload(); }
    else { showToast(errText(d, 'không đổi kiểu hàng loạt được')); }
  });
}
function closeBulkFormat(){ window.__bulkFormatIds = null; var modal=getModal('modal-bulk-format'); if(modal){ modal.hide(); } }
/* "Đặt độ khó" hàng loạt: cùng endpoint với combobox độ khó của từng hàng (chỉ khác là
   ở đây nhận nhiều question_ids), nên nhãn Dễ/Trung bình/Khó/Vận dụng cao dùng chung DIFF_LABEL. */
function openBulkDifficultyModal(ids){
  window.__bulkDifficultyIds = ids;
  var modal = getModal('modal-bulk-difficulty'); if(modal){ modal.show(); }
  var c = document.getElementById('bulk-difficulty-count'); if(c){ c.textContent = 'Đặt độ khó cho ' + ids.length + ' câu hỏi đã chọn.'; }
}
function applyBulkDifficulty(){
  var ids = window.__bulkDifficultyIds || []; if(!ids.length){ showToast('Chưa chọn câu hỏi'); return; }
  var val = document.getElementById('bulk-difficulty-value').value || 'trung_binh';
  busyFetch(routes.questionSettings, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids, difficulty: val})}).then(function(r){ return r.json(); }).then(function(d){
    if(d && d.ok){ showToast('Độ khó ' + (DIFF_LABEL[val]||val) + ': ' + d.updated + ' câu hỏi'); closeBulkDifficultyModal(); location.reload(); }
    else { showToast(errText(d, 'không đổi được độ khó')); }
  }).catch(function(){ showToast('Lỗi mạng'); });
}
function closeBulkDifficultyModal(){ window.__bulkDifficultyIds = null; var modal=getModal('modal-bulk-difficulty'); if(modal){ modal.hide(); } }
/* "Sinh câu hỏi tương tự" hàng loạt: hỏi số câu cần tạo cho MỖI câu đã chọn rồi chạy lần
   lượt từng câu qua endpoint của MỘT câu (AI sinh + kiểm chứng từng câu một; một request
   gộp nhiều câu sẽ dễ đứt giữa chừng). Cùng lõi với nút "Sinh câu hỏi tương tự" của hàng. */
function bulkGenerateSimilar(ids){
  if(!ids.length){ showToast('Chưa chọn câu hỏi'); return; }
  if(window.__bulkGenSimilar){ showToast('Đang sinh câu hỏi tương tự, xin chờ…'); return; }
  var cnt = parseInt(prompt('Số câu tương tự cần tạo cho MỖI câu đã chọn:', '2'));
  if(isNaN(cnt) || cnt<=0){ return; }
  window.__bulkGenSimilar = true;
  var i = 0, created = 0, none = 0, netErr = 0;
  function step(){
    if(i >= ids.length){
      window.__bulkGenSimilar = false;
      var msg = 'Đã sinh ' + created + ' câu tương tự từ ' + ids.length + ' câu gốc';
      if(none){ msg += ' · ' + none + ' câu không sinh được'; }
      if(netErr){ msg += ' · ' + netErr + ' câu lỗi mạng'; }
      showToast(created ? (msg + ', đang tải lại…') : msg, created ? 2000 : 0);
      if(created){ setTimeout(function(){ location.reload(); }, 1500); }
      return;
    }
    var qid = ids[i]; i++;
    showToast('Đang sinh câu tương tự cho câu ' + qid + ' (' + i + '/' + ids.length + ')…', 0);
    busyFetch(routes.generateSimilar, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: qid, count: cnt})})
      .then(function(r){ return r.json().then(function(d){ return {status: r.status, d: d || {}}; }); })
      .then(function(res){
        var d = res.d;
        if(d && d.ok && (d.created||[]).length){ created += (d.created||[]).length; }
        else { none++; }
        step();
      })
      .catch(function(){ netErr++; step(); });
  }
  step();
}

function generateSimilar(qid, btn){ var cnt=parseInt(prompt('Số câu tương tự cần tạo:', '2')); if(isNaN(cnt)||cnt<=0){ cnt=2; } if(btn && btn.disabled) return; var orig=btn?btn.textContent:''; if(btn){ btn.disabled=true; btn.textContent='Đang sinh…'; } showToast('AI đang sinh '+cnt+' câu tương tự, có thể mất 1–2 phút. Xin đừng tải lại trang…', 180000); function restore(){ if(btn){ btn.disabled=false; btn.textContent=orig; } } busyFetch(routes.generateSimilar, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: qid, count: cnt})}).then(function(r){ return r.json(); }).then(function(d){ if(d && d.ok){ var n=(d.created||[]).length; var sk=d.skipped||0; var rj=(d.rejected||[]).length; var uv=(d.unverified||[]).length; var uvNote=uv? ' (bỏ '+uv+' câu vì lời giải không xác nhận đáp án'+(uv[0].note? ': '+uv[0].note : '') +')' : ''; if(n>0){ showToast('Đã sinh '+n+' câu tương tự, đang chờ duyệt'+(sk? ' (bỏ qua '+sk+' câu không đạt)' : '')+(rj? ' (loại '+rj+' câu không cùng dạng)' : '')+uvNote+', đang tải lại…'); restore(); setTimeout(function(){ location.reload(); }, 600); } else { showToast(uv? ('Không lưu câu nào: '+uv.length+' câu AI trả về đều không được lời giải xác nhận đáp án'+(uv[0].note? (' ('+uv[0].note+')') : '')+'.') : (rj? ('Cả '+rj+' câu AI trả về không cùng dạng với câu gốc (khác yêu cầu hoặc khác phép toán).') : (sk? ('Cả '+sk+' câu AI trả về không đạt (thiếu hoặc trùng phương án). Hãy thử lại.') : 'AI không trả về câu nào. Hãy thử lại.'))); restore(); } } else { showToast((d && d.error==='forbidden')? 'Không có quyền' : ('Không sinh được câu tương tự'+(d && d.detail? (': '+d.detail) : '.'))); restore(); } }).catch(function(){ showToast('Lỗi mạng khi sinh câu tương tự.'); restore(); }); }

// Nút xác nhận "hai câu cùng dạng" — tách khỏi nút Duyệt nội dung: Duyệt nói câu hỏi
// đủ tốt để ra đề, còn ở đây nói nó thực sự giống câu gốc.
function verifySimilarity(qid, srcId, action){
  var label = action === 'accept' ? 'Xác nhận tương tự' : 'Không tương tự';
  askConfirm(label + ' câu hỏi ' + qid + ' với câu gốc ' + srcId + '?', function(){
    var btns = document.querySelectorAll('[data-verify-similarity="' + qid + '"]');
    for(var i=0;i<btns.length;i++){ btns[i].disabled = true; }
    busyFetch(routes.verifySimilar, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: qid, src_question_id: srcId, action: action})}).then(function(r){ return r.json(); }).then(function(d){
      if(d && d.ok){ showToast('Đã ghi nhận: ' + label.toLowerCase()); setTimeout(function(){ location.reload(); }, 400); }
      else { showToast(errText(d, 'không ghi nhận được trạng thái tương tự')); for(var i=0;i<btns.length;i++){ btns[i].disabled = false; } }
    }).catch(function(){ showToast('Lỗi mạng'); for(var i=0;i<btns.length;i++){ btns[i].disabled = false; } });
  });
}
/* Nút "Xóa" của từng câu: XÓA HẲN câu khỏi CSDL (server ghi backup JSON trước khi xóa).
   Trước đây bấm OK ở đây chỉ là bỏ duyệt (visible=0) nên câu vẫn nằm trong danh sách —
   câu vốn đã "Chờ duyệt" thì không đổi gì cả. Muốn giữ lịch sử làm bài mà chỉ cho câu
   thôi ra đề thì dùng nút "Bỏ duyệt" ở cột Trạng thái. */
function askDeleteQuestion(qid, histCount){
  var msg = 'XÓA HẲN câu hỏi ' + qid + ' khỏi CSDL?\n\nPhương án, lời giải và lượt làm bài của câu này sẽ bị xóa theo.';
  if(histCount){ msg += '\nCâu này đang có ' + histCount + ' dấu vết học tập (lượt làm, bài tự luận) — sẽ mất hết.'; }
  msg += '\n\nServer ghi backup JSON vào backups/ trước khi xóa.';
  askConfirm(msg, function(){
    deleteQuestion(qid, 'hard', true);
  });
}
function deleteQuestion(qid, mode, force){
  busyFetch(routes.deleteQuestion, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: qid, mode: mode||'hide', force: !!force})}).then(function(r){ return r.json(); }).then(function(d){
    if(d && d.ok){
      if(d.mode === 'hard'){ showToast('Đã xóa hẳn ' + d.deleted + ' câu · backup: ' + (d.backup || 'không ghi')); }
      else { showToast('Đã bỏ duyệt câu hỏi (còn giữ lịch sử làm bài)'); }
      location.reload();
    } else { showToast(deleteErrText(d, 'không xóa được câu hỏi')); }
  }).catch(function(){ showToast('Lỗi mạng'); });
}

function openDedupe(qid){ currentQ=qid; var modal=getModal('modal-dedupe'); if(modal){ modal.show(); } busyFetch(routes.getOptions+'?question_id='+qid).then(function(r){ return r.json(); }).then(function(d){ var rows=(d.options||[]).map(function(o){ return '<label><input type="checkbox" class="dup-opt" value="'+o.label+'"> '+o.label+') '+o.text+'</label>'; }).join('<br>'); document.getElementById('dup-opts').innerHTML='<div>Chọn đáp án trùng để loại bỏ:</div>'+rows; }); }
function closeDedupe(){ currentQ=null; var modal=getModal('modal-dedupe'); if(modal){ modal.hide(); } document.getElementById('dup-opts').innerHTML=''; document.getElementById('dup-similar').innerHTML=''; }
function applyDedupe(){ var drops=Array.from(document.querySelectorAll('.dup-opt:checked')).map(function(e){ return e.value; }); busyFetch(routes.dedupeOptions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_id: currentQ, drop_labels: drops})}).then(function(r){ return r.json(); }).then(function(d){ var updated=(d.options||[]).map(function(o){ return '<div><strong>'+o.label+')</strong> '+o.text+(o.is_correct? ' ✓':'')+'</div>'; }).join(''); var msg='<div style="margin-bottom:8px">Đã xoá '+(d.deleted_count||0)+' đáp án trùng.</div>'; document.getElementById('dup-opts').innerHTML=msg+'<div>Các đáp án hiện tại:</div>'+updated; var list=(d.similar||[]).map(function(x){ return '<label><input type="checkbox" class="dup-sim" value="'+x.id+'" checked> ['+x.id+'] '+x.prompt+'</label>'; }).join('<br>'); document.getElementById('dup-similar').innerHTML='<div>Câu hỏi có đáp án trùng tương tự:</div>'+list+'<div style="margin-top:8px"><button type="button" onclick="bulkApplyDedupe()">Áp dụng hàng loạt</button></div>'; showToast('Đã xoá '+(d.deleted_count||0)+' đáp án trùng'); }); }
function bulkApplyDedupe(){ var ids=Array.from(document.querySelectorAll('.dup-sim:checked')).map(function(e){ return parseInt(e.value); }); busyFetch(routes.bulkDedupeOptions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){ showToast('Đã xoá '+(d.deleted_count||0)+' đáp án trùng từ '+ids.length+' câu hỏi'); closeDedupe(); }); }

function getSelectedIds(){ return Array.from(document.querySelectorAll('.question-checkbox:checked')).map(function(e){ return parseInt(e.value); }); }
/* Bộ xử lý hành động DÙNG CHUNG: combobox "Chọn hành động" và menu "…" của từng hàng
   đều gọi hàm này, chỉ khác nhau ở danh sách id (nhiều câu đã tick vs một câu). Nhãn và
   thứ tự hành động do bảng `bulk_actions` trong template quyết định; ở đây chỉ có đường
   đi từ giá trị `bulk-*` sang hàm lõi tương ứng. */
function applyQuestionAction(action, ids){
  if(!action){ showToast('Vui lòng chọn hành động'); return; }
  if(action==='bulk-reclassify'){ reclassifyQuestions(ids); return; }
  if(ids.length===0){ showToast('Vui lòng chọn hành động và câu hỏi'); return; }
  if(action==='bulk-change'){ openBulkUpdateModal(ids); } else if(action==='bulk-hide'){ bulkReview(ids, 0); } else if(action==='bulk-show'){ bulkReview(ids, 1); } else if(action==='bulk-format'){ openBulkFormatModal(ids); } else if(action==='bulk-difficulty'){ openBulkDifficultyModal(ids); } else if(action==='bulk-clone-essay'){ bulkCloneEssay(ids); } else if(action==='bulk-explain-on'){ bulkSetFlag(ids, 'allow_explain', 1); } else if(action==='bulk-explain-off'){ bulkSetFlag(ids, 'allow_explain', 0); } else if(action==='bulk-lesson-on'){ bulkSetFlag(ids, 'allow_lesson', 1); } else if(action==='bulk-lesson-off'){ bulkSetFlag(ids, 'allow_lesson', 0); } else if(action==='bulk-fix-answer'){ bulkFixAnswers(ids); } else if(action==='bulk-check-answer'){ bulkCheckAnswers(ids); } else if(action==='bulk-check-duplicates'){ bulkCheckDuplicates(ids); } else if(action==='bulk-dedupe-options'){ bulkDedupeOptions(ids); } else if(action==='bulk-drop-options'){ bulkDropOptions(ids); } else if(action==='bulk-drop-solutions'){ bulkDropSolutions(ids); } else if(action==='bulk-trim-result-lines'){ bulkTrimResultLines(ids); } else if(action==='bulk-ai-content'){ bulkAiContent(ids); } else if(action==='bulk-flag-number'){ bulkFlagNumber(ids); } else if(action==='bulk-gen-options'){ bulkGenerateOptions(ids); } else if(action==='bulk-gen-similar'){ bulkGenerateSimilar(ids); } else if(action==='bulk-explain'){ bulkExplainSolutions(ids); } else if(action==='bulk-hard-delete'){ askConfirm('XÓA HẲN '+ids.length+' câu hỏi đã chọn?\n\nMọi lượt làm bài và lời giải liên quan sẽ bị xóa theo. Server ghi backup JSON vào backups/ trước khi xóa.', function(){ bulkDeleteQuestions(ids, 'hard', true); }); }
}
function performBulkAction(){ var el=document.getElementById('bulk-action'); applyQuestionAction(el ? (el.value||'') : '', getSelectedIds()); }
/* Menu "…" của từng hàng: mỗi mục gọi ĐÚNG hàm xử lý của combobox nhưng trên một câu. */
function runRowAction(action, qid){ closeAllRowMenus(); applyQuestionAction(action, [qid]); }
function toggleRowMenu(ev, qid){
  if(ev){ ev.stopPropagation(); }
  var box = document.getElementById('qm-' + qid); if(!box) return;
  var open = box.style.display !== 'none';
  closeAllRowMenus();
  box.style.display = open ? 'none' : 'block';
}
function closeAllRowMenus(){ Array.prototype.forEach.call(document.querySelectorAll('.row-menu'), function(m){ m.style.display = 'none'; }); }
function reclassifyQuestions(ids){ var msg = ids.length ? ('Phân loại lại '+ids.length+' câu hỏi đã chọn? (không dùng AI)') : 'Phân loại lại toàn bộ câu hỏi (tối đa 200)?'; askConfirm(msg, function(){ var body = ids.length ? {question_ids: ids} : {limit: 200}; busyFetch(routes.reclassify, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}).then(function(r){ return r.json(); }).then(function(d){ if(d && d.ok){ showToast('Đã phân loại '+d.updated+'/'+d.requested+' câu'); location.reload(); } else { showToast('Không phân loại được'); } }); }); }
/* "Nội dung đầy đủ cho AI": đọc MỌI ảnh của câu (đề bài lẫn phương án) bằng Tesseract, giữ
   nguyên văn đề bài rồi nối khối "SỐ ĐO GHI TRONG HÌNH: ..." vào questions.ai_content.
   Nhanh (~0,5 giây/câu) nhưng chỉ ngắt được số đo rời, không gắn được số với nhãn; dữ kiện
   gắn nhãn ("AB = 5 cm") cần model thị giác và chỉ đi ở lối một câu. Câu không có ảnh và câu
   mà bản lưu còn đúng với đề bài bị server bỏ qua. */
function bulkAiContent(ids){
  if(!ids.length){ showToast('Vui lòng chọn hành động và câu hỏi'); return; }
  askConfirm('Sinh nội dung đầy đủ cho AI (đọc hình vẽ) cho '+ids.length+' câu đã chọn?', function(){
    showToast('Đang đọc số đo trong hình vẽ…', 60000);
    busyFetch(routes.bulkAiContent, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d && d.ok){
          var done=(d.done||[]).length, sk=(d.skipped||[]).length, fl=(d.failed||[]).length;
          showToast('Đã sinh '+done+' câu'+(sk? ', bỏ qua '+sk+' câu (không ảnh, hình không có số đo, hoặc bản lưu còn tốt)':'')+(fl? ', lỗi '+fl+' câu':''), 5000);
          location.reload();
        } else {
          showToast((d && (d.note||d.error)) || 'Không sinh được nội dung (ollama serve?)', 5000);
        }
      })
      .catch(function(){ showToast('Không nối được server — chưa sinh nội dung', 4000); });
  });
}
/* "Điền số": AI phân loại từng câu trong danh sách rồi đổi kiểu câu sang dien_so (kéo theo
   cờ `answer_is_number`). Model chỉ PHÂN LOẠI chứ không giải, nhưng vẫn phải gọi cho từng
   câu nên có thể lâu — nhắc trước; câu không phải dạng điền số được báo là "bỏ qua". */
function bulkFlagNumber(ids){
  if(!ids.length){ showToast('Vui lòng chọn hành động và câu hỏi'); return; }
  askConfirm('AI nhận diện câu "điền số" cho '+ids.length+' câu đã chọn?', function(){
    showToast('Đang nhận diện câu điền số bằng AI (có thể lâu)…', 60000);
    busyFetch(routes.bulkFlagNumber, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d && d.ok){
          var fl=(d.flagged||[]).length, nn=(d.not_number||[]).length, fa=(d.failed||[]).length;
          showToast('Đã đánh dấu '+fl+' câu điền số'+(nn? ', '+nn+' câu không phải':'')+(fa? ', lỗi '+fa+' câu':''), 5000);
          location.reload();
        } else {
          showToast((d && (d.note||d.error)) || 'Không nhận diện được (ollama serve?)', 5000);
        }
      })
      .catch(function(){ showToast('Không nối được server — chưa nhận diện', 4000); });
  });
}
function openBulkUpdateModal(ids){ window.__bulkIds = ids; var modal=getModal('modal-bulk-update'); if(modal){ modal.show(); } var gsel=document.getElementById('bulk-grade'); var tsel=document.getElementById('bulk-topics'); if(gsel){ gsel.value=''; } if(tsel){ tsel.innerHTML=''; }
  if(gsel){ gsel.onchange=function(){ var g=gsel.value||''; if(tsel){ tsel.innerHTML=''; } if(!g){ return; } fetch(routes.topicsByGrade+'?grade='+encodeURIComponent(g)).then(function(r){ return r.json(); }).then(function(d){ var items=(d.topics||[]); if(tsel){ tsel.innerHTML=''; items.forEach(function(t){ var op=document.createElement('option'); op.value=t.id; op.textContent=t.name; tsel.appendChild(op); }); } }); } }
}
function closeBulkUpdateModal(){ window.__bulkIds = null; var modal=getModal('modal-bulk-update'); if(modal){ modal.hide(); } }
function applyBulkUpdate(){ var ids=window.__bulkIds||[]; var gv=(document.getElementById('bulk-grade').value||''); if(!gv){ showToast('Vui lòng chọn lớp'); return; } var g=parseInt(gv); var sel=document.getElementById('bulk-topics'); var tids=Array.from(sel.selectedOptions).map(function(o){ return parseInt(o.value); }); busyFetch(routes.bulkUpdateQuestions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids, new_grade: g, topic_ids: tids})}).then(function(r){ return r.json(); }).then(function(d){ if(d.ok){ showToast('Đã cập nhật '+ids.length+' câu hỏi'); closeBulkUpdateModal(); location.reload(); } else { showToast('Lỗi cập nhật hàng loạt'); } }); }
function bulkDeleteQuestions(ids, mode, force){ busyFetch(routes.bulkDeleteQuestions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids, mode: mode||'hide', force: !!force})}).then(function(r){ return r.json(); }).then(function(d){ if(d && d.ok){ showToast(d.mode==='hard' ? ('Đã xóa hẳn ' + (d.deleted||0) + ' câu · backup: ' + (d.backup||'—')) : ('Đã bỏ duyệt ' + (d.hidden||0) + ' câu hỏi')); location.reload(); } else { showToast(deleteErrText(d, 'không xử lý hàng loạt được')); } }); }
function bulkDedupeOptions(ids){ busyFetch(routes.bulkDedupeOptions, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question_ids: ids})}).then(function(r){ return r.json(); }).then(function(d){ showToast('Đã xoá '+(d.deleted_count||0)+' đáp án trùng'); location.reload(); }); }

function filterGrade(){ var el=document.getElementById('filter-grade'); return el? (el.value||'') : ''; }
function currentLimitValue(){ var t=document.getElementById('limit-select-top'); var b=document.getElementById('limit-select'); return t? (t.value||'50') : (b? (b.value||'50') : '50'); }
function urlTopicIds(){ try{ return new URLSearchParams(window.location.search).getAll('topic_id').map(String); }catch(e){ return []; } }

/* Tab đang đứng = kho câu hỏi nào ('topic' theo bài học SGK / 'exam' trong đề thi). Không có
   ô nào trong form giữ giá trị này nên phải đọc từ URL; thiếu hoặc giá trị lạ thì rơi về
   'topic' đúng như luật ở routes/admin_questions.py — JS và server phải chọn cùng một tab
   mặc định, nếu không bấm "Lọc" là bị đá sang kho khác. */
function urlOrigin(){
  var v='';
  try{ v=(new URLSearchParams(window.location.search).get('origin')||'').toLowerCase(); }catch(e){}
  return v==='exam' ? 'exam' : 'topic';
}

/* Nhóm radio của combobox đầy đủ: `name` giữ đúng id của combobox cũ nên bộ gom tham số
   không đổi. Giá trị rỗng nghĩa là "Cả hai" -> không gửi tham số. */
function filterSelectValue(name){
  var el=document.querySelector('input[name="'+name+'"]:checked');
  return el ? (el.value||'') : '';
}

/* Gom bo loc hien tai thanh query string (dùng chung cho nut Loc va chon so cau). */
function collectFilterParams(limitVal){
  var params=['src=questions', 'limit='+encodeURIComponent(limitVal), 'offset=0',
              'origin='+urlOrigin()];
  var g=filterGrade(); if(g){ params.push('grade='+encodeURIComponent(g)); }
  var vsVal=filterSelectValue('filter-visible');
  if(vsVal!==''){ params.push('visible='+encodeURIComponent(vsVal)); }
  var brVal=filterSelectValue('filter-branch');
  if(brVal!==''){ params.push('branch='+encodeURIComponent(brVal)); }
  var fmtVal=filterSelectValue('filter-format');
  if(fmtVal!==''){ params.push('fmt='+encodeURIComponent(fmtVal)); }
  var diffVal=filterSelectValue('filter-difficulty');
  if(diffVal!==''){ params.push('difficulty='+encodeURIComponent(diffVal)); }
  var hsEl=document.getElementById('filter-has-similar');
  if(hsEl && hsEl.checked){ params.push('has_similar=1'); }
  var nsVal=filterSelectValue('filter-no-solution');
  if(nsVal!==''){ params.push('no_solution='+encodeURIComponent(nsVal)); }
  var osVal=filterSelectValue('filter-options');
  if(osVal!==''){ params.push('options_state='+encodeURIComponent(osVal)); }
  var figVal=filterSelectValue('filter-has-figure');
  if(figVal!==''){ params.push('has_figure='+encodeURIComponent(figVal)); }
  var srcVal=filterSelectValue('filter-source');
  if(srcVal!==''){ params.push('source_type='+encodeURIComponent(srcVal)); }
  var mediaVal=filterSelectValue('filter-media');
  if(mediaVal!==''){ params.push('figure_media='+encodeURIComponent(mediaVal)); }
  var genVal=filterSelectValue('filter-ai-gen');
  if(genVal!==''){ params.push('ai_gen_mode='+encodeURIComponent(genVal)); }
  var exVal=filterSelectValue('filter-explain');
  if(exVal!==''){ params.push('allow_explain='+encodeURIComponent(exVal)); }
  var lsVal=filterSelectValue('filter-lesson');
  if(lsVal!==''){ params.push('allow_lesson='+encodeURIComponent(lsVal)); }
  var ids=new Set();
  /* Bài học SGK đang chọn nằm trong <select multiple> (select2 giữ nguyên thẻ này, chỉ ẩn đi). */
  var topicSel=document.getElementById('admin-topic-select');
  if(topicSel){
    Array.from(topicSel.selectedOptions).forEach(function(o){ ids.add(String(o.value)); });
  }
  Array.from(ids).forEach(function(tid){ params.push('topic_id='+encodeURIComponent(tid)); });
  return params;
}
/* Điều hướng bằng AJAX khi có (thay vì tải lại cả trang); không có fetch thì rơi về
   cách cũ `location.href` để bộ lọc vẫn chạy. */
function gotoQuestions(url){
  if(window.AJAX && typeof AJAX.navigate==='function'){ AJAX.navigate(url); }
  else{ location.href=url; }
}
function applyFilters(){ try{ gotoQuestions(routes.adminQuestions+'?'+collectFilterParams(currentLimitValue()).join('&')); }catch(e){} }
function changeLimit(v){
  try{
    var raw=(v||'').toString().toLowerCase(); var ln = (raw==='all') ? 'all' : parseInt(v||'50');
    if(raw!=='all'){ if(isNaN(ln)||ln<=0){ ln=50; } }
    gotoQuestions(routes.adminQuestions+'?'+collectFilterParams(ln).join('&'));
  }catch(e){}
}

/* Ô chọn bài học SGK của bộ lọc dùng chung module static/js/topic_select.js với trang chủ:
   select2 (ô tìm + nhiều chọn) kèm ô tick từng hàng và checkbox "Tất cả". Bộ lọc quản
   trị cần chọn được cả bài học SGK chưa có câu hỏi duyệt nên KHÔNG bật disableWithoutQuestions.
   Ô chọn chỉ hiện khi đã chọn một lớp — giống trang chủ. */
function reloadTopicOptions(){
  try{
    var box=document.getElementById('admin-topic-box');
    var sel=document.getElementById('admin-topic-select');
    var all=document.getElementById('admin-topic-all');
    if(!sel || !window.TopicSelect){ return; }
    var checked=Array.from(sel.selectedOptions).map(function(o){ return String(o.value); });
    if(!checked.length){ checked=urlTopicIds(); }
    var g=parseInt(filterGrade(),10);
    if(isNaN(g)){ TopicSelect.mount(sel, all, [], [], {}); if(box){ box.style.display='none'; } return; }
    fetch('/topics_by_grade?grade='+encodeURIComponent(g)).then(function(r){ return r.json(); }).then(function(d){
      var items=(d && d.topics) || [];
      // Bài học SGK hiện theo đúng thứ tự id tăng dần.
      items.sort(function(a, b){ return (parseInt(a.id,10)||0)-(parseInt(b.id,10)||0); });
      TopicSelect.mount(sel, all, items, checked, { placeholder: 'Gõ để tìm bài học SGK' });
      if(box){ box.style.display=''; }
    }).catch(function(){ if(box){ box.style.display=''; } });
  }catch(e){}
}

/* "Xem đáp án": server render HTML bằng macro mc_options — bản duy nhất với
   trang kết quả — rồi renderPageMath cho KaTeX hiển thị các biểu thức toán. */
function openViewOptions(qid){ currentQ=qid; var modal=getModal('modal-viewopts'); if(modal){ modal.show(); } var el=document.getElementById('view-opts-content'); if(el){ el.innerHTML='<div class="text-muted">Đang tải…</div>'; } busyFetch(routes.optionsHtml+'?question_id='+qid).then(function(r){ return r.json(); }).then(function(d){ if(!el) return; if(d && d.ok){ el.innerHTML=d.html||''; } else { el.innerHTML='<div class="text-danger">Không tải được đáp án.</div>'; } if(window.renderPageMath){ window.renderPageMath(el); } }).catch(function(){ if(el){ el.innerHTML='<div class="text-danger">Không tải được đáp án.</div>'; } }); }
function closeViewOptions(){ currentQ=null; var modal=getModal('modal-viewopts'); if(modal){ modal.hide(); } var el=document.getElementById('view-opts-content'); if(el){ el.innerHTML=''; } }

function toggleSolutionMethods(qid){
  var el=document.getElementById('sm-'+qid); if(!el) return;
  var showing=el.style.display!=='none';
  el.style.display=showing?'none':'block';
  if(showing) return;
  /* Moi cach giai la mot .ai-box mang data-stored-solution nen ben hien thi cua no
     la dung mach cua nut "Giai thich loi giai" (markdown + KaTeX + anh cua de).
     Goi lai o day de danh sach mo ra la nhin thay duoc noi dung, khong chi ma tho. */
  if(window.renderStoredSolutions){ window.renderStoredSolutions(el); }
  if(window.renderPageMath){ window.renderPageMath(el); }
}

function markMethodPrimary(qid, methodNo){
  var wrap=document.getElementById('sm-'+qid); if(!wrap) return;
  var key=qid+':'+methodNo;
  Array.prototype.forEach.call(wrap.querySelectorAll('[data-method]'), function(node){
    var mine=node.getAttribute('data-method')===key;
    if(mine){ node.setAttribute('data-primary','1'); } else { node.removeAttribute('data-primary'); }
    var star=node.querySelector('.sol-method-star'); if(star){ star.style.display=mine?'':'none'; }
    var pb=node.querySelector('.sol-method-primary-btn');
    if(pb){ pb.style.display=mine?'none':''; pb.disabled=false; if(pb.textContent.charAt(0)==='❌') pb.textContent='Đặt làm lời giải chính'; }
  });
}

/* Cách được chọn sẽ gương chiếu sang question_solutions → mọi trang dùng lời giải đó. */
function setSolutionMethodPrimary(btn, qid, methodNo){
  if(btn.disabled) return;
  btn.disabled=true;
  postSeJson(URL_SOLUTION_PRIMARY, { question_id: qid, method_no: methodNo }).then(function(d){
    btn.disabled=false;
    if(!d||!d.ok){ btn.textContent='❌ '+((d&&d.error)||'Không đổi được'); return; }
    markMethodPrimary(qid, methodNo);
  });
}

/* Đếm lại dòng còn lại: dán lại nhãn "Cách k" theo thứ tự hiển thị, cập nhật số ở nút
   "Xem các lời giải (N)", ẩn hết khi câu hỏi không còn cách nào. */
function refreshSolutionMethodRows(qid){
  var wrap=document.getElementById('sm-'+qid); if(!wrap) return;
  var rows=wrap.querySelectorAll('[data-method]');
  Array.prototype.forEach.call(rows, function(node, i){
    var head=node.querySelector('.sol-method-head strong');
    if(head){ head.textContent='Cách '+(i+1); }
  });
  var btn=document.querySelector('[data-toggle-methods="'+qid+'"]');
  if(!rows.length){
    wrap.style.display='none';
    if(btn){ btn.style.display='none'; }
    return;
  }
  if(btn){ btn.textContent='Xem các lời giải ('+rows.length+')'; }
}

/* Xoá được cả cách giải cuối cùng; server khi đó xoá luôn lời giải đã gương chiếu. */
function deleteSolutionMethod(btn, qid, methodNo){
  if(btn.disabled) return;
  var wrap=document.getElementById('sm-'+qid); if(!wrap) return;
  var rows=wrap.querySelectorAll('[data-method]');
  var row=wrap.querySelector('[data-method="'+qid+':'+methodNo+'"]');
  var isPrimary=row&&row.hasAttribute('data-primary');
  var msg = rows.length<2 ? 'Đây là cách giải duy nhất. Xóa xong câu hỏi sẽ không còn lời giải đã lưu. Tiếp tục?'
            : isPrimary ? ('Cách '+methodNo+' đang là lời giải chính. Xóa xong, một cách khác sẽ lên làm lời giải chính. Tiếp tục?')
            : ('Xóa cách giải '+methodNo+' của câu hỏi này?');
  askConfirm(msg, function(){
    btn.disabled=true;
    postSeJson(URL_SOLUTION_METHOD_DELETE, { question_id: qid, method_no: methodNo }).then(function(d){
      btn.disabled=false;
      if(!d||!d.ok){ btn.textContent='❌'; btn.title=(d&&d.error)||'Không xóa được'; return; }
      if(row&&row.parentNode){ row.parentNode.removeChild(row); }
      if(d.promoted){ markMethodPrimary(qid, d.promoted); }
      refreshSolutionMethodRows(qid);
    });
  });
}

/* Dải tiêu đề cột của /admin_questions nằm NGOÀI vùng cuộn của bảng, giống dải phân trang
   đặt ở đáy (xem admin_questions_clean.html), nên nó là một <table> thứ hai. Hai bảng riêng
   lẻ không chia layout cho nhau: bề rộng cột phải copy từ bảng thật, nếu không tiêu đề "Bài
   học SGK" sẽ đứng lệch sang cột bên cạnh. Nguồn đo là dòng đầu của tbody — bảng không còn <thead>
   nữa — và đo lại mỗi lần nội dung bảng đổi cỡ (xem qheadWatch). */
function qheadParts(){
  var wrap=document.querySelector('.tbl-wrap.scroll-area');
  var head=document.getElementById('qtable-head');
  if(!wrap||!head){ return null; }
  var body=wrap.querySelector('table.tbl'), htable=head.querySelector('table.tbl');
  var brow=wrap.querySelector('tbody tr'), hrow=head.querySelector('tr');
  if(!body||!htable||!brow||!hrow){ return null; }
  return {wrap:wrap, body:body, htable:htable, hc:hrow.children, bc:brow.children};
}

function syncTableHead(){
  var p=qheadParts(); if(!p){ return; }
  var total=0, n=Math.min(p.hc.length, p.bc.length);
  for(var i=0;i<n;i++){
    var w=Math.round(p.bc[i].getBoundingClientRect().width);
    if(w>0){ p.hc[i].style.width=w+'px'; total+=w; }
  }
  if(total>0){ p.htable.style.width=total+'px'; }
  scrollTableHead();
}

/* Cuộn ngang xảy ra ở .tbl-wrap (màn rộng) hoặc ở CHÍNH <table> (màn hẹp: common.css đổi
   bảng thành display:block để tự cuộn ngang), nên lấy max hai nơi rồi dịch dải ngược lại —
   thiếu bước này thì cuộn bảng sang phải là tiêu đề vẫn chỉ cột đầu tiên. */
function scrollTableHead(){
  var p=qheadParts(); if(!p){ return; }
  var sx=Math.max(p.wrap.scrollLeft||0, p.body.scrollLeft||0);
  p.htable.style.transform='translateX('+(-sx)+'px)';
}

/* MỘT lượt căn/đo cho mọi tín hiệu (lật màn, nội dung/ảnh đổi, font xong).
   Xếp lịch một lần cho mỗi loạt tín hiệu nên nhiều source cùng lúc không đo lặp lại.
   setTimeout chứ KHÔNG phải requestAnimationFrame: rAF chạy trong bước render, mà bước đó bị
   trình duyệt bỏ khi tab nằm phía sau — lệnh căn sẽ treo lại đúng lúc không ai nhìn thấy, mà
   trang quản trị mở ở tab nền là chuyện bình thường. */
function qheadSchedule(){
  if(window.__qheadPending){ return; }
  window.__qheadPending=true;
  window.setTimeout(function(){ window.__qheadPending=false; syncTableHead(); }, 0);
}

/* Vì sao dải phải được căn lại nhiều lần chứ không đo một lần là xong: ngay sau
   DOMContentLoaded cột "Nội dung câu hỏi" rộng 245px, nội dung công thức + font xong thì thành
   287px (đo thật: 259px lúc 450ms, 287px lúc 1.443ms) — dải lệch 42px và tiêu đề "Bài học SGK" nằm
   dưới cột kề. Ba tín hiệu, vì mỗi loại đổi cỡ chỉ một tín hiệu nhìn thấy:
   - ResizeObserver trên TỪNG Ô của dòng đầu (không chỉ <table>: ở màn hẹp common.css đổi bảng
     thành display:block, bề rộng bảng bám khung nhìn nên bảng không đổi cỡ khi ô đổi): đúng cho
     mọi thay đổi cỡ, NHƯNG callback chỉ được giao trong bước render của vòng lặp sự kiện, mà
     tab nằm phía sau thì trình duyệt bỏ bước đó (đo thật: 0 lần gọi dù bảng vừa đổi cỡ).
   - MutationObserver trên cả tbody (chạy bằng vi task nên cả tab nền cũng thấy): mọi lần KaTeX
     thay nội dung là một mutation. Nó không biết gì về ảnh tải xong — việc đó có listener
     'load' trong wireTableHead.
   - document.fonts.ready: đổi font KHÔNG phải mutation mà chỉ là xếp chữ lại, nên hai observer
     trên đều im lặng ở đúng khoảnh khắc cột broaden 245 -> 287.
   Gắn lại sau mỗi lần AJAX swap vì tbody/ô đã bị fragment thay bằng phần tử mới. */
function qheadWatch(){
  var p=qheadParts(); if(!p){ return; }
  if(window.ResizeObserver){
    if(!window.__qheadRO){ window.__qheadRO = new window.ResizeObserver(qheadSchedule); }
    window.__qheadRO.disconnect();
    window.__qheadRO.observe(p.body);
    for(var i=0;i<p.bc.length;i++){ window.__qheadRO.observe(p.bc[i]); }
  }
  if(window.MutationObserver){
    if(!window.__qheadMO){ window.__qheadMO = new window.MutationObserver(qheadSchedule); }
    window.__qheadMO.disconnect();
    /* Cả tbody, không chỉ dòng đầu: cột nào cũng do ô RỘNG NHẤT của cả bảng quyết định, nên
       nội dung streaming ở một dòng dưới (khung AI, danh sách lời giải) vẫn đổi bề rộng cột. */
    window.__qheadMO.observe(p.body, {childList:true, subtree:true, attributes:true, characterData:true});
  }
  if(document.fonts && document.fonts.ready && document.fonts.ready.then){
    document.fonts.ready.then(qheadSchedule);
  }
}

function wireTableHead(){
  /* Fragment script chạy lại sau mỗi lần AJAX swap, nên listener chỉ được lắp một lần.
     Lắng nghe ở document theo pha bắt (capture): 'scroll' và 'load' của ảnh KHÔNG nổi bubbles,
     mà bảng/wrap bị fragment thay thế sau mỗi lần swap nên gắn thẳng vào chúng thì lần sau
     mất hết listener. */
  if(window.__qheadWired){ return; }
  window.__qheadWired=true;
  window.addEventListener('resize', qheadSchedule);
  document.addEventListener('scroll', function(e){
    var t=e.target;
    /* Lọc rẻ trước khi đo: cuộn của #page-body và mọi ô khác cũng đi ngang qua listener này
       hàng chục lần mỗi giây, còn phần tử cần theo dõi chỉ có lớp .tbl / .tbl-wrap. */
    if(!t || t.nodeType!==1 || (''+t.className).indexOf('tbl')<0){ return; }
    scrollTableHead();
  }, true);
  document.addEventListener('load', function(e){
    var t=e.target;
    if(t && t.tagName==='IMG'){ qheadSchedule(); }
  }, true);
}

function initAdminQuestions(){
  var sa=document.getElementById('select-all'); if(sa){ sa.addEventListener('change', function(){ var cbs=Array.from(document.querySelectorAll('.question-checkbox')); cbs.forEach(function(cb){ cb.checked=sa.checked; }); }); }
  try{ var hs=document.getElementById('filter-has-similar'); if(hs){ hs.checked=(hs.getAttribute('data-current')||'')==='1'; } }catch(e){}
  /* Ô "Tất cả" và việc tô tick nằm trong TopicSelect.mount (dùng chung trang chủ). */
  reloadTopicOptions();
  /* Menu "…" của từng hàng: bấm ra ngoài thì đóng lại. Nút mở menu tự stopPropagation
     nên không bị chính listener này đóng ngay sau khi mở. */
  document.addEventListener('click', closeAllRowMenus);
  wireTableHead();
  syncTableHead();
  qheadWatch();
}

// DOMContentLoaded chi chay mot lan -> sau AJAX swap can goi lai truc tiep.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminQuestions);
} else {
  initAdminQuestions();
}
