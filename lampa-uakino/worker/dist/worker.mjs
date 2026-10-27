// Згенеровано worker/build.js з lampa-uakino — не редагуйте вручну.
// UAKino → Lampa: Jackett-сумісний парсер торентів uakino.best для Cloudflare Workers.

const __PLUGIN_SOURCE__ = "/*\n * UAKino торенти — плагін для Lampa.\n * Додає кнопку «UAKino» на картку фільму/серіалу: шукає торенти uakino.best\n * через парсер (server.js з цього репозиторію) і запускає їх у TorrServer.\n *\n * Найпростіше встановлення: у Lampa → Налаштування → Розширення → Додати плагін\n * вкажіть http://<IP-парсера>:9118/uakino.js — адреса парсера підставиться сама.\n */\n(function () {\n  'use strict';\n\n  if (window.uakino_torrents_plugin) return;\n  window.uakino_torrents_plugin = true;\n\n  // Сервер замінює цей рядок своєю адресою, коли віддає плагін за /uakino.js\n  var BUILT_IN_SERVER = '__UAKINO_SERVER__';\n  if (BUILT_IN_SERVER.indexOf('__') === 0) BUILT_IN_SERVER = '';\n\n  var ICON = '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\"><path fill=\"currentColor\" d=\"M12 2 3 6v6c0 5 3.8 9.7 9 10 5.2-.3 9-5 9-10V6l-9-4Zm0 4.2 2 4.3H10l2-4.3ZM8 12h8l-4 6-4-6Z\"/></svg>';\n\n  function serverUrl() {\n    var s = Lampa.Storage.get('uakino_server', '') || BUILT_IN_SERVER;\n    s = String(s).trim().replace(/\\/+$/, '');\n    if (s && !/^https?:\\/\\//i.test(s)) s = 'http://' + s;\n    return s;\n  }\n\n  function enc(v) {\n    return encodeURIComponent(v || '');\n  }\n\n  function searchUrl(movie) {\n    var title = movie.title || movie.name || '';\n    var original = movie.original_title || movie.original_name || '';\n    var date = movie.release_date || movie.first_air_date || '';\n    var key = Lampa.Storage.get('uakino_apikey', '');\n    return serverUrl() + '/api/v2.0/indexers/uakino/results' +\n      '?apikey=' + enc(key) +\n      '&Query=' + enc(title || original) +\n      '&title=' + enc(title) +\n      '&title_original=' + enc(original) +\n      '&year=' + enc(String(date).slice(0, 4)) +\n      '&is_serial=' + (movie.name || movie.first_air_date ? 2 : 1);\n  }\n\n  function bytes(size) {\n    if (!size) return '';\n    if (Lampa.Utils && Lampa.Utils.bytesToSize) return Lampa.Utils.bytesToSize(size);\n    var units = ['B', 'KB', 'MB', 'GB', 'TB'];\n    var i = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));\n    return (size / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];\n  }\n\n  function prepare(element) {\n    element.size = bytes(element.Size);\n    if (Lampa.Utils && Lampa.Utils.hash) element.hash = Lampa.Utils.hash(element.Title);\n    if (Lampa.Utils && Lampa.Utils.strToTime && element.PublishDate) element.PublisTime = Lampa.Utils.strToTime(element.PublishDate);\n    return element;\n  }\n\n  function play(element, movie) {\n    if (Lampa.Torrent && typeof Lampa.Torrent.start === 'function') {\n      Lampa.Torrent.start(element, movie);\n    } else {\n      Lampa.Noty.show('Ця версія Lampa не підтримує запуск торентів з плагіна');\n    }\n  }\n\n  var network = null;\n\n  function stopLoading() {\n    if (Lampa.Loading && Lampa.Loading.stop) Lampa.Loading.stop();\n  }\n\n  function open(movie) {\n    if (!serverUrl()) {\n      Lampa.Noty.show('Вкажіть адресу парсера UAKino: Налаштування → UAKino');\n      return;\n    }\n\n    var controller = Lampa.Controller.enabled().name;\n    if (network) network.clear();\n    network = new Lampa.Reguest();\n    network.timeout(120000);\n\n    if (Lampa.Loading && Lampa.Loading.start) {\n      Lampa.Loading.start(function () {\n        network.clear();\n        stopLoading();\n        Lampa.Controller.toggle(controller);\n      });\n    }\n\n    network.silent(searchUrl(movie), function (json) {\n      stopLoading();\n      var results = (json && json.Results) || [];\n      if (!results.length) {\n        Lampa.Noty.show('На UAKino торентів не знайдено');\n        Lampa.Controller.toggle(controller);\n        return;\n      }\n\n      var items = results.map(function (r) {\n        var info = [];\n        if (r.Size) info.push(bytes(r.Size));\n        if (r.Files) info.push(r.Files + ' файл.');\n        info.push('▲ ' + (r.Seeders || 0));\n        info.push('▼ ' + (r.Peers || 0));\n        return { title: r.Title, subtitle: info.join(' • '), torrent: prepare(r) };\n      });\n\n      Lampa.Select.show({\n        title: 'UAKino — торенти',\n        items: items,\n        onSelect: function (item) {\n          Lampa.Controller.toggle(controller);\n          play(item.torrent, movie);\n        },\n        onBack: function () {\n          Lampa.Controller.toggle(controller);\n        }\n      });\n    }, function (a, c) {\n      stopLoading();\n      var err = network.errorDecode ? network.errorDecode(a, c) : 'помилка запиту';\n      if (a && a.responseJSON && a.responseJSON.error) err = a.responseJSON.error;\n      Lampa.Noty.show('UAKino: ' + err);\n      Lampa.Controller.toggle(controller);\n    });\n  }\n\n  function addButton(e) {\n    var render = e.object.activity.render();\n    if (render.find('.view--uakino').length) return;\n\n    var button = $('<div class=\"full-start__button selector view--uakino\">' + ICON + '<span>UAKino</span></div>');\n    button.on('hover:enter', function () {\n      open(e.data.movie);\n    });\n\n    var torrent = render.find('.view--torrent');\n    if (torrent.length) torrent.after(button);\n    else render.find('.full-start-new__buttons, .full-start__buttons').first().append(button);\n\n    // Оновлюємо навігацію, щоб кнопка стала доступною з пульта.\n    if (Lampa.Controller.enabled().name === 'full_start') Lampa.Controller.toggle('full_start');\n  }\n\n  function addSettings() {\n    if (!Lampa.SettingsApi) return;\n    Lampa.SettingsApi.addComponent({ component: 'uakino', name: 'UAKino', icon: ICON });\n    Lampa.SettingsApi.addParam({\n      component: 'uakino',\n      param: { name: 'uakino_server', type: 'input', values: '', default: '', placeholder: BUILT_IN_SERVER || 'http://192.168.1.10:9118' },\n      field: {\n        name: 'Адреса парсера',\n        description: BUILT_IN_SERVER ? 'За замовчуванням: ' + BUILT_IN_SERVER : 'Адреса, де запущено server.js (порт 9118)'\n      }\n    });\n    Lampa.SettingsApi.addParam({\n      component: 'uakino',\n      param: { name: 'uakino_apikey', type: 'input', values: '', default: '', placeholder: '' },\n      field: { name: 'API-ключ', description: 'Лише якщо на парсері задано UAKINO_APIKEY' }\n    });\n  }\n\n  function start() {\n    addSettings();\n    Lampa.Listener.follow('full', function (e) {\n      if (e.type === 'complite') addButton(e);\n    });\n  }\n\n  if (window.appready) start();\n  else {\n    Lampa.Listener.follow('app', function (e) {\n      if (e.type === 'ready') start();\n    });\n  }\n})();\n";

