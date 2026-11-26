(() => {
  "use strict";

  const app = document.getElementById("app");
  const state = {
    data: null,
    route: [],
    answers: {},
    current: 0,
    sessionKey: null,
    sessionQuestionIds: [],
    examEnd: null,
    timer: null,
  };

  const questionById = new Map();
  const topicById = new Map();
  const lessonByTopic = new Map();
  const examById = new Map();
  const historyById = new Map();

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function number(value) {
    return new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
  }

  function dateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function duration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function routeParts() {
    return window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  }

  function gradeName(grade) {
    return `Toán ${grade || ""}`.trim();
  }

  function pageHeader(title, description, actions = "") {
    return `
      <header class="page-header">
        <div class="page-title">
          <h1>${esc(title)}</h1>
          ${description ? `<p>${esc(description)}</p>` : ""}
        </div>
        ${actions ? `<div class="page-actions">${actions}</div>` : ""}
      </header>`;
  }

  function renderMath(root) {
    if (!window.katex) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
    for (const node of nodes) {
      if (!node.nodeValue || !node.parentElement) continue;
      if (node.parentElement.closest(".katex, script, style, textarea, code")) continue;
      const text = node.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let last = 0;
      let match = pattern.exec(text);
      while (match) {
        if (match.index > last) fragment.append(document.createTextNode(text.slice(last, match.index)));
        const tex = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
        const span = document.createElement("span");
        try {
          window.katex.render(tex, span, {
            displayMode: Boolean(match[1] || match[2]),
            throwOnError: false,
            strict: "ignore",
          });
        } catch {
          span.textContent = match[0];
        }
        fragment.append(span);
        last = pattern.lastIndex;
        match = pattern.exec(text);
      }
      if (last < text.length) fragment.append(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    }
  }

  function renderHome() {
    const counts = state.data.meta.counts;
    const topics = state.data.topics.filter((topic) => topic.has_lesson).slice(0, 3);
    const exams = state.data.exams.slice(0, 3);
    return `
      <section class="hero">
        <div class="hero-inner">
          <div>
            <span class="eyebrow">Học Toán theo SGK</span>
            <h1>Một ứng dụng để học, luyện tập và luyện thi.</h1>
            <p class="hero-lead">Khám phá bài học, ngân hàng câu hỏi và đề thi trong bản demo tĩnh của Ứng dụng Toán học.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="#/study">Khám phá bài học</a>
              <a class="button button-secondary" href="#/practice">Thử luyện tập</a>
            </div>
          </div>
          <aside class="hero-panel" aria-label="Thông tin bản demo">
            <div class="hero-panel-label">
              <span>Dữ liệu bản giới thiệu</span>
              <span class="status-pill">Đã tải</span>
            </div>
            <p class="hero-formula">\\(a^2 + b^2 = c^2\\)</p>
            <div class="hero-stats">
              <div class="hero-stat"><strong>${number(counts.topics)}</strong><span>bài học</span></div>
              <div class="hero-stat"><strong>${number(counts.questions)}</strong><span>câu hỏi</span></div>
              <div class="hero-stat"><strong>${number(counts.exams)}</strong><span>đề thi</span></div>
              <div class="hero-stat"><strong>${number(counts.symbols)}</strong><span>ký hiệu</span></div>
            </div>
          </aside>
        </div>
      </section>
      <div class="page-container">
        <section class="section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Trải nghiệm chính</span>
              <h2>Đủ chức năng để bạn hình dung ứng dụng thật</h2>
              <p>Mọi dữ liệu trong bản demo được lấy từ cơ sở dữ liệu phát hành; thao tác nộp bài và gửi góp ý được thay bằng thông báo cài đặt.</p>
            </div>
            <span class="demo-pill">Bản demo tĩnh</span>
          </div>
          <div class="feature-grid">
            <article class="feature-card">
              <div class="feature-icon" aria-hidden="true">SGK</div>
              <h3>Học tập theo SGK</h3>
              <p>Danh mục bài học lớp 1–12, nội dung lý thuyết và hình minh họa.</p>
              <a class="button button-ghost button-small" href="#/study">Mở Học tập</a>
            </article>
            <article class="feature-card">
              <div class="feature-icon" aria-hidden="true">?</div>
              <h3>Luyện tập</h3>
              <p>Chọn lớp và số câu, làm bài từng câu một theo nhiều dạng câu hỏi.</p>
              <a class="button button-ghost button-small" href="#/practice">Mở Luyện tập</a>
            </article>
            <article class="feature-card">
              <div class="feature-icon" aria-hidden="true">∑</div>
              <h3>Luyện thi</h3>
              <p>Danh mục đề thi, đồng hồ đếm ngược và bảng chọn câu.</p>
              <a class="button button-ghost button-small" href="#/exams">Mở Luyện thi</a>
            </article>
            <article class="feature-card">
              <div class="feature-icon" aria-hidden="true">%</div>
              <h3>Theo dõi kết quả</h3>
              <p>Xem lịch sử và kết quả minh họa, đối chiếu cách làm và lời giải.</p>
              <a class="button button-ghost button-small" href="#/history">Mở Lịch sử</a>
            </article>
          </div>
        </section>
        <section class="section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Nội dung thực tế</span>
              <h2>Bài học tiêu biểu</h2>
            </div>
            <a class="text-button" href="#/study">Xem tất cả bài học</a>
          </div>
          <div class="card-grid">
            ${topics.map((topic) => `
              <article class="content-card">
                <span class="meta-chip">${esc(gradeName(topic.grade))}</span>
                <h3 style="margin-top:12px">${esc(topic.name)}</h3>
                <p>${esc(topic.description || "Nội dung bài học theo chương trình SGK.")}</p>
                <a class="button button-secondary button-small" style="margin-top:18px" href="#/study/${esc(topic.grade)}/${esc(topic.id)}">Xem bài học</a>
              </article>`).join("")}
          </div>
        </section>
        <section class="section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Thử sức</span>
              <h2>Một số đề thi</h2>
            </div>
            <a class="text-button" href="#/exams">Xem tất cả đề thi</a>
          </div>
          <div class="exam-grid">
            ${exams.map((exam) => examCard(exam)).join("")}
          </div>
        </section>
        <section class="section">
          <div class="notice notice-warning">
            <strong>Lưu ý về bản demo:</strong> nộp bài và gửi góp ý chỉ hoạt động đầy đủ trong bản ứng dụng được cài đặt.
          </div>
        </section>
      </div>`;
  }

  function renderStudy(grade, topicId) {
    if (topicId) return renderLesson(topicId);
    const grades = state.data.grades.map((item) => Number(item.grade));
    const selected = grades.includes(Number(grade)) ? Number(grade) : grades[0];
    const topics = state.data.topics.filter((topic) => Number(topic.grade) === selected);
    return `
      <div class="page-container">
        ${pageHeader("Học tập", "Chọn lớp và bài học để xem nội dung lý thuyết.")}
        <nav class="grade-tabs" aria-label="Chọn lớp">
          ${grades.map((item) => `<a class="grade-tab ${item === selected ? "active" : ""}" href="#/study/${item}">Lớp ${item}</a>`).join("")}
        </nav>
        <div class="toolbar">
          <label class="search-field">
            <span class="skip-link">Tìm bài học</span>
            <input id="topic-search" type="search" placeholder="Tìm bài học…" autocomplete="off">
          </label>
          <span class="muted">${number(topics.length)} bài học</span>
        </div>
        <div class="topic-grid" id="topic-grid">
          ${topics.map((topic) => topicCard(topic)).join("")}
        </div>
      </div>`;
  }

  function topicCard(topic) {
    return `
      <article class="topic-card" data-topic-card data-search="${esc(`${topic.name} ${topic.description || ""}`.toLocaleLowerCase("vi"))}">
        <span class="meta-chip">${esc(gradeName(topic.grade))}</span>
        ${topic.branch ? `<span class="meta-chip">${esc(topic.branch)}</span>` : ""}
        <h3 style="margin-top:12px">${esc(topic.name)}</h3>
        <p>${esc(topic.description || (topic.has_lesson ? "Có nội dung bài học trong bản demo." : "Nội dung chi tiết có trong bản cài đặt."))}</p>
        <a class="button button-secondary button-small" href="#/study/${esc(topic.grade)}/${esc(topic.id)}">${topic.has_lesson ? "Xem bài học" : "Xem thông tin"}</a>
      </article>`;
  }

  function renderLesson(topicId) {
    const topic = topicById.get(Number(topicId));
    if (!topic) return renderNotFound();
    const lesson = lessonByTopic.get(Number(topicId));
    return `
      <div class="page-container">
        <div class="page-actions" style="margin-bottom:18px">
          <a class="button button-secondary button-small" href="#/study/${esc(topic.grade)}">← Danh sách bài học</a>
        </div>
        <div class="lesson-layout">
          <article class="lesson-article">
            <span class="eyebrow">${esc(gradeName(topic.grade))}</span>
            <h1 style="margin:8px 0 20px">${esc(topic.name)}</h1>
            ${lesson ? `
              ${lesson.summary ? `<p class="muted">${esc(lesson.summary)}</p>` : ""}
              ${lesson.images?.length ? `<div class="lesson-images">${lesson.images.map((src) => `<img src="${esc(src)}" alt="Hình minh họa bài ${esc(topic.name)}" loading="lazy">`).join("")}</div>` : ""}
              <div class="rich-content lesson-content">${lesson.content || ""}</div>
            ` : `
              <div class="empty-state">
                <div>Bản demo chưa kèm nội dung chi tiết của bài học này.</div>
                <a class="button button-primary" href="#/practice/${esc(topic.grade)}">Luyện tập lớp ${esc(topic.grade)}</a>
              </div>
            `}
          </article>
          <aside class="lesson-aside">
            <div class="info-card">
              <span class="eyebrow">Thông tin bài học</span>
              <h3 style="margin-top:8px">${esc(topic.name)}</h3>
              <p>${esc(topic.description || "Bài học thuộc chương trình SGK.")}</p>
              <div class="button-row" style="margin-top:18px">
                <a class="button button-primary button-small" href="#/practice/${esc(topic.grade)}">Luyện tập</a>
                <a class="button button-secondary button-small" href="#/symbols">Tra ký hiệu</a>
              </div>
            </div>
          </aside>
        </div>
      </div>`;
  }

  function renderPractice(grade, count) {
    if (grade && count) return renderSession("practice", Number(grade), Number(count));
    const grades = state.data.grades.map((item) => Number(item.grade));
    const selected = grades.includes(Number(grade)) ? Number(grade) : grades[0];
    return `
      <div class="page-container">
        ${pageHeader("Luyện tập", "Chọn lớp và số câu để tạo một bài luyện tập từ dữ liệu thật.")}
        <section class="config-card">
          <span class="eyebrow">Tạo bài luyện tập</span>
          <h2 style="margin-top:8px">Bạn muốn luyện lớp nào?</h2>
          <p class="muted">Mỗi bài hiển thị từng câu một, có bảng chọn câu và lời giải tham khảo.</p>
          <form class="config-form" id="practice-setup-form">
            <div class="field">
              <label for="practice-grade">Lớp</label>
              <select id="practice-grade" name="grade">
                ${grades.map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>Lớp ${item}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="practice-count">Số câu</label>
              <select id="practice-count" name="count">
                <option value="5">5 câu</option>
                <option value="10" selected>10 câu</option>
                <option value="20">20 câu</option>
              </select>
            </div>
            <button class="button button-primary" type="submit">Bắt đầu luyện tập</button>
          </form>
        </section>
      </div>`;
  }

  function renderExams() {
    return `
      <div class="page-container">
        ${pageHeader("Luyện thi", "Chọn một đề thi để trải nghiệm giao diện làm bài và đồng hồ đếm ngược.")}
        <div class="toolbar">
          <label class="search-field">
            <span class="skip-link">Tìm đề thi</span>
            <input id="exam-search" type="search" placeholder="Tìm đề thi…" autocomplete="off">
          </label>
          <span class="muted">${number(state.data.exams.length)} đề thi</span>
        </div>
        <div class="exam-grid" id="exam-grid">
          ${state.data.exams.map((exam) => examCard(exam)).join("")}
        </div>
      </div>`;
  }

  function examCard(exam) {
    return `
      <article class="exam-card" data-exam-card data-search="${esc(`${exam.title} ${exam.grade}`.toLocaleLowerCase("vi"))}">
        <span class="meta-chip">${esc(gradeName(exam.grade))}</span>
        <span class="meta-chip">${number(exam.question_ids.length)} câu</span>
        <span class="meta-chip">${number(exam.duration_minutes)} phút</span>
        <h3 style="margin-top:12px">${esc(exam.title)}</h3>
        <p>${esc(exam.description || "Đề thi trong dữ liệu phát hành.")}</p>
        <a class="button button-primary button-small" href="#/exam/${esc(exam.id)}">Vào làm bài</a>
      </article>`;
  }

  function renderSession(kind, gradeOrCount, maybeCount) {
    let key;
    let title;
    let subtitle;
    let ids;
    let exam = null;
    if (kind === "practice") {
      const grade = Number(gradeOrCount);
      const requested = Number(maybeCount);
      const available = state.data.practice_papers[String(grade)] || [];
      ids = available.slice(0, requested);
      title = `Luyện tập ${gradeName(grade)}`;
      subtitle = `${ids.length} câu · Dữ liệu demo`;
      key = `practice:${grade}:${requested}`;
    } else {
      exam = examById.get(Number(gradeOrCount));
      if (!exam) return renderNotFound();
      ids = exam.question_ids;
      title = exam.title;
      subtitle = `${gradeName(exam.grade)} · ${ids.length} câu · ${exam.duration_minutes} phút`;
      key = `exam:${exam.id}`;
    }
    if (!ids.length) {
      return `<div class="page-container"><div class="empty-state">Chưa có câu hỏi phù hợp trong dữ liệu demo.</div></div>`;
    }
    if (state.sessionKey !== key) {
      state.sessionKey = key;
      state.sessionQuestionIds = ids;
      state.answers = {};
      state.current = 0;
      state.examEnd = exam ? Date.now() + exam.duration_minutes * 60000 : null;
    }
    const question = questionById.get(Number(ids[state.current]));
    if (!question) return renderNotFound();
    const answered = ids.filter((id) => {
      const value = state.answers[String(id)];
      return value !== undefined && value !== null && String(value).trim() !== "";
    }).length;
    const percent = Math.round((answered / ids.length) * 100);
    return `
      <div class="page-container">
        <div class="session-toolbar">
          <div class="session-title">
            <h1>${esc(title)}</h1>
            <p>${esc(subtitle)}</p>
          </div>
          ${exam ? `<div class="exam-timer" id="exam-timer" aria-label="Thời gian còn lại">${duration(Math.max(0, state.examEnd - Date.now()) / 1000)}</div>` : `<span class="demo-pill">Bản demo tĩnh</span>`}
        </div>
        <div class="session-layout">
          <article class="question-card">
            <div class="question-heading">
              <h2>Câu ${state.current + 1} / ${ids.length}</h2>
              <button class="button button-secondary button-small" type="button" data-action="show-solution">Xem lời giải</button>
            </div>
            <div class="question-content">${question.prompt || ""}</div>
            ${question.images?.length ? `<div class="question-images">${question.images.map((src) => `<img src="${esc(src)}" alt="Hình minh họa câu ${state.current + 1}" loading="lazy">`).join("")}</div>` : ""}
            ${question.options?.length ? `
              <div class="options-list" role="radiogroup" aria-label="Phương án trả lời">
                ${question.options.map((option, index) => {
                  const selected = String(state.answers[String(question.id)] ?? "") === String(index);
                  return `
                    <label class="option-label ${selected ? "selected" : ""}" data-option-label>
                      <input type="radio" name="answer-${esc(question.id)}" value="${index}" data-answer data-question-id="${esc(question.id)}" ${selected ? "checked" : ""}>
                      <span class="option-letter">${esc(option.label || String.fromCharCode(65 + index))}</span>
                      <span class="option-text">${option.text || esc(option.value || "")}</span>
                    </label>`;
                }).join("")}
              </div>
            ` : `
              <div class="answer-area">
                <label for="answer-${esc(question.id)}"><strong>Trả lời</strong></label>
                <textarea id="answer-${esc(question.id)}" data-answer data-question-id="${esc(question.id)}" placeholder="Nhập câu trả lời…">${esc(state.answers[String(question.id)] || "")}</textarea>
              </div>
            `}
            <div class="question-actions">
              <div class="button-row">
                <button class="button button-secondary" type="button" data-action="prev-question" ${state.current === 0 ? "disabled" : ""}>Câu trước</button>
                <button class="button button-secondary" type="button" data-action="next-question" ${state.current === ids.length - 1 ? "disabled" : ""}>Câu sau</button>
              </div>
              <button class="button button-primary" type="button" data-action="submit-session">Nộp bài</button>
            </div>
          </article>
          <aside class="session-panel">
            <h2>Tiến độ làm bài</h2>
            <p id="progress-text">Đã làm ${answered}/${ids.length} câu</p>
            <div class="progress-track" aria-hidden="true"><div class="progress-bar" id="progress-bar" style="width:${percent}%"></div></div>
            <div class="question-palette" aria-label="Chọn câu">
              ${ids.map((id, index) => {
                const value = state.answers[String(id)];
                const done = value !== undefined && value !== null && String(value).trim() !== "";
                return `<button class="palette-button ${done ? "answered" : ""} ${index === state.current ? "current" : ""}" type="button" data-action="jump-question" data-index="${index}" aria-label="Câu ${index + 1}${done ? ", đã làm" : ""}">${index + 1}</button>`;
              }).join("")}
            </div>
            <button class="button button-secondary button-small" type="button" data-action="submit-session">Nộp bài</button>
            <div class="pager-buttons">
              <button class="button button-secondary button-small" type="button" data-action="prev-question" ${state.current === 0 ? "disabled" : ""}>Trước</button>
              <button class="button button-secondary button-small" type="button" data-action="next-question" ${state.current === ids.length - 1 ? "disabled" : ""}>Sau</button>
            </div>
          </aside>
        </div>
      </div>`;
  }

  function updateProgress() {
    const ids = state.sessionQuestionIds;
    const answered = ids.filter((id) => {
      const value = state.answers[String(id)];
      return value !== undefined && value !== null && String(value).trim() !== "";
    }).length;
    const text = document.getElementById("progress-text");
    const bar = document.getElementById("progress-bar");
    if (text) text.textContent = `Đã làm ${answered}/${ids.length} câu`;
    if (bar) bar.style.width = `${Math.round((answered / ids.length) * 100)}%`;
    document.querySelectorAll("[data-action='jump-question']").forEach((button) => {
      const index = Number(button.dataset.index);
      const value = state.answers[String(ids[index])];
      const done = value !== undefined && value !== null && String(value).trim() !== "";
      button.classList.toggle("answered", done);
      button.setAttribute("aria-label", `Câu ${index + 1}${done ? ", đã làm" : ""}`);
    });
  }

  function renderHistory() {
    return `
      <div class="page-container">
        ${pageHeader("Lịch sử", "Các lượt làm bài minh họa để xem trước trang kết quả và lời giải.")}
        <div class="notice" style="margin-bottom:20px">Dữ liệu lịch sử dưới đây là dữ liệu minh họa, không phải lịch sử thật của khách hàng.</div>
        <div class="card-grid">
          ${state.data.history.map((entry) => `
            <article class="content-card">
              <span class="meta-chip">${entry.kind === "exam" ? "Luyện thi" : "Luyện tập"}</span>
              <span class="meta-chip">${esc(dateTime(entry.created_at))}</span>
              <h3 style="margin-top:12px">${esc(entry.title)}</h3>
              <p>${entry.correct}/${entry.total} câu đúng · ${duration(entry.duration_seconds)}</p>
              <a class="button button-primary button-small" style="margin-top:18px" href="#/history/${esc(entry.id)}">Xem kết quả</a>
            </article>`).join("")}
        </div>
      </div>`;
  }

  function renderResult(historyId) {
    const entry = historyById.get(String(historyId));
    if (!entry) return renderNotFound();
    const reviews = entry.question_ids.map((id) => {
      const question = questionById.get(Number(id));
      const answer = entry.answers[String(id)];
      const correctIndexes = question.options.map((option, index) => option.is_correct ? index : -1).filter((index) => index >= 0);
      const selectedIndex = question.options.length ? Number(answer) : -1;
      const correct = question.options.length
        ? correctIndexes.includes(selectedIndex)
        : Boolean(String(answer ?? "").trim());
      return { question, answer, correctIndexes, selectedIndex, correct };
    });
    const retry = entry.kind === "exam"
      ? `#/exam/${esc(entry.exam_id)}`
      : `#/practice/${esc(entry.grade)}/${Math.min(entry.total, 20)}`;
    return `
      <div class="page-container">
        <div class="page-actions" style="margin-bottom:18px">
          <a class="button button-secondary button-small" href="#/history">← Lịch sử</a>
          <a class="button button-primary button-small" href="${retry}">Làm lại</a>
        </div>
        ${pageHeader(entry.title, "Kết quả minh họa trong bản demo tĩnh.")}
        <div class="feature-grid" style="margin-bottom:26px">
          <div class="feature-card"><span class="eyebrow">Số câu đúng</span><h3 style="font-size:30px;margin-top:8px">${entry.correct}/${entry.total}</h3></div>
          <div class="feature-card"><span class="eyebrow">Điểm minh họa</span><h3 style="font-size:30px;margin-top:8px">${number(entry.score)}</h3></div>
          <div class="feature-card"><span class="eyebrow">Thời gian</span><h3 style="font-size:30px;margin-top:8px">${duration(entry.duration_seconds)}</h3></div>
          <div class="feature-card"><span class="eyebrow">Thời điểm</span><h3 style="font-size:18px;margin-top:12px">${esc(dateTime(entry.created_at))}</h3></div>
        </div>
        <div class="topic-grid">
          ${reviews.map((review, index) => `
            <article class="content-card">
              <div class="question-heading">
                <h3>Câu ${index + 1}</h3>
                <span class="meta-chip">${review.correct ? "Đúng" : "Cần xem lại"}</span>
              </div>
              <div class="question-content">${review.question.prompt || ""}</div>
              <p style="margin-top:14px"><strong>Bạn chọn:</strong> ${answerText(review.question, review.answer)}</p>
              <p><strong>Đáp án:</strong> ${correctAnswerText(review.question, review.correctIndexes)}</p>
              <button class="button button-secondary button-small" style="margin-top:16px" type="button" data-action="show-solution" data-question-id="${esc(review.question.id)}">Xem lời giải</button>
            </article>`).join("")}
        </div>
      </div>`;
  }

  function optionDisplay(option) {
    return option.text || esc(option.value || option.label || "");
  }

  function answerText(question, answer) {
    if (question.options.length) {
      const option = question.options[Number(answer)];
      return option ? optionDisplay(option) : "Chưa trả lời";
    }
    return answer ? esc(answer) : "Chưa trả lời";
  }

  function correctAnswerText(question, indexes) {
    if (question.options.length) {
      return indexes.map((index) => optionDisplay(question.options[index])).join("<br>");
    }
    return question.solution?.answer ? esc(question.solution.answer) : "Xem lời giải";
  }

  function renderSymbols() {
    return `
      <div class="page-container">
        ${pageHeader("Ký hiệu toán học", `Bảng tra cứu ${number(state.data.symbols.length)} ký hiệu từ lớp 1 đến lớp 12.`)}
        <div class="toolbar">
          <label class="search-field">
            <span class="skip-link">Tìm ký hiệu</span>
            <input id="symbol-search" type="search" placeholder="Tìm theo tên, cách đọc hoặc ý nghĩa…" autocomplete="off">
          </label>
          <span class="muted">${number(state.data.symbols.length)} ký hiệu</span>
        </div>
        ${state.data.symbol_groups.map((group) => `
          <section class="section">
            <div class="section-heading"><h2>${esc(group.label)}</h2><span class="muted">${group.items.length} mục</span></div>
            <div class="symbol-grid">
              ${group.items.map((symbol) => `
                <article class="symbol-card" data-symbol-card data-search="${esc(`${symbol.read} ${symbol.mean} ${symbol.tex}`.toLocaleLowerCase("vi"))}">
                  <div class="symbol-display">${symbol.vi || symbol.plain ? esc(symbol.vi || symbol.plain) : `$${esc(symbol.tex)}$`}${symbol.vi ? `<div class="symbol-intl">$${esc(symbol.tex)}$ · Quốc tế</div>` : ""}</div>
                  <h3>${esc(symbol.read)}</h3>
                  <p>${esc(symbol.mean)}</p>
                </article>`).join("")}
            </div>
          </section>`).join("")}
      </div>`;
  }

  function renderNotFound() {
    return `<div class="page-container"><div class="empty-state"><div>Không tìm thấy nội dung trong bản demo.</div><a class="button button-primary" href="#/">Về trang chủ</a></div></div>`;
  }

  function setActiveNav(page) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === page);
    });
  }

  function render() {
    if (!state.data) return;
    window.clearInterval(state.timer);
    state.timer = null;
    const parts = routeParts();
    state.route = parts;
    const page = parts[0] || "home";
    let html;
    switch (page) {
      case "study":
        html = renderStudy(parts[1], parts[2]);
        break;
      case "practice":
        html = renderPractice(parts[1], parts[2]);
        break;
      case "exams":
        html = renderExams();
        break;
      case "exam":
        html = renderSession("exam", Number(parts[1]));
        break;
      case "history":
        html = parts[1] ? renderResult(parts[1]) : renderHistory();
        break;
      case "symbols":
        html = renderSymbols();
        break;
      case "home":
      default:
        html = renderHome();
        break;
    }
    app.innerHTML = html;
    setActiveNav(page === "exam" ? "exams" : page);
    document.title = page === "home"
      ? "Ứng dụng Toán học"
      : `${pageTitle(page)} · Ứng dụng Toán học`;
    renderMath(app);
    if (page === "exam") startExamTimer();
    document.getElementById("main-nav")?.classList.remove("open");
    document.querySelector(".nav-toggle")?.setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function pageTitle(page) {
    return ({
      study: "Học tập",
      practice: "Luyện tập",
      exams: "Luyện thi",
      exam: "Luyện thi",
      history: "Lịch sử",
      symbols: "Ký hiệu toán học",
    })[page] || "Ứng dụng Toán học";
  }

  function startExamTimer() {
    if (!state.examEnd) return;
    const update = () => {
      const element = document.getElementById("exam-timer");
      if (!element) return;
      const left = Math.max(0, state.examEnd - Date.now());
      element.textContent = left > 0 ? duration(left / 1000) : "Hết thời gian demo";
    };
    update();
    state.timer = window.setInterval(update, 1000);
  }

  function openModal(id, focusSelector) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => modal.querySelector(focusSelector)?.focus(), 0);
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    if (document.querySelectorAll(".modal-backdrop:not([hidden])").length === 0) {
      document.body.style.overflow = "";
    }
  }

  function openFeedback() {
    openModal("feedback-backdrop", "#feedback-content");
  }

  function showInstallMessage(kind) {
    const title = kind === "feedback" ? "Gửi góp ý" : "Nộp bài";
    document.getElementById("install-title").textContent = title;
    document.getElementById("install-message").textContent = state.data.messages[kind];
    closeModal("feedback-backdrop");
    openModal("install-backdrop", "[data-action='close-install']");
  }

  function showSolution(questionId) {
    const id = Number(questionId || state.sessionQuestionIds[state.current]);
    const question = questionById.get(id);
    if (!question) return;
    const correct = question.options
      .map((option, index) => option.is_correct ? `<li>${esc(option.label || String.fromCharCode(65 + index))}. ${optionDisplay(option)}</li>` : "")
      .join("");
    document.getElementById("solution-content").innerHTML = `
      ${question.solution?.answer ? `<div class="notice"><strong>Đáp án:</strong> ${esc(question.solution.answer)}</div>` : ""}
      ${correct ? `<h3>Phương án đúng</h3><ul>${correct}</ul>` : ""}
      ${question.solution?.methods?.length ? `<h3>Cách giải</h3>${question.solution.methods.map((method) => `<div class="rich-content solution-content">${method.content || ""}</div>`).join("<hr>")}` : ""}
      ${question.solution?.content ? `<h3>Lời giải</h3><div class="rich-content solution-content">${question.solution.content}</div>` : ""}
      ${!question.solution?.content && !question.solution?.methods?.length ? `<p class="muted">Chưa có lời giải trong dữ liệu demo.</p>` : ""}`;
    openModal("solution-backdrop", "[data-action='close-solution']");
    renderMath(document.getElementById("solution-content"));
  }

  function currentQuestion() {
    return questionById.get(Number(state.sessionQuestionIds[state.current]));
  }

  function changeQuestion(index) {
    if (index < 0 || index >= state.sessionQuestionIds.length) return;
    state.current = index;
    render();
  }

  function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle-nav") {
      const nav = document.getElementById("main-nav");
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    } else if (action === "open-feedback") {
      openFeedback();
    } else if (action === "close-feedback") {
      closeModal("feedback-backdrop");
    } else if (action === "close-install") {
      closeModal("install-backdrop");
    } else if (action === "close-solution") {
      closeModal("solution-backdrop");
    } else if (action === "prev-question") {
      changeQuestion(state.current - 1);
    } else if (action === "next-question") {
      changeQuestion(state.current + 1);
    } else if (action === "jump-question") {
      changeQuestion(Number(button.dataset.index));
    } else if (action === "submit-session") {
      showInstallMessage("submit");
    } else if (action === "show-solution") {
      showSolution(button.dataset.questionId);
    } else if (action === "retry-load") {
      window.location.reload();
    }
  }

  function handleSubmit(event) {
    if (event.target.id === "practice-setup-form") {
      event.preventDefault();
      const grade = new FormData(event.target).get("grade");
      const count = new FormData(event.target).get("count");
      window.location.hash = `#/practice/${grade}/${count}`;
    } else if (event.target.id === "feedback-form") {
      event.preventDefault();
      showInstallMessage("feedback");
    }
  }

  function handleInput(event) {
    const answer = event.target.closest("[data-answer]");
    if (answer) {
      state.answers[String(answer.dataset.questionId)] = answer.value;
      if (answer.type === "radio") {
        answer.closest(".options-list")?.querySelectorAll("[data-option-label]").forEach((label) => {
          label.classList.toggle("selected", label.querySelector("input")?.checked);
        });
      }
      updateProgress();
      return;
    }
    if (event.target.id === "topic-search") {
      const query = event.target.value.toLocaleLowerCase("vi").trim();
      document.querySelectorAll("[data-topic-card]").forEach((card) => {
        card.hidden = !card.dataset.search.includes(query);
      });
    } else if (event.target.id === "exam-search") {
      const query = event.target.value.toLocaleLowerCase("vi").trim();
      document.querySelectorAll("[data-exam-card]").forEach((card) => {
        card.hidden = !card.dataset.search.includes(query);
      });
    } else if (event.target.id === "symbol-search") {
      const query = event.target.value.toLocaleLowerCase("vi").trim();
      document.querySelectorAll("[data-symbol-card]").forEach((card) => {
        card.hidden = !card.dataset.search.includes(query);
      });
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const backdrop = event.target.closest(".modal-backdrop");
      if (backdrop && event.target === backdrop) {
        if (backdrop.id === "feedback-backdrop") closeModal("feedback-backdrop");
        if (backdrop.id === "install-backdrop") closeModal("install-backdrop");
        if (backdrop.id === "solution-backdrop") closeModal("solution-backdrop");
      }
      handleClick(event);
    });
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleInput);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      ["solution-backdrop", "install-backdrop", "feedback-backdrop"].forEach((id) => {
        const modal = document.getElementById(id);
        if (modal && !modal.hidden) closeModal(id);
      });
    });
    window.addEventListener("hashchange", render);
  }

  async function init() {
    try {
      const response = await fetch("./data/demo.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.data = data;
      data.questions.forEach((question) => questionById.set(Number(question.id), question));
      data.topics.forEach((topic) => topicById.set(Number(topic.id), topic));
      data.lessons.forEach((lesson) => lessonByTopic.set(Number(lesson.topic_id), lesson));
      data.exams.forEach((exam) => examById.set(Number(exam.id), exam));
      data.history.forEach((entry) => historyById.set(String(entry.id), entry));
      bindEvents();
      window.__DEMO_READY__ = true;
      window.__DEMO_DATA__ = data;
      render();
    } catch (error) {
      app.innerHTML = `<div class="page-container"><div class="error-state"><div><strong>Không tải được dữ liệu demo.</strong><p>Hãy chạy trang qua HTTP hoặc GitHub Pages, không mở trực tiếp bằng file://.</p><button class="button button-primary" type="button" data-action="retry-load">Thử lại</button></div></div></div>`;
      console.error(error);
    }
  }

  init();
})();
