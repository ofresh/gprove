'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('./parse');
const { parseTorrent } = require('./bencode');
const { scrape } = require('./scrape');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

class TTLCache {
  constructor(ttl, max = 2000) { this.ttl = ttl; this.max = max; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) { this.map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(k, { v, exp: Date.now() + this.ttl });
    return v;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class UAKino {
  constructor(opts = {}) {
    this.host = (opts.host || 'https://uakino.best').replace(/\/+$/, '');
    this.ua = opts.ua || DEFAULT_UA;
    this.cookie = opts.cookie || '';
    this.timeout = opts.timeout || 20000;
    this.concurrency = opts.concurrency || 4;
    this.maxPages = opts.maxPages || 6;
    this.scrapePeers = opts.scrapePeers !== false;
    this.indexFile = opts.indexFile || '';
    this.log = opts.log || (() => {});
    this.pages = new TTLCache(30 * 60 * 1000);
    this.searches = new TTLCache(15 * 60 * 1000);
    this.files = new TTLCache(24 * 60 * 60 * 1000);
    this.peers = new TTLCache(15 * 60 * 1000);
    this.index = this.loadIndex();
  }

  // ---------- HTTP ----------

  async request(url, { method = 'GET', body = null, referer = '', xhr = false } = {}) {
    const headers = {
      'User-Agent': this.ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.7',
      Referer: referer || this.host + '/',
    };
    if (this.cookie) headers.Cookie = this.cookie;
    if (xhr) headers['X-Requested-With'] = 'XMLHttpRequest';
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

    const res = await fetch(url, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(this.timeout) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      const cf = res.headers.get('server') === 'cloudflare' || /cloudflare/i.test(buf.toString('utf8', 0, 3000));
      const err = new Error('HTTP ' + res.status + ' for ' + url + (cf ? ' (Cloudflare заблокував запит — див. README: UAKINO_COOKIE)' : ''));
      err.status = res.status;
      throw err;
    }
    return { buf, type: res.headers.get('content-type') || '', url: res.url };
  }

  async text(url, opts) {
    return (await this.request(url, opts)).buf.toString('utf8');
  }

  // ---------- Пошук ----------

  async searchSite(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const key = q.toLowerCase();
    const cached = this.searches.get(key);
    if (cached) return cached;

    const getUrl = this.host + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(q);
    let list = parse.parseList(await this.text(getUrl), this.host);
    if (!list.length) {
      // Класичний пошук DLE через POST-форму.
      const body = new URLSearchParams({ do: 'search', subaction: 'search', search_start: '0', full_search: '0', result_from: '1', story: q }).toString();
      try {
        list = parse.parseList(await this.text(this.host + '/index.php?do=search', { method: 'POST', body }), this.host);
      } catch (e) {
        this.log('search POST "' + q + '": ' + e.message);
      }
    }
    this.log('search "' + q + '": ' + list.length);
    return this.searches.set(key, list);
  }

  async page(url) {
    const cached = this.pages.get(url);
    if (cached) return cached;
    const info = parse.parsePage(await this.text(url), url, this.host);
    if (this.index && info.id) this.index.pages[info.id] = { ...info, ts: Date.now() };
    return this.pages.set(url, info);
  }

  // Завантажує .torrent і повертає метадані (infohash, розмір, трекери, magnet).
  async torrentMeta(url) {
    const cached = this.files.get(url);
    if (cached) return cached;
    const stored = this.index && this.index.torrents[url];
    if (stored) return this.files.set(url, stored);
    const { buf } = await this.request(url, { referer: this.host + '/' });
    const t = await parseTorrent(buf);
    const meta = { infoHash: t.infoHash, name: t.name, size: t.size, files: t.files.length, trackers: t.trackers, magnet: t.magnet, created: t.created };
    if (this.index) this.index.torrents[url] = meta;
    return this.files.set(url, meta);
  }

  async torrentFile(url) {
    return (await this.request(url, { referer: this.host + '/' })).buf;
  }

  async peerStats(meta) {
    if (!this.scrapePeers || !meta || !meta.infoHash) return null;
    const cached = this.peers.get(meta.infoHash);
    if (cached !== undefined) return cached;
    return this.peers.set(meta.infoHash, await scrape(meta.trackers, meta.infoHash).catch(() => null));
  }

  score(item, titles) {
    return parse.scoreTitle(item, titles);
  }

  searchIndex(titles) {
    if (!this.index) return [];
    return Object.values(this.index.pages)
      .map((p) => ({ ...p, score: this.score(p, titles) }))
      .filter((p) => p.score >= 40);
  }

  // Головний метод: знаходить сторінки й повертає всі торенти з них.
  async find({ query = '', title = '', original = '', year = null } = {}) {
    const titles = [title, original, query].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    if (!titles.length) return [];

    const candidates = new Map();
    for (const p of this.searchIndex(titles)) candidates.set(p.id, p);
    for (const q of titles) {
      try {
        for (const item of await this.searchSite(q)) {
          if (!candidates.has(item.id)) candidates.set(item.id, { ...item, score: this.score(item, titles) });
        }
      } catch (e) {
        this.log('search error: ' + e.message);
        if (!candidates.size && q === titles[titles.length - 1]) throw e;
      }
    }

    let list = Array.from(candidates.values()).sort((a, b) => b.score - a.score);
    const relevant = list.filter((c) => c.score >= 40);
    if (relevant.length) list = relevant;
    list = list.slice(0, this.maxPages);

    const pages = await mapLimit(list, this.concurrency, async (c) => {
      try {
        return c.torrents && c.ts && Date.now() - c.ts < 6 * 60 * 60 * 1000 ? c : await this.page(c.url);
      } catch (e) {
        this.log('page error ' + c.url + ': ' + e.message);
        return null;
      }
    });

    const entries = [];
    for (const page of pages) {
      if (!page) continue;
      for (const t of page.torrents || []) entries.push({ page, torrent: t });
    }

    const results = await mapLimit(entries, this.concurrency, async ({ page, torrent }) => {
      let meta = null;
      try {
        meta = await this.torrentMeta(torrent.url);
      } catch (e) {
        this.log('torrent error ' + torrent.url + ': ' + e.message);
      }
      const peers = await this.peerStats(meta);
      return { page, torrent, meta, peers };
    });

    if (this.index) this.saveIndex();

    // Ближчий рік — вище.
    if (year) {
      const y = Number(year);
      results.sort((a, b) => Math.abs((a.page.year || y) - y) - Math.abs((b.page.year || y) - y));
    }
    return results;
  }

  // ---------- Індекс усього сайту ----------

  loadIndex() {
    if (!this.indexFile) return null;
    try {
      const data = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      return { pages: data.pages || {}, torrents: data.torrents || {} };
    } catch (e) {
      return { pages: {}, torrents: {} };
    }
  }

  saveIndex() {
    if (!this.index || !this.indexFile) return;
    fs.mkdirSync(path.dirname(this.indexFile), { recursive: true });
    const tmp = this.indexFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.index));
    fs.renameSync(tmp, this.indexFile);
  }