const __modules = {
  "worker/src.js": [{"../lib/parse":"lib/parse.js","../lib/bencode":"lib/bencode.js","../lib/jackett":"lib/jackett.js"}, function (module, exports, require) {
'use strict';

// Версія парсера для Cloudflare Workers: працює цілодобово без власного комп'ютера.
// Збирається в один файл командою `node worker/build.js` → worker/dist/worker.mjs

const parse = require('../lib/parse');
const { parseTorrent } = require('../lib/bencode');
const { toJackett } = require('../lib/jackett');

const DEFAULT_HOST = 'https://uakino.best';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
// Безкоштовний план Workers дозволяє 50 підзапитів на один запит.
const MAX_TORRENTS = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });
}

function settings(env) {
  return {
    host: String(env.UAKINO_HOST || DEFAULT_HOST).replace(/\/+$/, ''),
    cookie: env.UAKINO_COOKIE || '',
    ua: env.UAKINO_UA || UA,
    apikey: env.UAKINO_APIKEY || '',
    maxPages: Number(env.UAKINO_MAX_PAGES || 5),
  };
}

async function request(cfg, url, opts = {}) {
  const headers = {
    'User-Agent': cfg.ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.7',
    Referer: cfg.host + '/',
  };
  if (cfg.cookie) headers.Cookie = cfg.cookie;
  if (opts.body) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body || null, redirect: 'follow' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const cf = /cloudflare/i.test(res.headers.get('server') || '') || /cloudflare/i.test(text.slice(0, 3000));
    const err = new Error('HTTP ' + res.status + ' for ' + url + (cf ? ' (Cloudflare заблокував запит)' : ''));
    err.status = res.status;
    throw err;
  }
  return res;
}

