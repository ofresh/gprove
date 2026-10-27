'use strict';

// Онлайн-перегляд з uakino (як online_mod): плейлисти серій/озвучок і прямі посилання
// на відео з плеєрів ashdi (Playerjs). Код не залежить від Node — працює і в Workers.

const parse = require('./parse');

// Плеєри, які дозволено відкривати (захист від запитів на довільні адреси).
const PLAYER_HOSTS = /(^|\.)(ashdi\.vip|tortuga\.(wtf|tw)|uakino\.[a-z]+)$/i;

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? parse.decodeEntities(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]) : null;
}

function absolute(url, host) {
  if (!url) return '';
  url = url.trim();
  if (url.indexOf('//') === 0) return 'https:' + url;
  if (/^https?:\/\//i.test(url)) return url;
  return host.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

function seasonOf(s) {
  const m = String(s || '').match(/сезон\s*(\d+)|(\d+)\s*сезон|season\s*(\d+)/i);
  return m ? Number(m[1] || m[2] || m[3]) : null;
}

function episodeOf(s) {
  const m = String(s || '').match(/(\d+)\s*(?:сері|серия|епізод|episode)|(?:сері[яї]|серия|епізод|episode)\s*(\d+)|^\s*(\d+)\b/i);
  return m ? Number(m[1] || m[2] || m[3]) : null;
}

// Блок плейлиста (серіали) та iframe-плеєри (фільми) на сторінці матеріалу.
function parsePlayers(html, host) {
  let playlist = null;
  const ajax = html.match(/<div\b[^>]*class=["'][^"']*playlists-ajax[^"']*["'][^>]*>/i);
  if (ajax) {
    const newsId = attr(ajax[0], 'data-news_id');
    if (newsId) playlist = { newsId, xfield: attr(ajax[0], 'data-xfname') || 'playlist' };
  }
  const iframes = [];
  const re = /<iframe\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = absolute(attr(m[0], 'src') || attr(m[0], 'data-src') || '', host);
    if (!src || iframes.indexOf(src) >= 0) continue;
    try {
      const h = new URL(src).hostname;
      if (!PLAYER_HOSTS.test(h) && h !== new URL(host).hostname) continue;
    } catch (e) { continue; }
    if (/youtube|trailer/i.test(src)) continue;
    iframes.push(src);
  }
  return { playlist, iframes };
}

// Відповідь /engine/ajax/playlists.php: списки (озвучки/сезони) і серії з data-file.
function parsePlaylist(html, host) {
  const labels = {};
  const episodes = [];
  const re = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html))) {
    const open = '<li' + m[1] + '>';
    const file = attr(open, 'data-file');
    const id = attr(open, 'data-id');
    const text = parse.stripTags(m[2]);
    if (file) episodes.push({ id: id || '', voice: attr(open, 'data-voice') || '', title: text, file: absolute(file, host) });
    else if (id != null) labels[id] = text;
  }
  return episodes.map((ep) => {
    const parts = ep.id ? ep.id.split('_') : [];
    const names = [];
    for (let i = 1; i <= parts.length; i++) {
      const label = labels[parts.slice(0, i).join('_')];
      if (label && names.indexOf(label) < 0) names.push(label);
    }
    if (ep.voice && names.indexOf(ep.voice) < 0) names.push(ep.voice);
    return { group: names.join(' / ') || 'UAKino', title: ep.title, file: ep.file };
  });
}

function jsString(html, key) {
  const re = new RegExp('[\\s,{]' + key + '\\s*:\\s*([\'"])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1');
  const m = html.match(re);
  if (!m) return null;
  return m[2].replace(/\\(.)/g, (s, c) => (c === 'n' ? '\n' : c));
}

