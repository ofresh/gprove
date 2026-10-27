// Мінімальна імітація API Lampa і jQuery для тесту плагіна.
(function () {
  function Q(nodes) { this.nodes = nodes; this.length = nodes.length; }
  Q.prototype.find = function (sel) { var out = []; this.nodes.forEach(function (n) { out = out.concat([].slice.call(n.querySelectorAll(sel))); }); return new Q(out); };
  Q.prototype.first = function () { return new Q(this.nodes.slice(0, 1)); };
  Q.prototype.after = function (q) { var n = this.nodes[0]; q.nodes.forEach(function (c) { n.parentNode.insertBefore(c, n.nextSibling); }); return this; };
  Q.prototype.before = function (q) { var n = this.nodes[0]; q.nodes.forEach(function (c) { n.parentNode.insertBefore(c, n); }); return this; };
  Q.prototype.text = function (t) { this.nodes.forEach(function (n) { n.textContent = t; }); return this; };
  Q.prototype.remove = function () { this.nodes.forEach(function (n) { n.remove(); }); return this; };
  Q.prototype.append = function (q) { var n = this.nodes[0]; if (n) q.nodes.forEach(function (c) { n.appendChild(c); }); return this; };
  Q.prototype.on = function (ev, fn) { this.nodes.forEach(function (n) { n.addEventListener(ev, fn); }); return this; };
  window.$ = function (x) {
    if (typeof x === 'string' && x.trim()[0] === '<') { var d = document.createElement('div'); d.innerHTML = x.trim(); return new Q([].slice.call(d.children)); }
    if (typeof x === 'string') return new Q([].slice.call(document.querySelectorAll(x)));
    return new Q([x]);
  };

  var listeners = {};
  var components = {};
  var current = null;
  window.Navigator = { canmove: function () { return true; }, move: function () {} };
  var storage = {};
  window.__settings = [];
  window.Lampa = {
    Storage: { get: function (k, d) { return k in storage ? storage[k] : d; }, set: function (k, v) { storage[k] = v; } },
    Listener: { follow: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); } },
    Controller: {
      enabled: function () { return { name: 'full_start' }; },
      toggle: function (n) { window.__controller = n; },
      add: function (n, c) { window.__controllers = window.__controllers || {}; window.__controllers[n] = c; },
      collectionSet: function () {},
      collectionFocus: function () {}
    },
    Noty: { show: function (m) { window.__noty = m; } },
    Loading: { start: function () {}, stop: function () {} },
    Select: { show: function (o) { window.__select = o; } },
    Component: { add: function (name, fn) { components[name] = fn; } },
    Activity: {
      push: function (obj) {
        var comp = new components[obj.component](obj);
        var activity = { loader: function (v) { window.__loader = v; }, toggle: function () { comp.start(); } };
        comp.activity = activity;
        current = activity;
        comp.create();
        document.body.appendChild(comp.render().nodes[0]);
        window.__component = comp;
      },
      active: function () { return { activity: current }; },
      backward: function () {}
    },
    Scroll: function () {
      var box = document.createElement('div');
      box.className = 'scroll';
      this.render = function () { return new Q([box]); };
      this.append = function (q) { q.nodes.forEach(function (n) { box.appendChild(n); }); };
      this.clear = function () { box.innerHTML = ''; };
      this.update = function () {};
      this.destroy = function () { box.remove(); };
    },
    Player: {
      play: function (o) { window.__play = o; },
      playlist: function (l) { window.__playlist = l; }
    },
    Timeline: { view: function (hash) { return { hash: hash }; }, render: function () { return new Q([document.createElement('i')]); } },
    Torrent: { start: function (element, movie) { window.__started = { element: element, movie: movie }; } },
    Utils: { hash: function (s) { return 'h:' + s; }, strToTime: function (s) { return Date.parse(s); } },
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
