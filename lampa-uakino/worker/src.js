'use strict';

// Версія парсера для Cloudflare Workers: працює цілодобово без власного комп'ютера.
// Збирається в один файл командою `node worker/build.js` → worker/dist/worker.mjs

const parse = require('../lib/parse');
const { parseTorrent } = require('../lib/bencode');
const { toJackett } = require('../lib/jackett');
const { createOnline } = require('../lib/online');

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
    Referer: opts.referer || cfg.host + '/',
  };
  if (cfg.cookie) headers.Cookie = cfg.cookie;
  if (opts.xhr) headers['X-Requested-With'] = 'XMLHttpRequest';
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

    if (url.pathname.indexOf('/online/') === 0) {
      const online = createOnline({
        host: cfg.host,
        fetchText: async (u, o) => (await request(cfg, u, o)).text(),
        searchSite: (s) => searchSite(cfg, ctx, s),
      });
      const data = await online.route(url.pathname, q);
      if (data) return json(data, 200, { 'Cache-Control': 'max-age=600' });
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
    return json({ error: e.message }, e.status || 502);
  }
}

module.exports = { fetch: handle };
