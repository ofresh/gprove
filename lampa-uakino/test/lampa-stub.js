// Мінімальна імітація API Lampa і jQuery для тесту плагіна.
(function () {
  function Q(nodes) { this.nodes = nodes; this.length = nodes.length; }
  Q.prototype.find = function (sel) { var out = []; this.nodes.forEach(function (n) { out = out.concat([].slice.call(n.querySelectorAll(sel))); }); return new Q(out); };
  Q.prototype.first = function () { return new Q(this.nodes.slice(0, 1)); };
  Q.prototype.after = function (q) { var n = this.nodes[0]; q.nodes.forEach(function (c) { n.parentNode.insertBefore(c, n.nextSibling); }); return this; };
  Q.prototype.append = function (q) { var n = this.nodes[0]; if (n) q.nodes.forEach(function (c) { n.appendChild(c); }); return this; };
  Q.prototype.on = function (ev, fn) { this.nodes.forEach(function (n) { n.addEventListener(ev, fn); }); return this; };
  window.$ = function (x) {
    if (typeof x === 'string' && x.trim()[0] === '<') { var d = document.createElement('div'); d.innerHTML = x.trim(); return new Q([].slice.call(d.children)); }
    if (typeof x === 'string') return new Q([].slice.call(document.querySelectorAll(x)));
    return new Q([x]);
  };

  var listeners = {};
  var storage = {};
  window.__settings = [];
  window.Lampa = {
    Storage: { get: function (k, d) { return k in storage ? storage[k] : d; }, set: function (k, v) { storage[k] = v; } },
    Listener: { follow: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); } },
    Controller: { enabled: function () { return { name: 'full_start' }; }, toggle: function () {} },
    Noty: { show: function (m) { window.__noty = m; } },
    Loading: { start: function () {}, stop: function () {} },
    Select: { show: function (o) { window.__select = o; } },
    Torrent: { start: function (element, movie) { window.__started = { element: element, movie: movie }; } },
    Utils: { hash: function (s) { return String(s.length); }, strToTime: function (s) { return Date.parse(s); } },
    SettingsApi: {
      addComponent: function (c) { window.__settings.push(c.component); },
      addParam: function (p) { window.__settings.push(p.param.name); }
    },
    Reguest: function () {
      var xhr;
      var t = 0;
      this.timeout = function (v) { t = v; };
      this.clear = function () { if (xhr) xhr.abort(); };
      this.silent = function (url, ok, err) {
        xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.timeout = t;
        xhr.onload = function () { if (xhr.status === 200) ok(JSON.parse(xhr.responseText)); else err(xhr, xhr.status); };
        xhr.onerror = function () { err(xhr, 'error'); };
        xhr.send();
      };
    }
  };
  window.appready = true;
  window.__fireFull = function (movie) {
    (listeners.full || []).forEach(function (fn) {
      fn({ type: 'complite', data: { movie: movie }, object: { activity: { render: function () { return $(document.getElementById('full')); } } } });
    });
  };
  window.__enter = function (sel) { document.querySelector(sel).dispatchEvent(new Event('hover:enter')); };
})();
