/* admin_uploads.js — nạp bài tập từ file: tách nội dung xem trước rồi lưu vào ngân hàng */

var upState = { uploadId: null, kind: '', items: [] };

/* Toast riêng của trang: đúng một mạch với showToast dùng chung (static/js/common.js),
   chỉ khác thời lượng giữ mặc định là 3 giây. */
function upToast(msg) {
  return showToast(msg, 3000);
}

function upNote(msg) {
  var el = document.getElementById('up-note');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function badgeHtml(it) {
  if (!it.branch) return '<span class="q-badge">Chưa phân loại</span>';
  var h = '<span class="q-badge branch-' + it.branch + '">' + (it.branch_label || (it.branch === 'hinh_hoc' ? 'Hình học' : 'Đại số')) + '</span>';
  if (it.branch === 'hinh_hoc') {
    h += '<span class="q-badge fig-' + (it.has_figure ? 1 : 0) + '">' + (it.figure_label || (it.has_figure ? 'Có vẽ hình' : 'Không vẽ hình')) + '</span>';
  }
  return h;
}

function renderPreview() {
  var box = document.getElementById('up-items');
  var items = upState.items;
  document.getElementById('up-count').textContent = items.length;
  document.getElementById('up-preview').style.display = items.length ? 'block' : 'none';
  box.innerHTML = items.map(function (it, i) {
    var fig = it.image_url
      ? '<div class="q-figure"><div class="q-figure-title">Hình của đề bài</div>'
        + '<img class="q-figure-img" src="' + it.image_url + '" alt="Hình vẽ bài tập"></div>'
      : (it.figure_note ? '<div class="q-figure-note">' + it.figure_note + '</div>' : '');
    return '<div class="question-block">'
      + '<div class="q-number">Câu ' + (i + 1) + ' ' + badgeHtml(it)
      +   '<button type="button" class="btn btn-outline-danger btn-sm float-end" onclick="removeItem(' + i + ')">Bỏ câu này</button></div>'
      + '<textarea class="essay-box up-prompt" data-index="' + i + '" style="min-height:110px">'
      +   (it.prompt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea>'
      + fig + '</div>';
  }).join('');
}

function removeItem(i) {
  syncPrompts();
  upState.items.splice(i, 1);
  renderPreview();
}

/* Nội dung textarea là bản chỉnh sửa thật — đồng bộ vào state trước khi gửi */
function syncPrompts() {
  Array.prototype.forEach.call(document.querySelectorAll('.up-prompt'), function (ta) {
    var i = parseInt(ta.getAttribute('data-index'));
    if (upState.items[i]) upState.items[i].prompt = ta.value;
  });
}

function parseUpload() {
  var input = document.getElementById('up-file');
  if (!input || !input.files || !input.files[0]) { upToast('Hãy chọn file trước'); return; }
  var fd = new FormData();
  fd.append('file', input.files[0]);
  var ocr = document.getElementById('up-ocr');
  var useOcr = !!(ocr && ocr.checked);
  if (useOcr) fd.append('ocr', '1');
  var btn = document.getElementById('up-parse');
  btn.disabled = true; btn.textContent = 'Đang tách…';
  upNote(useOcr ? 'Đang OCR từng trang — mỗi trang mất vài phút, xin chờ.' : '');
  fetch('/admin_upload_parse', { method: 'POST', body: fd })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      upNote(d.note || '');
      if (!d.ok) { upToast(d.error || 'Không tách được file'); return; }
      upState.uploadId = d.upload_id;
      upState.kind = d.kind;
      upState.items = d.items || [];
      renderPreview();
      if (!upState.items.length) upToast('File không có nội dung câu hỏi nào');
      else upToast('Tách được ' + upState.items.length + ' câu');
    })
    .catch(function () { upNote(''); upToast('Lỗi gọi máy chủ'); })
    .finally(function () { btn.disabled = false; btn.textContent = 'Tách nội dung'; });
}

function commitUpload() {
  var grade = parseInt(document.getElementById('up-grade').value || '0');
  if (!(grade >= 1 && grade <= 12)) { upToast('Hãy chọn lớp'); return; }
  syncPrompts();
  var items = upState.items.filter(function (it) { return (it.prompt || '').trim().length > 5; });
  if (!items.length) { upToast('Chưa có câu hỏi nào để lưu'); return; }
  var btn = document.getElementById('up-commit');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  fetch('/admin_upload_commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: upState.uploadId, grade: grade, items: items })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) { upToast(d.error || 'Không lưu được'); return; }
      upToast('Đã lưu ' + d.saved + ' câu hỏi' + (d.skipped ? ' (bỏ ' + d.skipped + ' câu trùng/rỗng)' : ''));
      setTimeout(function () { location.reload(); }, 900);
    })
    .catch(function () { upToast('Lỗi gọi máy chủ'); })
    .finally(function () { btn.disabled = false; btn.textContent = 'Lưu vào ngân hàng câu hỏi'; });
}

function resetUpload() {
  upState = { uploadId: null, kind: '', items: [] };
  var input = document.getElementById('up-file');
  if (input) input.value = '';
  document.getElementById('up-items').innerHTML = '';
  document.getElementById('up-preview').style.display = 'none';
  upNote('');
}

/* Trang còn được nạp bằng AJAX: script chỉ nạp một lần, nhưng DOM được thay mới nên
   trạng thái tách file phải về rỗng để không commit nhầm câu của lần trước. */
document.addEventListener('ajax:swapped', function () {
  if (document.getElementById('up-file')) resetUpload();
});
