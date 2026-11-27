/* ==========================================================================
   ajax.js — các hàm dùng cho THAO TÁC TRONG CÙNG MỘT TRANG

   Mặc định của toàn bộ ứng dụng là HÀNH VI GỐC CỦA TRÌNH DUYỆT: bấm link là tải
   trang mới, gửi form là chuyển trang. AJAX là OPT-IN — chỉ dùng khi kết quả của
   thao tác vẫn nằm trong chính trang đang đứng (lọc danh sách, nạp lại khối hiện
   tại), không phải để điều hướng.

   Cách dùng (khai báo ở template, không sửa JS từng trang):
     <form method="post" action="/history" data-ajax>Nộp bộ lọc giữ nguyên trang</form>
     <form method="get" action="/exams" data-ajax>Chọn lớp, ghi ?grade= lên URL</form>
     <a href="/capability" data-ajax data-ajax-target="#box">
     <div data-ajax-get="/topics_by_grade?grade=6" data-ajax-target="#box">

   Phía server: request đi qua file này mang header `X-AJAX: 1`, nên route
   trả `{"ok": true, "html": ...}` (chỉ có manh nội dung, xem utils.page_or_json)
   thay vì trọn trang HTML.

   Fallback — ưu tiên "trang vẫn chạy khi JS hỏng":
     * trình duyệt không có fetch/Promise -> không gắn gì cả, form và link hoạt
       động theo kiểu cũ (reload trang);
     * server trả HTML (route chưa chuyển AJAX, trang lỗi)
       -> chuyển hướng thật `location.assign()` tới đúng URL đó;
     * JSON báo lỗi kèm `redirect` -> cũng chuyển hướng thật tới trang đích
       mà server chỉ ra trong phản hồi;
     * rớt mạng / timeout -> hiện thông báo và bấm "Thử lại" để nạp lại trang.
  ========================================================================== */
