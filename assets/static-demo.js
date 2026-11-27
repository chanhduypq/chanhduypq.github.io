(function () {
  'use strict';

  var demo = window.STATIC_DEMO || {};
  var routes = demo.routes || {};
  var variants = demo.variants || {};
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function parseUrl(value) {
    return new URL(String(value || ''), window.location.href);
  }

  function appPath(url) {
    var path = url.pathname || '/';
    var prefix = '/' + 'chanhduypq.github.io/';
    if (path.indexOf(prefix) === 0) path = path.slice(prefix.length - 1);
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  }

  function fileUrl(name) {
    return new URL(String(name || 'index.html'), window.location.href).href;
  }

  function routeTarget(value) {
    var raw = String(value || '');
    if (!raw || raw.charAt(0) === '#') return raw;
    if (/^(?:\.\.?\/|[A-Za-z0-9_-]+\.html(?:[?#]|$))/.test(raw)) return raw;
    var url = parseUrl(raw);
    if (url.protocol !== 'file:' && url.origin !== window.location.origin) return null;
    var path = appPath(url);
    var exact = path + (url.search || '');
    if (routes[exact]) return routes[exact];

    var grade = url.searchParams.get('grade') || '';
    var mode = url.searchParams.get('mode') || 'ca_hai';
    var table = variants[path] || {};
    var key = '';
    if (path === '/practice') key = grade + '|' + mode;
    else if (path === '/practice_ratio') key = grade;
    else if (path === '/history' || path === '/capability' || path === '/today' ||
             path === '/weekly_report' || path === '/exams') key = grade;
    if (key && table[key]) return table[key];
    if (table['']) return table[''];
    if (routes[path]) return routes[path];
    if (path.indexOf('/exam/ngau-nhien') === 0) return variants['/exams'] && variants['/exams'][grade] || 'exams.html';
    if (path.indexOf('/practice_similar/') === 0) return 'practice.html';
    if (path.indexOf('/redo/') === 0) return 'redo-last.html';
    return 'index.html';
  }

  function navigate(value, replace) {
    var target = routeTarget(value);
    if (!target) return false;
    var href = fileUrl(target);
    if (replace && window.history && history.replaceState) history.replaceState(null, '', href);
    else window.location.href = href;
    return true;
  }

  function jsonResponse(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: {'Content-Type': 'application/json; charset=utf-8'}
    });
  }

  function formValues(form) {
    var values = new URLSearchParams();
    Array.prototype.forEach.call(form.elements, function (field) {
      if (!field.name || field.disabled) return;
      if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
      if (field.tagName === 'BUTTON' && field.type !== 'submit') return;
      values.append(field.name, field.value || '');
    });
    return values;
  }

  function installNavigation() {
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey) return;
      var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      var href = anchor.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(?:mailto:|tel:|data:)/i.test(href)) return;
      if (/\.html(?:[?#]|$)/.test(href)) return;
      if (!routeTarget(href)) return;
      event.preventDefault();
      navigate(href);
    }, true);

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.tagName || form.tagName.toLowerCase() !== 'form') return;
      if (!form.hasAttribute('data-demo-form')) return;
      event.preventDefault();
      event.stopPropagation();
      if (form.hasAttribute('data-demo-submit')) {
        if (window.showNotice) window.showNotice(demo.messages.submit, 'Thông báo');
        return;
      }
      var action = form.getAttribute('action') || window.location.pathname;
      var values = formValues(form);
      if (form.hasAttribute('data-demo-exam-ability')) {
        var grade = values.get('grade') || '';
        var kind = values.get('kind') || '';
        navigate('/exam/ngau-nhien?grade=' + encodeURIComponent(grade) + '&kind=' + encodeURIComponent(kind));
        return;
      }
      var query = values.toString();
      navigate(action + (action.indexOf('?') >= 0 ? '&' : '?') + query);
    }, true);

    if (window.AJAX && typeof window.AJAX.navigate === 'function') {
      window.AJAX.navigate = function (value) {
        if (navigate(value)) return;
        window.location.href = fileUrl('index.html');
      };
    }
  }

  function installFetch() {
    if (!nativeFetch) return;
    window.fetch = function (input, init) {
      var raw = typeof input === 'string' ? input : (input && input.url) || '';
      var url = parseUrl(raw);
      var path = appPath(url);
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

      if (/^\/(?:static|uploads|bai_hoc|assets|data)\//.test(path)) {
        return nativeFetch(fileUrl(path.replace(/^\//, '')), init);
      }
      if (url.protocol === 'file:' && /^(?:\.\.?\/|[A-Za-z0-9_-]+\/)/.test(raw)) {
        return nativeFetch(url.href, init);
      }
      if (url.protocol === 'file:' && /^\/(?:static|uploads|bai_hoc|assets|data)\//.test(url.pathname)) {
        return nativeFetch(fileUrl(url.pathname.replace(/^\//, '')), init);
      }
      if (path === '/topics_by_grade' || path === '/curriculum_topics') {
        var grade = url.searchParams.get('grade');
        var topics = (demo.topics || []).filter(function (topic) {
          return !grade || topic.grade_hint === 0 || String(topic.grade_hint) === String(grade);
        });
        return Promise.resolve(jsonResponse({ok: true, topics: topics}));
      }
      if (path === '/notifications') return Promise.resolve(jsonResponse({ok: true, items: [], unread: 0}));
      if (path === '/notifications/read' || path === '/nav_activity') {
        return Promise.resolve(jsonResponse({ok: true, unread: 0}));
      }
      if (path === '/feedback') {
        return Promise.resolve(jsonResponse({ok: true, reply: demo.messages.feedback}));
      }
      if (path === '/chat/suggest') {
        return Promise.resolve(jsonResponse({ok: true, questions: [
          'Cách làm bài tập?', 'Cách xem lịch sử?', 'Cách mở bài học SGK?', 'Cách làm đề thi?'
        ]}));
      }
      if (path === '/asr/status') {
        return Promise.resolve(jsonResponse({ok: true, enabled: false, available: false, vocab: []}));
      }
      if (path === '/asr/transcribe') {
        return Promise.resolve(jsonResponse({ok: false, error: 'Bản demo tĩnh không có máy chủ nhận dạng giọng nói.'}, 503));
      }
      if (path === '/ai/suggest') {
        return Promise.resolve(jsonResponse({ok: false, error: 'Gợi ý gõ chữ cần máy chủ AI.'}, 503));
      }
      return Promise.resolve(jsonResponse({ok: false, error: 'Chức năng này cần bản cài đặt.'}, 404));
    };
  }

  function StaticEventSource(url) {
    var self = this;
    var listeners = {};
    var timer = null;
    var closed = false;
    this.url = String(url || '');
    this.readyState = 0;
    this.onmessage = null;
    this.onerror = null;
    this.onopen = null;

    function emit(type, data) {
      if (closed) return;
      var event = {data: data == null ? '' : String(data), type: type};
      (listeners[type] || []).forEach(function (handler) { handler(event); });
      if (type === 'message' && typeof self.onmessage === 'function') self.onmessage(event);
      if (type === 'error' && typeof self.onerror === 'function') self.onerror(event);
      if (type === 'open' && typeof self.onopen === 'function') self.onopen(event);
    }

    function messages(items, done) {
      var index = 0;
      function next() {
        if (closed) return;
        if (index >= items.length) {
          if (done !== false) emit('message', '[DONE]');
          self.close();
          return;
        }
        emit('message', items[index++]);
        timer = window.setTimeout(next, 18);
      }
      next();
    }

    this.addEventListener = function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    };
    this.removeEventListener = function (type, handler) {
      listeners[type] = (listeners[type] || []).filter(function (item) { return item !== handler; });
    };
    this.close = function () {
      if (closed) return;
      closed = true;
      this.readyState = 2;
      if (timer) window.clearTimeout(timer);
    };

    timer = window.setTimeout(function () {
      if (closed) return;
      self.readyState = 1;
      emit('open');
      var parsed = parseUrl(self.url);
      var path = appPath(parsed);
      var qid = parseInt(parsed.searchParams.get('question_id') || '0', 10);
      var topicId = parseInt(parsed.searchParams.get('topic_id') || '0', 10);

      if (path === '/chat/answer_stream') {
        emit('meta', JSON.stringify({sources: [{title: 'Hướng dẫn sử dụng'}]}));
        messages(['Bản demo tĩnh chưa kết nối trợ lý AI. Bạn có thể mở trang Hướng dẫn sử dụng để xem cách dùng các chức năng.']);
        return;
      }

      if (path === '/ai/lesson_stream') {
        if (!topicId && qid) {
          var links = (demo.question_topics || {})[String(qid)] || [];
          topicId = parseInt(links[0] || '0', 10);
        }
        var lesson = (demo.lessons || {})[String(topicId)];
        if (!lesson) {
          emit('note', JSON.stringify({text: demo.lesson_messages.no_topic}));
          messages([], true);
          return;
        }
        var images = lesson.images || [];
        emit('meta', JSON.stringify({
          lesson_topic_id: topicId,
          has_image: images.length > 0,
          image_count: images.length,
          has_audio: false
        }));
        if (lesson.content) messages([lesson.content], true);
        else if (images.length) messages([''], true);
        else {
          emit('note', JSON.stringify({text: demo.lesson_messages.soon}));
          messages([], true);
        }
        return;
      }

      if (path === '/ai/explain_stream' || path === '/ai/explain_essay_stream' ||
          path === '/ai/regenerate_stream') {
        var question = (demo.questions || []).find(function (item) { return item.id === qid; });
        var solution = question && question.solution ? question.solution.plain : '';
        emit('meta', JSON.stringify({
          question_id: qid,
          branch: question ? question.branch_code : '',
          has_figure: question ? question.has_figure : false,
          figure_note: question ? question.figure_note : '',
          image_urls: question ? question.image_urls : []
        }));
        messages([solution || 'Bản demo tĩnh không gọi AI. Lời giải của câu này chưa có trong dữ liệu phát hành.'], true);
        return;
      }

      emit('note', JSON.stringify({text: 'Chức năng này cần bản cài đặt.'}));
      messages([], true);
    }, 0);
  }

  window.EventSource = StaticEventSource;

  window.lessonShowImage = function (meta) {
    var holder = document.getElementById('lesson-image');
    if (!holder) return;
    holder.innerHTML = '';
    if (!meta || !meta.has_image || !meta.lesson_topic_id) {
      holder.classList.add('d-none');
      return;
    }
    var lesson = (demo.lessons || {})[String(meta.lesson_topic_id)] || {};
    (lesson.images || []).forEach(function (src, index) {
      var image = document.createElement('img');
      image.className = 'img-fluid border rounded mb-2';
      image.alt = 'Ảnh SGK, trang ' + (index + 1);
      image.src = src;
      holder.appendChild(image);
    });
    holder.classList.toggle('d-none', !(lesson.images || []).length);
  };

  window.lessonShowAudio = function () {
    var holder = document.getElementById('lesson-audio');
    if (!holder) return;
    holder.innerHTML = '';
    holder.classList.add('d-none');
  };

  installFetch();
  installNavigation();

  document.addEventListener('DOMContentLoaded', function () {
    var route = document.body.getAttribute('data-static-route') || '/trang-chu';
    if (window.NAV_ACTIVE && window.NAV_ACTIVE.mark) window.NAV_ACTIVE.mark(route);
    if (window.UPGRADE_BANNER && window.UPGRADE_BANNER.show) window.UPGRADE_BANNER.show(route);
  });

  window.STATIC_DEMO_RUNTIME = {routeTarget: routeTarget, navigate: navigate};
})();