  async sitemapUrls() {
    const seen = new Set();
    const pages = [];
    const queue = [this.host + '/sitemap.xml'];
    while (queue.length) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      let xml;
      try { xml = await this.text(url); } catch (e) { this.log('sitemap ' + url + ': ' + e.message); continue; }
      for (const loc of parse.parseSitemap(xml)) {
        if (/\.xml(\.gz)?$/i.test(loc)) queue.push(loc);
        else if (parse.newsId(loc)) pages.push(loc);
      }
    }
    return pages;
  }

  async listingUrls(maxListing) {
    const urls = new Map();
    for (let n = 1; n <= maxListing; n++) {
      const url = n === 1 ? this.host + '/' : this.host + '/page/' + n + '/';
      let list;
      try { list = parse.parseList(await this.text(url), this.host); } catch (e) { this.log(url + ': ' + e.message); break; }
      const before = urls.size;
      for (const i of list) urls.set(i.id, i.url);
      this.log('listing page ' + n + ': ' + (urls.size - before) + ' new');
      if (urls.size === before) break;
      await sleep(300);
    }
    return Array.from(urls.values());
  }

  // Обходить увесь сайт і зберігає всі торенти в індекс (з можливістю продовження).
  async crawl({ refresh = false, delay = 500, maxListing = 2000, withMeta = true } = {}) {
    if (!this.index) throw new Error('indexFile is not set');
    let urls = await this.sitemapUrls();
    this.log('sitemap: ' + urls.length + ' pages');
    if (!urls.length) urls = await this.listingUrls(maxListing);

    let done = 0;
    let torrents = 0;
    for (const url of urls) {
      const id = parse.newsId(url);
      done++;
      if (!refresh && id && this.index.pages[id]) continue;
      try {
        const page = parse.parsePage(await this.text(url), url, this.host);
        this.index.pages[page.id || url] = { ...page, ts: Date.now() };
        torrents += page.torrents.length;
        if (withMeta) {
          for (const t of page.torrents) {
            try { await this.torrentMeta(t.url); } catch (e) { this.log('torrent ' + t.url + ': ' + e.message); }
          }
        }
      } catch (e) {
        this.log('page ' + url + ': ' + e.message);
      }
      if (done % 20 === 0) {
        this.saveIndex();
        this.log('crawl ' + done + '/' + urls.length + ', torrents: ' + torrents);
      }
      await sleep(delay);
    }
    this.saveIndex();
    return { pages: Object.keys(this.index.pages).length, torrents: Object.values(this.index.pages).reduce((s, p) => s + (p.torrents || []).length, 0) };
  }
}

module.exports = { UAKino, mapLimit };