// "[720p]url1,[1080p]url2" → { '720p': url1, '1080p': url2 }
function parseQualities(str) {
  const out = {};
  String(str || '').split(/,(?=\s*(?:\[|https?:|\/\/))/).forEach((part) => {
    const m = part.trim().match(/^\[([^\]]*)\](.+)$/);
    if (m) {
      m[2].split(' or ').forEach((u) => { if (!out[m[1]]) out[m[1]] = absolute(u.trim(), 'https://x'); });
    } else if (part.trim()) {
      out.auto = absolute(part.trim().split(' or ')[0], 'https://x');
    }
  });
  return out;
}

function parseSubtitles(str) {
  if (!str) return [];
  return String(str).split(/,(?=\s*\[)/).map((part) => {
    const m = part.trim().match(/^\[([^\]]*)\](.+)$/);
    return m ? { label: m[1], url: absolute(m[2].trim(), 'https://x') } : { label: 'Субтитри', url: absolute(part.trim(), 'https://x') };
  }).filter((s) => /^https?:/.test(s.url));
}

function toStream(file, subtitle) {
  const q = parseQualities(file);
  const keys = Object.keys(q);
  if (!keys.length) return null;
  const best = keys.slice().sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0))[0];
  return { url: q[best], quality: keys.length > 1 ? q : null, subtitles: parseSubtitles(subtitle) };
}

function flatten(nodes, path, out) {
  (nodes || []).forEach((n) => {
    if (Array.isArray(n.folder)) flatten(n.folder, path.concat(n.title || ''), out);
    else if (n.file) out.push({ path, title: n.title || '', file: n.file, subtitle: n.subtitle || '' });
  });
  return out;
}