// Кеш Cloudflare (у Node-тестах його немає — тоді просто без кешу).
const edge = typeof caches !== 'undefined' ? caches.default : null;

async function cached(key, ttl, ctx, fn) {
  const req = new Request('https://uakino-cache.internal/' + encodeURIComponent(key));
  if (edge) {
    const hit = await edge.match(req);
    if (hit) return hit.json();
  }
  const value = await fn();
  if (edge && value !== undefined) {
    const put = edge.put(req, new Response(JSON.stringify(value), { headers: { 'Cache-Control': 'max-age=' + ttl } }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return value;
}

async function searchSite(cfg, ctx, q) {
  return cached('search:' + cfg.host + ':' + q.toLowerCase(), 1800, ctx, async () => {
    const res = await request(cfg, cfg.host + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(q));
    let list = parse.parseList(await res.text(), cfg.host);
    if (!list.length) {
      const body = new URLSearchParams({ do: 'search', subaction: 'search', search_start: '0', full_search: '0', result_from: '1', story: q }).toString();
      try {
        list = parse.parseList(await (await request(cfg, cfg.host + '/index.php?do=search', { method: 'POST', body })).text(), cfg.host);
      } catch (e) { /* лишаємо порожній список */ }
    }
    return list;
  });
}

async function page(cfg, ctx, url) {
  return cached('page:' + url, 1800, ctx, async () => parse.parsePage(await (await request(cfg, url)).text(), url, cfg.host));
}

async function torrentMeta(cfg, ctx, url) {
  return cached('torrent:' + url, 7 * 86400, ctx, async () => {
    const t = await parseTorrent(new Uint8Array(await (await request(cfg, url)).arrayBuffer()));
    return { infoHash: t.infoHash, name: t.name, size: t.size, files: t.files.length, trackers: t.trackers, magnet: t.magnet, created: t.created };
  });
}

async function find(cfg, ctx, { query, title, original, year }) {
  const titles = [title, original, query].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
  if (!titles.length) return [];

  const candidates = new Map();
  let lastError = null;
  for (const q of titles) {
    try {
      for (const item of await searchSite(cfg, ctx, q)) {
        if (!candidates.has(item.id)) candidates.set(item.id, { ...item, score: parse.scoreTitle(item, titles) });
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (!candidates.size && lastError) throw lastError;

  let list = Array.from(candidates.values()).sort((a, b) => b.score - a.score);
  const relevant = list.filter((c) => c.score >= 40);
  if (relevant.length) list = relevant;
  list = list.slice(0, cfg.maxPages);

  const pages = await Promise.all(list.map((c) => page(cfg, ctx, c.url).catch(() => null)));
  const entries = [];
  for (const p of pages) if (p) for (const t of p.torrents) entries.push({ page: p, torrent: t });

  const results = await Promise.all(entries.slice(0, MAX_TORRENTS).map(async (e) => ({
    ...e,
    meta: await torrentMeta(cfg, ctx, e.torrent.url).catch(() => null),
    peers: null,
  })));

  if (year) {
    const y = Number(year);
    results.sort((a, b) => Math.abs((a.page.year || y) - y) - Math.abs((b.page.year || y) - y));
  }
  return results;
}

async function handle(req, env, ctx) {
  const cfg = settings(env || {});
  const url = new URL(req.url);
  const q = url.searchParams;
  const base = url.origin;

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  try {
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ name: 'uakino-torrents', runtime: 'cloudflare-worker', host: cfg.host, plugin: base + '/uakino.js', jackett: base + '/api/v2.0/indexers/uakino/results?Query=...' });
    }

    if (url.pathname === '/uakino.js' || url.pathname === '/plugin.js') {
      const code = __PLUGIN_SOURCE__.replace("'__UAKINO_SERVER__'", JSON.stringify(base));
      return new Response(code, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'max-age=300', ...CORS } });
    }

    if (/^\/api\/v2\.0\/indexers\/[^/]+\/results\/?$/.test(url.pathname)) {
      if (cfg.apikey && q.get('apikey') !== cfg.apikey) return json({ error: 'bad apikey' }, 401);
      const params = {
        query: q.get('Query') || q.get('query') || '',
        title: q.get('title') || '',
        original: q.get('title_original') || '',
        year: q.get('year') || null,
      };
      const results = await find(cfg, ctx, params);
      return json({
        Results: results.map((r) => toJackett(r, base)),
        Indexers: [{ ID: 'uakino', Name: 'UAKino', Status: 2, Results: results.length, Error: null }],
      });
    }

    if (url.pathname === '/download') {
      let t;
      try { t = new URL(q.get('url') || ''); } catch (e) { return json({ error: 'bad url' }, 400); }
      const allowed = new URL(cfg.host);
      if (t.hostname.replace(/^www\./, '') !== allowed.hostname.replace(/^www\./, '') || !/^\/torrent\/\d+\//.test(t.pathname)) {
        return json({ error: 'only ' + allowed.hostname + '/torrent/* is allowed' }, 403);
      }
      const res = await request(cfg, t.toString());
      const name = decodeURIComponent(t.pathname.split('/').pop());
      return new Response(res.body, {
        headers: { 'Content-Type': 'application/x-bittorrent', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name), ...CORS },
      });
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

module.exports = { fetch: handle };

  }],
  "lib/parse.js": [{}, function (module, exports, require) {
'use strict';

// Розбір HTML uakino.best (рушій DataLife Engine) регулярними виразами,
// щоб сервер працював без сторонніх залежностей.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…' };

function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// Абсолютна адреса з коректно закодованими кирилицею та пробілами.
function absoluteUrl(href, host) {
  if (!href) return '';
  let url = decodeEntities(href.trim());
  if (url.indexOf('//') === 0) url = 'https:' + url;
  else if (!/^https?:\/\//i.test(url)) url = host.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
  try {
    const u = new URL(url);
    u.pathname = u.pathname.split('/').map((p) => encodeURIComponent(safeDecode(p))).join('/');
    return u.toString();
  } catch (e) {
    return '';
  }
}

// Посилання на інші дзеркала uakino (uakino.best, uakino.me, ...) переписуються
// на адресу, з якою працює парсер. Чужі домени відкидаються (повертається '').
function localize(url, host) {
  try {
    const u = new URL(url);
    const h = new URL(host);
    const a = u.hostname.replace(/^www\./, '');
    if (a === h.hostname.replace(/^www\./, '')) return u.toString();
    if (!/(^|\.)uakino\.[a-z]+$/i.test(a)) return '';
    u.protocol = h.protocol;
    u.host = h.host;
    return u.toString();
  } catch (e) {
    return '';
  }
}

// Сторінки матеріалів DLE мають вигляд /розділ/12345-slug.html
const NEWS_RE = /\/(\d+)-[^/]*\.html$/;

function newsId(url) {
  try {
    const m = new URL(url).pathname.match(NEWS_RE);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? (m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]) : null;
}

// Список матеріалів зі сторінки пошуку або розділу.
function parseList(html, host) {
  const found = new Map();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = attr(m[0], 'href');
    if (!href) continue;
    const url = localize(absoluteUrl(href, host), host);
    if (!url) continue;
    const id = newsId(url);
    if (!id) continue;

    const cls = attr(m[0], 'class') || '';
    let title = stripTags(m[2]);
    if (!title) {
      const img = m[2].match(/<img\b[^>]*>/i);
      if (img) title = decodeEntities(attr(img[0], 'alt') || attr(img[0], 'title') || '').trim();
    }
    const item = found.get(id) || { id, url, title: '', poster: '' };
    // Пріоритет назві з посилання-заголовка картки (a.movie-title).
    if (title && (!item.title || /movie-title|title/.test(cls))) item.title = title;
    if (!item.poster) {
      const img = m[2].match(/<img\b[^>]*>/i);
      if (img) {
        const src = attr(img[0], 'data-src') || attr(img[0], 'src');
        if (src) item.poster = absoluteUrl(src, host);
      }
    }
    found.set(id, item);
  }
  return Array.from(found.values()).filter((i) => i.title);
}

function parseYear(html) {
  const text = stripTags(html);
  const m = text.match(/Р(?:ік|ок|од)(?: виходу| выхода)?\s*:?\s*((?:19|20)\d{2})/i);
  if (m) return Number(m[1]);
  return null;
}

// Сторінка фільму/серіалу: назви, рік і всі посилання на .torrent
function parsePage(html, url, host) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i);
  let title = h1 ? stripTags(h1[1]) : '';
  if (!title && og) title = decodeEntities(attr(og[0], 'content') || '').trim();

  const orig = html.match(/class=["'][^"']*origintitle[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|h2|p)>/i);
  const original = orig ? stripTags(orig[1]) : '';

  let year = parseYear(html);
  if (!year) {
    const t = (title + ' ' + original).match(/\((19|20)\d{2}\)/);
    if (t) year = Number(t[0].slice(1, 5));
  }

  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i);
  const poster = ogImg ? absoluteUrl(attr(ogImg[0], 'content'), host) : '';

  const torrents = new Map();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = attr(m[0], 'href');
    if (!href || !/\/torrent\/\d+\//i.test(href)) continue;
    const link = localize(absoluteUrl(href, host), host);
    if (!link || torrents.has(link)) continue;
    const path = new URL(link).pathname;
    const tid = path.match(/\/torrent\/(\d+)\//)[1];
    const file = safeDecode(path.split('/').pop()).replace(/\.torrent$/i, '').trim();
    torrents.set(link, { id: tid, url: link, name: file || stripTags(m[2]), label: stripTags(m[2]) });
  }
  // Посилання можуть бути і не в <a> (наприклад, у data-атрибутах чи JS).
  const loose = /(["'])((?:https?:)?\/\/[^"'<>\s]*?\/torrent\/\d+\/[^"'<>]*?\.torrent|\/torrent\/\d+\/[^"'<>]*?\.torrent)\1/gi;
  while ((m = loose.exec(html))) {
    const link = localize(absoluteUrl(m[2], host), host);
    if (!link || torrents.has(link)) continue;
    const path = new URL(link).pathname;
    const tid = path.match(/\/torrent\/(\d+)\//)[1];
    torrents.set(link, { id: tid, url: link, name: safeDecode(path.split('/').pop()).replace(/\.torrent$/i, '').trim(), label: '' });
  }

  return { id: newsId(url), url, title, original, year, poster, torrents: Array.from(torrents.values()) };
}

function parseSitemap(xml) {
  const out = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) out.push(decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')));
  return out;
}

function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ʼ’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Наскільки матеріал відповідає шуканим назвам: 100 — точно, 40+ — релевантно.
function scoreTitle(item, titles) {
  const t = normalizeTitle(item.title + ' ' + (item.original || ''));
  let best = 0;
  for (const raw of titles) {
    const q = normalizeTitle(raw);
    if (!q) continue;
    let s = 0;
    const base = normalizeTitle(item.title).replace(/\s*(сезон|season)\s*\d+.*$/, '').trim();
    if (base === q) s = 100;
    else if (t.indexOf(q) >= 0) s = 60;
    else if (q.indexOf(base) >= 0 && base.length > 3) s = 40;
    else {
      const words = q.split(' ').filter((w) => w.length > 2);
      const hit = words.filter((w) => t.indexOf(w) >= 0).length;
      if (words.length) s = Math.round((hit / words.length) * 30);
    }
    best = Math.max(best, s);
  }
  return best;
}

module.exports = { scoreTitle, decodeEntities, stripTags, absoluteUrl, localize, newsId, parseList, parsePage, parseSitemap, normalizeTitle };

  }],
  "lib/bencode.js": [{}, function (module, exports, require) {
'use strict';

// Мінімальний bencode-декодер без залежностей від Node: працює і в Node, і в Cloudflare Workers.
// Рядки повертаються як Uint8Array, для словника "info" запам'ятовуються межі в байтах,
// щоб порахувати infohash.

const utf8 = new TextDecoder('utf-8');

function ascii(buf, start, end) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function decode(buf) {
  let pos = 0;
  let infoRange = null;

  function readInt(end) {
    const n = Number(ascii(buf, pos, end));
    if (!Number.isFinite(n)) throw new Error('bencode: bad integer at ' + pos);
    return n;
  }

  function next(depth) {
    const c = buf[pos];
    if (c === 0x69) { // i
      const end = buf.indexOf(0x65, pos);
      if (end < 0) throw new Error('bencode: unterminated integer');
      pos++;
      const n = readInt(end);
      pos = end + 1;
      return n;
    }
    if (c === 0x6c) { // l
      pos++;
      const list = [];
      while (buf[pos] !== 0x65) {
        if (pos >= buf.length) throw new Error('bencode: unterminated list');
        list.push(next(depth + 1));
      }
      pos++;
      return list;
    }
    if (c === 0x64) { // d
      pos++;
      const dict = {};
      while (buf[pos] !== 0x65) {
        if (pos >= buf.length) throw new Error('bencode: unterminated dict');
        const key = utf8.decode(next(depth + 1));
        const start = pos;
        dict[key] = next(depth + 1);
        if (depth === 0 && key === 'info') infoRange = [start, pos];
      }
      pos++;
      return dict;
    }
    if (c >= 0x30 && c <= 0x39) {
      const colon = buf.indexOf(0x3a, pos);
      if (colon < 0) throw new Error('bencode: bad string');
      const len = readInt(colon);
      const start = colon + 1;
      if (start + len > buf.length) throw new Error('bencode: string out of range');
      pos = start + len;
      return buf.subarray(start, pos);
    }
    throw new Error('bencode: unexpected byte ' + c + ' at ' + pos);
  }

  const value = next(0);
  return { value, infoRange };
}

function str(v) {
  return v instanceof Uint8Array ? utf8.decode(v) : (v == null ? '' : String(v));
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Розбирає .torrent і повертає назву, розмір, infohash, трекери та magnet.
async function parseTorrent(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf[0] !== 0x64) throw new Error('not a torrent file');
  const { value, infoRange } = decode(buf);
  if (!value.info || !infoRange) throw new Error('torrent has no info dictionary');

  const info = value.info;
  const infoHash = hex(await crypto.subtle.digest('SHA-1', buf.slice(infoRange[0], infoRange[1])));
  const name = str(info['name.utf-8'] || info.name);

  let files;
  if (Array.isArray(info.files)) {
    files = info.files.map((f) => ({
      path: (f['path.utf-8'] || f.path || []).map(str).join('/'),
      length: f.length || 0,
    }));
  } else {
    files = [{ path: name, length: info.length || 0 }];
  }
  const size = files.reduce((sum, f) => sum + f.length, 0);

  const trackers = [];
  const add = (t) => { const s = str(t); if (s && trackers.indexOf(s) < 0) trackers.push(s); };
  if (value.announce) add(value.announce);
  if (Array.isArray(value['announce-list'])) {
    value['announce-list'].forEach((tier) => (Array.isArray(tier) ? tier : [tier]).forEach(add));
  }

  const magnet = 'magnet:?xt=urn:btih:' + infoHash +
    '&dn=' + encodeURIComponent(name) +
    trackers.map((t) => '&tr=' + encodeURIComponent(t)).join('');

  return { name, infoHash, size, files, trackers, magnet, created: value['creation date'] || null };
}

module.exports = { decode, parseTorrent };

  }],
  "lib/jackett.js": [{}, function (module, exports, require) {
'use strict';

// Перетворює знайдений торент у запис формату Jackett (його розуміє Lampa).
function toJackett(r, base) {
  const { page, torrent, meta, peers } = r;
  let title = torrent.name || page.title;
  if (page.original && title.toLowerCase().indexOf(page.original.toLowerCase()) < 0) title += ' / ' + page.original;
  if (page.year && title.indexOf(String(page.year)) < 0) title += ' (' + page.year + ')';
  if (torrent.label && torrent.label !== torrent.name && title.indexOf(torrent.label) < 0) title += ' [' + torrent.label + ']';

  const serial = /сезон|season|сері[яї]|серии/i.test(torrent.name + ' ' + page.title);
  const created = meta && meta.created ? new Date(meta.created * 1000) : null;
  return {
    Tracker: 'UAKino',
    TrackerId: 'uakino',
    TrackerType: 'public',
    CategoryDesc: serial ? 'TV' : 'Movies',
    Category: serial ? [5000] : [2000],
    Title: title,
    Guid: torrent.url,
    Link: base + '/download?url=' + encodeURIComponent(torrent.url),
    Details: page.url,
    Poster: page.poster || null,
    PublishDate: (created && !isNaN(created) ? created : new Date()).toISOString(),
    Size: meta ? meta.size : 0,
    Files: meta ? meta.files : null,
    Seeders: peers ? peers.seeders : 0,
    Peers: peers ? peers.leechers : 0,
    InfoHash: meta ? meta.infoHash : null,
    MagnetUri: meta ? meta.magnet : null,
    DownloadVolumeFactor: 0,
    UploadVolumeFactor: 1,
  };
}

module.exports = { toJackett };

  }],
};

const __cache = {};
function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  const [deps, fn] = __modules[id];
  const module = (__cache[id] = { exports: {} });
  fn(module, module.exports, (spec) => {
    if (!deps[spec]) throw new Error('module not bundled: ' + spec);
    return __load(deps[spec]);
  });
  return module.exports;
}

export default __load("worker/src.js");
