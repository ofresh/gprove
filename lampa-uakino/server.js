#!/usr/bin/env node
'use strict';

// Парсер торентів uakino.best з Jackett-сумісним API для Lampa.
//
//   node server.js           — запустити сервер (порт 9118)
//   node server.js crawl     — обійти весь сайт і зберегти індекс усіх торентів
//   node server.js search "Високий потенціал"   — пошук у консолі

const http = require('http');
const path = require('path');
const fs = require('fs');
const { UAKino } = require('./lib/uakino');

const env = process.env;
const config = {
  port: Number(env.PORT || 9118),
  bind: env.BIND || '0.0.0.0',
  host: env.UAKINO_HOST || 'https://uakino.best',
  apikey: env.UAKINO_APIKEY || '',
  publicUrl: (env.UAKINO_PUBLIC_URL || '').replace(/\/+$/, ''),
  cookie: env.UAKINO_COOKIE || '',
  ua: env.UAKINO_UA || '',
  indexFile: env.UAKINO_INDEX === '0' ? '' : (env.UAKINO_INDEX || path.join(__dirname, 'data', 'index.json')),
  scrapePeers: env.UAKINO_SCRAPE !== '0',
  maxPages: Number(env.UAKINO_MAX_PAGES || 6),
};

const log = (msg) => console.log(new Date().toISOString() + ' ' + msg);

function createClient(opts = {}) {
  return new UAKino({
    host: config.host,
    cookie: config.cookie,
    ua: config.ua,
    indexFile: config.indexFile,
    scrapePeers: config.scrapePeers,
    maxPages: config.maxPages,
    log,
    ...opts,
  });
}

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

function send(res, status, body, type) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type || (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Length': isBuf ? data.length : Buffer.byteLength(data),
  });
  res.end(data);
}

function publicBase(req) {
  return config.publicUrl || 'http://' + (req.headers.host || '127.0.0.1:' + config.port);
}

function createServer(client) {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });

    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams;

    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return send(res, 200, {
          name: 'uakino-torrents',
          host: client.host,
          indexed: client.index ? Object.keys(client.index.pages).length : 0,
          plugin: publicBase(req) + '/uakino.js',
          jackett: publicBase(req) + '/api/v2.0/indexers/uakino/results?Query=...',
        });
      }

      // Плагін для Lampa з уже підставленою адресою цього сервера.
      if (url.pathname === '/uakino.js' || url.pathname === '/plugin.js') {
        const code = fs.readFileSync(path.join(__dirname, 'plugin', 'uakino.js'), 'utf8')
          .replace("'__UAKINO_SERVER__'", JSON.stringify(publicBase(req)));
        return send(res, 200, code, 'application/javascript; charset=utf-8');
      }

      // Jackett API: /api/v2.0/indexers/{all|uakino|status:healthy}/results
      if (/^\/api\/v2\.0\/indexers\/[^/]+\/results\/?$/.test(url.pathname)) {
        if (config.apikey && q.get('apikey') !== config.apikey) return send(res, 401, { error: 'bad apikey' });
        const params = {
          query: q.get('Query') || q.get('query') || '',
          title: q.get('title') || '',
          original: q.get('title_original') || '',
          year: q.get('year') || null,
        };
        log('jackett ' + JSON.stringify(params));
        const results = await client.find(params);
        const base = publicBase(req);
        return send(res, 200, {
          Results: results.map((r) => toJackett(r, base)),
          Indexers: [{ ID: 'uakino', Name: 'UAKino', Status: 2, Results: results.length, Error: null }],
        });
      }

      // Віддає .torrent з uakino (для TorrServer, якщо magnet недоступний).
      if (url.pathname === '/download') {
        const target = q.get('url') || '';
        let t;
        try { t = new URL(target); } catch (e) { return send(res, 400, { error: 'bad url' }); }
        const allowed = new URL(client.host);
        if (t.hostname.replace(/^www\./, '') !== allowed.hostname.replace(/^www\./, '') || !/^\/torrent\/\d+\//.test(t.pathname)) {
          return send(res, 403, { error: 'only ' + allowed.hostname + '/torrent/* is allowed' });
        }
        const file = await client.torrentFile(t.toString());
        const name = decodeURIComponent(t.pathname.split('/').pop());
        res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(name));
        return send(res, 200, file, 'application/x-bittorrent');
      }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      log('error ' + req.url + ': ' + e.message);
      return send(res, 502, { error: e.message });
    }
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'crawl') {
    const client = createClient();
    const stat = await client.crawl({
      refresh: args.includes('--refresh'),
      withMeta: !args.includes('--no-meta'),
      delay: Number(env.UAKINO_DELAY || 500),
    });
    log('crawl finished: ' + stat.pages + ' pages, ' + stat.torrents + ' torrents → ' + config.indexFile);
    return;
  }

  if (cmd === 'search') {
    const client = createClient();
    const results = await client.find({ query: args.join(' ') });
    console.log(JSON.stringify(results.map((r) => toJackett(r, 'http://127.0.0.1:' + config.port)), null, 2));
    return;
  }

  if (cmd === 'export') {
    // Вивантаження індексу у простий JSON-список усіх торентів.
    const client = createClient();
    const list = [];
    for (const page of Object.values(client.index ? client.index.pages : {})) {
      for (const t of page.torrents || []) {
        list.push(toJackett({ page, torrent: t, meta: client.index.torrents[t.url] || null, peers: null }, config.publicUrl || 'http://127.0.0.1:' + config.port));
      }
    }
    const out = args[0] || path.join(__dirname, 'data', 'torrents.json');
    fs.writeFileSync(out, JSON.stringify(list, null, 2));
    log('exported ' + list.length + ' torrents → ' + out);
    return;
  }

  const client = createClient();
  createServer(client).listen(config.port, config.bind, () => {
    log('uakino parser: http://' + config.bind + ':' + config.port + ' → ' + client.host);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createServer, createClient, toJackett, config };