// Сторінка плеєра (ashdi тощо): Playerjs({file: "...m3u8"}) або file: '[{"title":..,"folder":[..]}]'
function parsePlayerjs(html) {
  const file = jsString(html, 'file');
  if (!file) return null;
  const subtitle = jsString(html, 'subtitle') || '';
  const trimmed = file.trim();
  if (trimmed[0] === '[' && trimmed[1] !== ']' && /^\[\s*\{/.test(trimmed)) {
    let data;
    try { data = JSON.parse(trimmed); } catch (e) { return null; }
    return { folders: flatten(data, [], []) };
  }
  if (trimmed[0] === '#') return null; // зашифрований плеєр — не підтримується
  return { file: trimmed, subtitle };
}

class TinyCache {
  constructor(ttl) { this.ttl = ttl; this.map = new Map(); }
  async wrap(key, fn) {
    const e = this.map.get(key);
    if (e && Date.now() < e.exp) return e.v;
    const v = await fn();
    if (this.map.size > 500) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { v, exp: Date.now() + this.ttl });
    return v;
  }
}

// fetchText(url, { xhr, referer }) → Promise<string>; searchSite(query) → Promise<[{id,url,title}]>
function createOnline({ host, fetchText, searchSite }) {
  const cache = new TinyCache(20 * 60 * 1000);
  host = host.replace(/\/+$/, '');

  function checkUrl(url, players) {
    let u;
    try { u = new URL(url); } catch (e) { throw Object.assign(new Error('bad url'), { status: 400 }); }
    const own = u.hostname.replace(/^www\./, '') === new URL(host).hostname.replace(/^www\./, '');
    const ok = own || (players && PLAYER_HOSTS.test(u.hostname));
    if (!ok || !/^https?:$/.test(u.protocol)) throw Object.assign(new Error('url is not allowed'), { status: 403 });
    return u.toString();
  }

  async function findPages({ title = '', original = '', query = '' }) {
    const titles = [title, original, query].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    const found = new Map();
    let lastError = null;
    for (const q of titles) {
      try {
        for (const item of await searchSite(q)) {
          if (!found.has(item.id)) found.set(item.id, { ...item, score: parse.scoreTitle(item, titles), season: seasonOf(item.title) });
        }
      } catch (e) { lastError = e; }
    }
    if (!found.size && lastError) throw lastError;
    let list = Array.from(found.values()).filter((p) => p.score >= 40);
    const best = list.reduce((m, p) => Math.max(m, p.score), 0);
    // Лишаємо найкращі збіги (усі сезони одного серіалу мають однакову оцінку).
    list = list.filter((p) => p.score >= best - 20);
    list.sort((a, b) => b.score - a.score || (a.season || 0) - (b.season || 0));
    if (list.some((p) => p.season)) list.sort((a, b) => (a.season || 0) - (b.season || 0));
    return list.map(({ id, url, title: t, poster, season }) => ({ id, url, title: t, poster, season }));
  }

  async function stream(url, referer) {
    url = checkUrl(url, true);
    return cache.wrap('stream:' + url, async () => {
      const html = await fetchText(url, { referer: referer || host + '/' });
      const p = parsePlayerjs(html);
      if (!p) throw Object.assign(new Error('не вдалося знайти відео в плеєрі'), { status: 404 });
      if (p.folders) {
        return {
          items: p.folders.map((f) => ({
            group: f.path.filter((x) => !seasonOf(x)).join(' / ') || 'UAKino',
            season: seasonOf(f.path.join(' ')),
            title: f.title,
            episode: episodeOf(f.title),
            stream: toStream(f.file, f.subtitle),
          })).filter((i) => i.stream),
        };
      }
      const s = toStream(p.file, p.subtitle);
      if (!s) throw Object.assign(new Error('порожнє посилання на відео'), { status: 404 });
      return s;
    });
  }

  async function loadPage(url) {
    url = checkUrl(url, false);
    return cache.wrap('page:' + url, async () => {
      const html = await fetchText(url, {});
      const page = parse.parsePage(html, url, host);
      const season = seasonOf(page.title);
      const players = parsePlayers(html, host);
      let items = [];

      if (players.playlist) {
        try {
          const ajax = host + '/engine/ajax/playlists.php?news_id=' + encodeURIComponent(players.playlist.newsId) +
            '&xfield=' + encodeURIComponent(players.playlist.xfield) + '&time=' + Date.now();
          const text = await fetchText(ajax, { xhr: true, referer: url });
          let body = text;
          try {
            const data = JSON.parse(text);
            body = data && data.success !== false ? String(data.response || '') : '';
          } catch (e) { /* відповідь — сирий HTML */ }
          items = parsePlaylist(body, host)
            .filter((ep) => !/трейлер|trailer/i.test(ep.group + ' ' + ep.title))
            .map((ep) => ({ group: ep.group, season, title: ep.title, episode: episodeOf(ep.title), url: ep.file }));
        } catch (e) {
          if (!players.iframes.length) throw e;
        }
      }

      if (!items.length) {
        for (const src of players.iframes) {
          try {
            const s = await stream(src, url);
            if (s.items) items = items.concat(s.items.map((i) => ({ ...i, season: i.season || season })));
            else items.push({ group: 'UAKino', season, title: page.title, episode: null, stream: s });
          } catch (e) { /* пробуємо наступний плеєр */ }
        }
      }

      return { url, title: page.title, original: page.original, year: page.year, poster: page.poster, season, items };
    });
  }

  // Спільний обробник для /online/* (Node-сервер і Worker) — повертає об'єкт для JSON.
  async function route(pathname, params) {
    if (pathname === '/online/search') {
      return { pages: await findPages({ title: params.get('title') || '', original: params.get('original') || params.get('title_original') || '', query: params.get('query') || params.get('Query') || '' }) };
    }
    if (pathname === '/online/page') return loadPage(params.get('url') || '');
    if (pathname === '/online/stream') return stream(params.get('url') || '', params.get('referer') ? checkUrl(params.get('referer'), false) : '');
    return null;
  }

  return { findPages, loadPage, stream, route };
}

module.exports = { createOnline, parsePlayers, parsePlaylist, parsePlayerjs, parseQualities, parseSubtitles, toStream, seasonOf, episodeOf };