(function (global) {
  'use strict';

  var HEADER = 'X-AJAX';
  var DEFAULT_TARGET = '#page-body';
  var TIMEOUT_MS = 20000;   // mặc định; data-ajax-timeout ghi đè cho từng form/link

  function supported() {
    return typeof global.fetch === 'function' &&
      typeof global.Promise === 'function' &&
      typeof global.FormData === 'function' &&
      typeof global.URL === 'function' &&
      typeof document.createElement !== 'undefined';
  }

  function body(sel) {
    return document.querySelector(sel || DEFAULT_TARGET);
  }

  /* Hai kẻ cuộn tùy trang: phần lớn trang cuộn theo tài liệu (window), riêng trang thi
     và trang luyện tập giữ cột nội dung cao một màn hình nên chính #page-body cuộn.
     Sau khi thay mảnh nội dung mới phải đưa cả hai về đầu, nếu không em đứng ở giữa
     trang cũ sẽ bị rơi lơ lửng khi câu chữ mới ngắn hơn. */
  function scrollTop(host) {
    global.scrollTo(0, 0);
    if (host && typeof host.scrollTop === 'number') host.scrollTop = 0;
  }

  /* ---------------- HTTP cơ bản ---------------- */

  function toQuery(params) {
    var out = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === null || typeof v === 'undefined' || v === '') return;
      if (Object.prototype.toString.call(v) === '[object Array]') {
        v.forEach(function (item) {
          out.push(encodeURIComponent(k) + '=' + encodeURIComponent(item));
        });
      } else {
        out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      }
    });
    return out.join('&');
  }

  function withParams(url, params) {
    var q = toQuery(params);
    if (!q) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + q;
  }

  /* Goi server, tra ve ket qua da chuan hoa:
     {ok:true, html, url, status} | {ok:false, native, status} | {ok:false, error} */
  function request(url, init, timeoutMs) {
    init = init || {};
    init.headers = init.headers || {};
    init.headers[HEADER] = '1';
    init.credentials = 'same-origin';
    var ctrl = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var timer = null;
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || TIMEOUT_MS);
    }
    return global.fetch(url, init).then(function (res) {
      if (timer) clearTimeout(timer);
      var ctype = (res.headers && res.headers.get('content-type')) || '';
      if (ctype.indexOf('application/json') < 0) {
        /* Route chua chuyen sang page_or_json: tra ca trang HTML. Doc luon phan
           than de lay manh `#page-body` (xem extractPageBody) thay vi bat nguoi
           dung tai lai ca trang. Kieu khac (tai file, anh...) thi de trinh duyet
           xu ly nhu cu qua `native`. */
        var info = { ok: false, native: res.url || url, status: res.status, htmlOnly: true };
        if (ctype.indexOf('text/html') >= 0 && typeof res.text === 'function') {
          return res.text().then(function (text) {
            info.htmlText = text;
            return info;
          });
        }
        return info;
      }
      return res.json().then(function (d) {
        d = d || {};
        d.status = res.status;
        d.url = d.url || res.url || url;
        if (!d.ok && d.redirect) d.native = d.redirect;
        return d;
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: (err && err.name === 'AbortError')
        ? 'Hết thời gian chờ. Kiểm tra kết nối rồi thử lại.'
        : 'Không kết nối được server. Hãy thử lại.' };
    });
  }

  function getJSON(url, params) {
    return request(withParams(url, params), { method: 'GET' });
  }

  function postJSON(url, data) {
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
  }

  function postForm(url, form, params) {
    var fd = new global.FormData(form);
    toQuery(params).split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      fd.append(decodeURIComponent(pair.slice(0, i)), decodeURIComponent(pair.slice(i + 1)));
    });
    return request(url, { method: 'POST', body: fd });
  }

  /* ---------------- Nạp manh nội dung vào trang ---------------- */

  function hoistStyles(container) {
    var links = Array.prototype.slice.call(container.querySelectorAll('link[rel~="stylesheet"]'));
    links.forEach(function (link) {
      var href = link.getAttribute('href');
      var exists = href && document.querySelector('head link[href="' + href + '"]');
      if (exists || !link.parentNode) return;
      document.head.appendChild(link);
    });
  }

  /* <script> chen qua innerHTML khong chay — tai tao chu de chay chung,
     script co `src` thi chay theo thu tu de ham toan cuc da san sang. */
  function runScripts(container) {
    var scripts = Array.prototype.slice.call(container.querySelectorAll('script'));
    var chain = Promise.resolve();
    scripts.forEach(function (old) {
      var fresh = document.createElement('script');
      Array.prototype.forEach.call(old.attributes, function (attr) {
        fresh.setAttribute(attr.name, attr.value);
      });
      if (old.src) {
        chain = chain.then(function () {
          return new Promise(function (resolve) {
            fresh.onload = fresh.onerror = resolve;
            old.parentNode.replaceChild(fresh, old);
          });
        });
      } else {
        fresh.text = old.textContent;
        old.parentNode.replaceChild(fresh, old);
      }
    });
    return chain;
  }

  function decorate(container) {
    hoistStyles(container);
    return runScripts(container).then(function () {
      if (global.renderStoredSolutions) global.renderStoredSolutions(container);
      if (global.renderPageMath) global.renderPageMath(container);
      return container;
    });
  }

  /* Lay manh noi dung `#page-body` tu mot trang HTML day du (`page.html` + base.html).
     Route nao chua chuyen sang page_or_json thi van tra tron trang; lay dung cot noi
     dung de thay vao `#page-body` hien tai, tranh tai lai ca trang. */
  function parsePage(html) {
    if (typeof global.DOMParser !== 'function') return null;
    try {
      var doc = new global.DOMParser().parseFromString(html, 'text/html');
      var box = doc && doc.getElementById(DEFAULT_TARGET.slice(1));
      if (!box) return null;
      return { doc: doc, html: box.innerHTML };
    } catch (e) {
      return null;
    }
  }

  /* Trang day du con mang theo <script> o cuoi <body> (block extra_scripts cua
     base.html) nam NGOAI #page-body nen khi chi thay cot noi dung thi chung bi bo
     quen. Chay lai nhung script chua co tren trang hien tai de cac trang nhu
     "Nap bai tap", "AI" van hoat dong sau luot thay manh.
     Khoa theo `src`, con script inline thi khoa theo noi dung — nho vay script menu
     cua base.html (da chay luc tai trang) khong bi chay lai moi luot doi trang. */
  function runPageScripts(doc) {
    if (!doc || !doc.body) return;
    var live = Array.prototype.slice.call(document.scripts);
    var scripts = Array.prototype.slice.call(doc.body.querySelectorAll('script'));
    scripts.forEach(function (s) {
      if (s.closest && s.closest(DEFAULT_TARGET)) return;   /* trong manh -> decorate lo */
      var src = s.getAttribute('src');
      if (src) {
        var loaded = live.some(function (x) { return x.getAttribute('src') === src; });
        if (loaded) return;                    /* da co tren trang -> khong chay lai */
      } else {
        var text = s.textContent || '';
        var seen = live.some(function (x) {
          return !x.getAttribute('src') && (x.textContent || '') === text;
        });
        if (seen) return;                      /* script inline trung noi dung -> bo qua */
      }
      var fresh = document.createElement('script');
      Array.prototype.forEach.call(s.attributes, function (a) {
        fresh.setAttribute(a.name, a.value);
      });
      fresh.text = s.textContent || '';
      document.body.appendChild(fresh);
    });
  }

  function message(text, target, cls) {
    var host = target || body();
    if (!host) return;
    var div = document.createElement('div');
    div.className = 'ajax-msg ' + (cls || 'ajax-msg-error');
    div.textContent = text;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary btn-sm ms-2';
    btn.textContent = 'Thử lại';
    btn.addEventListener('click', function () { global.location.reload(); });
    div.appendChild(btn);
    host.insertBefore(div, host.firstChild);
  }

  /* ---------------- Trang thai dang tai (tien trinh + khoa tuong tac) ----------------

     Moi luot tai/nop deu khoa toan trang cho den khi xong: lop phu `#ajax-overlay`
     chan moi cu bam, thanh tien trinh o dinh trang bao hieu dang chay, va
     `wireClicks`/`wireSubmit` bo qua khi con luot chua xong. Nhieu luot chay song
     song (VD mot luot nop bai kem vai khoi tu nap) thi chi mo khoa khi luot cuoi
     ket thuc — dem `pending`. Luot "quiet" (tu nap khoi phu) chi lam mo dung vung
     cua no, khong bat lop phu toan trang. */

  var pending = 0;
  var loaderBuilt = false;

  function isBusy() {
    return pending > 0;
  }

  function ensureLoader() {
    if (loaderBuilt || !document.body) return;
    loaderBuilt = true;
    var overlay = document.createElement('div');
    overlay.className = 'ajax-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    var spinner = document.createElement('div');
    spinner.className = 'ajax-spinner';
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);
    var bar = document.createElement('div');
    bar.className = 'ajax-progress';
    bar.setAttribute('aria-hidden', 'true');
    var fill = document.createElement('div');
    fill.className = 'ajax-progress-fill';
    bar.appendChild(fill);
    document.body.appendChild(bar);
  }

  function setBusy(on, target, quiet) {
    var host = target || body();
    if (host) host.classList.toggle('ajax-loading', !!on);
    if (quiet) return;
    pending += on ? 1 : -1;
    if (pending < 0) pending = 0;
    var busy = pending > 0;
    if (busy) ensureLoader();
    document.documentElement.classList.toggle('ajax-busy', busy);
  }

  /* Chỗ cần loading mà không đi qua `load`/`request` (nơi gọi `fetch` trực tiếp như
     /admin_questions) tự bật/tắt bằng hàm này: cùng bộ đếm `pending`, cùng lớp phủ và
     thanh tiến trình như mọi trang khác, nên mấy lượt chạy song song chỉ tắt khi lượt
     cuối xong. `on` thiếu thì hiểu là bật. */
  function setPageBusy(on) {
    setBusy(on === undefined ? true : !!on, body(), false);
  }

  /* Cho chỗ cần loading mà JS gọi `fetch` trực tiếp (hành động hàng loạt ở
     /admin_questions, popup sửa câu hỏi): cùng chiều loading như `load` nhưng không đổi
     nội dung trang. Tắt khi lượt mạng xong ở CẢ NHÁNH lỗi — lỗi mạng mà quên tắt thì
     trang bị khóa đến khi tải lại. Trả về đúng promise của `fetch` nên chuỗi `.then`
     của nơi gọi giữ nguyên từng chữ. */
  function busyFetch(url, init) {
    setPageBusy(true);
    var p = global.fetch(url, init);
    var off = function (v) { setPageBusy(false); return v; };
    p.then(off, off);
    return p;
  }

  function goto(url) {
    global.location.assign(url);
  }

  /* Sau khi da thay noi dung vao `target`: dong bo URL neu can, keo len dau trang,
     roi chay script/KaTeX trong manh moi va bao su kien `ajax:swapped`. */
  function afterSwap(target, opts, method, url) {
    if (opts.history === 'replace' && url) global.history.replaceState({ ajax: true }, '', url);
    if (opts.history === 'push' && url) global.history.pushState({ ajax: true }, '', url);
    if (opts.scroll !== false) scrollTop(target);
    return decorate(target).then(function () {
      if (typeof global.CustomEvent === 'function') {
        // detail.method: cho nav_activity.js biết đây là một lượt ghi (POST)
        target.dispatchEvent(new global.CustomEvent('ajax:swapped', {
          bubbles: true, detail: { method: method, url: url }
        }));
      }
      return target;
    });
  }

  /* Tai manh noi dung tu `url` va thay vao `opts.target`.
     opts: {method, body, params, target, history('replace'|'push'|'none'), button, quiet} */
  function load(url, opts) {
    opts = opts || {};
    var target = body(opts.target);
    var method = (opts.method || 'GET').toUpperCase();
    if (!target) {                       /* khong cho noi dung -> ve che do cu */
      if (method === 'GET') goto(url);
      return Promise.resolve(null);
    }
    var init = { method: method };
    if (opts.body) init.body = opts.body;
    if (opts.button) opts.button.disabled = true;
    setBusy(true, target, opts.quiet);
    return request(opts.params ? withParams(url, opts.params) : url, init, opts.timeout).then(function (d) {
      setBusy(false, target, opts.quiet);
      if (opts.button) opts.button.disabled = false;
      if (d.ok && d.html) {
        target.innerHTML = d.html;
        return afterSwap(target, opts, method, d.url);
      }
      if (d.htmlOnly && d.htmlText) {          /* route tra tron trang -> lay #page-body */
        var page = parsePage(d.htmlText);
        if (page) {
          target.innerHTML = page.html;
          runPageScripts(page.doc);
          return afterSwap(target, opts, method, d.url);
        }
      }
      if (d.native) goto(d.native);            /* tai file / HTML khong co khung #page-body */
      else if (d.error) message(d.error, target);
      return null;
    });
  }

  function navigate(url, opts) {
    return load(url, Object.assign({ history: 'replace' }, opts || {}));
  }

  function submitForm(form, opts) {
    opts = opts || {};
    var url = opts.url || form.getAttribute('action') || global.location.href;
    var method = (opts.method || form.getAttribute('method') || 'GET').toUpperCase();
    var button = opts.button || form.querySelector('button[type=submit]');
    /* Form GET thi URL tu do da du dung tham so -> the gioi thuc van chay */
    if (method === 'GET') {
      return load(withParams(url, formToParams(form)), Object.assign({ history: 'replace' }, opts));
    }
    return load(url, Object.assign({ method: 'POST', body: new global.FormData(form), button: button }, opts));
  }

  function formToParams(form) {
    var out = {};
    new global.FormData(form).forEach(function (value, key) {
      if (out[key] === undefined) out[key] = value;
      else if (Object.prototype.toString.call(out[key]) === '[object Array]') out[key].push(value);
      else out[key] = [out[key], value];
    });
    return out;
  }

  /* ---------------- Gán sự kiện: CHỈ phần tử khai báo `data-ajax` mới đi qua AJAX -----

     Mặc định: mọi `<a>` và mọi `<form>` giữ hành vi gốc của trình duyệt (tải lại trang).
     `data-ajax` bật AJAX cho đúng một link/form, dành cho thao tác có kết quả nằm trong
     trang đang đứng. Ngoài ra còn phải:
       * `data-ajax-download` hoặc `download` — để trình duyệt tải file;
       * `target` khác `_self` — mở tab/cửa sổ riêng;
       * link ngoài, link neo `#...`, `tel:`/`mailto:`...                            */

  function closestData(el, attr) {
    var node = el.closest ? el.closest('[' + attr + ']') : null;
    return node && node.getAttribute(attr);
  }

  /* data-ajax-timeout="180000": cho gọi AI lâu hơn mặc định 20 s (VD: liệt kê bài
     học SGK). Server vẫn chạy tới đích nếu client bỏ sớm, nên giá trị này chỉ quyết
     người dùng thấy gì — thấy danh sách mới hay thấy nút "Thử lại". */
  function timeoutOf(el) {
    var ms = parseInt(closestData(el, 'data-ajax-timeout') || '', 10);
    return ms > 0 ? ms : null;
  }

  function sameOrigin(href) {
    try {
      var u = new global.URL(href, global.location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      return u.origin === global.location.origin;
    } catch (e) {
      return false;
    }
  }

  function ajaxLink(a) {
    if (!a || !a.hasAttribute('data-ajax')) return false;
    if (a.hasAttribute('data-ajax-download') || a.hasAttribute('download')) return false;
    if (a.hasAttribute('target') && a.getAttribute('target') !== '_self') return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    return sameOrigin(href);
  }

  function ajaxForm(form) {
    if (!form || !form.hasAttribute('data-ajax')) return false;
    if (form.hasAttribute('target') && form.getAttribute('target') !== '_self') return false;
    return true;
  }

  function wireClicks(ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!link || !ajaxLink(link)) return;
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey ||
        ev.shiftKey || ev.altKey) return;
    if (isBusy()) { ev.preventDefault(); return; }   /* dang chay: chan moi cu bam */
    var href = link.getAttribute('href');
    ev.preventDefault();
    navigate(href, {
      target: closestData(link, 'data-ajax-target') || null,
      timeout: timeoutOf(link),
      /* `data-ajax="push"` giữ mục lịch sử để nút Quay lại còn dùng được;
         `data-ajax` trần (giá trị "true") thì thay URL tại chỗ. */
      history: link.getAttribute('data-ajax') === 'push' ? 'push' : 'replace'
    });
  }

  function wireSubmit(ev) {
    var form = ev.target && ev.target.matches ? ev.target.closest('form') : null;
    if (!form || !ajaxForm(form) || ev.defaultPrevented) return;
    if (isBusy()) { ev.preventDefault(); return; }
    var isGet = (form.getAttribute('method') || 'GET').toUpperCase() === 'GET';
    ev.preventDefault();
    submitForm(form, {
      target: closestData(form, 'data-ajax-target') || null,
      url: closestData(form, 'data-ajax-url') || null,
      timeout: timeoutOf(form),
      button: ev.submitter || null,
      /* POST: giu nguyen URL hien tai de F5 khong gui lai bai lam (tru luot dung) */
      history: isGet ? 'replace' : 'none'
    });
  }

  /* Khối [data-ajax-get] tự nạp nội dung khi trang hiện ra (VD: hộp lời giải).
     Nạp ngầm (quiet) nên không bật lớp phủ khoá trang. */
  function fillSlots(root) {
    var host = root || document;
    var slots = Array.prototype.slice.call(host.querySelectorAll('[data-ajax-get]'));
    if (host.querySelectorAll && host.hasAttribute && host.hasAttribute('data-ajax-get')) {
      slots.push(host);
    }
    slots.forEach(function (el) {
      if (el.dataset.ajaxFilled) return;
      el.dataset.ajaxFilled = '1';
      load(el.getAttribute('data-ajax-get'), {
        target: el.id ? '#' + el.id : closestData(el, 'data-ajax-target'),
        history: 'none',
        scroll: false,
        quiet: true
      });
    });
  }

  function autowire() {
    if (!supported()) return false;          /* không có fetch -> mặc hành vi cũ */
    document.addEventListener('click', wireClicks);
    document.addEventListener('submit', wireSubmit);
    fillSlots(document);
    document.addEventListener('ajax:swapped', function (ev) { fillSlots(ev.target); });
    return true;
  }

  var AJAX = {
    supported: supported,
    request: request,
    getJSON: getJSON,
    postJSON: postJSON,
    postForm: postForm,
    load: load,
    navigate: navigate,
    busy: setPageBusy,
    busyFetch: busyFetch,
    submitForm: submitForm,
    message: message,
    decorate: decorate,
    fillSlots: fillSlots,
    autowire: autowire,
    toQuery: toQuery,
    withParams: withParams
  };

  global.AJAX = AJAX;
  global.ajaxGet = getJSON;
  global.ajaxPost = postJSON;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autowire);
  } else {
    autowire();
  }
})(window);
