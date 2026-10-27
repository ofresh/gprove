'use strict';

// Тести без залежностей: node test/test.js
// Імітує uakino.best локальним HTTP-сервером із фікстурами.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const parse = require('../lib/parse');
const { encode, parseTorrent } = require('../lib/bencode');

const fixtures = path.join(__dirname, 'fixtures');
const read = (f) => fs.readFileSync(path.join(fixtures, f), 'utf8');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function makeTorrent(name, sizes) {
  const info = {
    name,
    'piece length': 262144,
    pieces: Buffer.alloc(20),
    files: sizes.map((length, i) => ({ length, path: ['Серія ' + (i + 1) + '.mkv'] })),
  };
  return {
    buf: encode({ announce: 'udp://tracker.example:80/announce', 'announce-list': [['udp://tracker.example:80/announce'], ['http://bt.example/announce']], 'creation date': 1730000000, info }),
    hash: crypto.createHash('sha1').update(encode(info)).digest('hex'),
  };
}

const torrents = {
  '703632': makeTorrent('Високий потенціал (Сезон 1)', [1000, 2000, 3000]),
  '703633': makeTorrent('High.Potential.S01.1080p', [5000000]),
  '703634': makeTorrent('High.Potential.S01.720p', [2500000]),
};

function startUpstream() {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    if (p === '/index.php' && u.searchParams.get('story')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(u.searchParams.get('story').indexOf('потенціал') >= 0 || u.searchParams.get('story') === 'High Potential' ? read('search.html') : '<html></html>');
    }
    if (p === '/seriesss/drama_series/25998-vysokyy-potencial-1-sezon.html') return res.end(read('page.html'));
    if (p === '/seriesss/drama_series/27001-vysokyy-potencial-2-sezon.html') return res.end('<h1>Високий потенціал (Сезон 2)</h1><p>Торентів немає</p>');
    if (p === '/filmy/genre_comedy/11111-insha-komediia.html') return res.end('<h1>Зовсім інша комедія</h1><a href="/torrent/1/Інша.torrent">t</a>');
    if (p === '/sitemap.xml') return res.end('<sitemapindex><sitemap><loc>' + base + '/sitemap-news.xml</loc></sitemap></sitemapindex>');
    if (p === '/sitemap-news.xml') return res.end('<urlset><url><loc>' + base + '/seriesss/drama_series/25998-vysokyy-potencial-1-sezon.html</loc></url><url><loc>' + base + '/filmy/genre_comedy/11111-insha-komediia.html</loc></url></urlset>');
    const t = p.match(/^\/torrent\/(\d+)\//);
    if (t && torrents[t[1]]) {
      res.setHeader('Content-Type', 'application/x-bittorrent');
      return res.end(torrents[t[1]].buf);
    }
    if (t) { res.statusCode = 404; return res.end('no'); }
    res.statusCode = 404;
    res.end('not found');
  });
  let base;
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    base = 'http://127.0.0.1:' + server.address().port;
    resolve({ server, base, requests });
  }));
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
}

async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

// ---------------- parse ----------------

test('parseList: картки пошуку, відносні посилання, сутності, чужі домени', () => {
  const host = 'https://uakino.best';
  const list = parse.parseList(read('search.html'), host);
  assert.deepStrictEqual(list.map((i) => i.id), ['25998', '27001', '11111']);
  assert.strictEqual(list[0].title, 'Високий потенціал (Сезон 1)');
  assert.strictEqual(list[0].poster, 'https://uakino.best/uploads/posts/hp.jpg');
  assert.strictEqual(list[1].title, 'Високий потенціал & (Сезон 2)');
  assert.strictEqual(list[1].url, 'https://uakino.best/seriesss/drama_series/27001-vysokyy-potencial-2-sezon.html');
  assert.strictEqual(list[1].poster, 'https://uakino.best/uploads/posts/hp2.jpg');
});

test('parsePage: назва, оригінал, рік, усі торенти без дублів', () => {
  const host = 'https://uakino.best';
  const url = host + '/seriesss/drama_series/25998-vysokyy-potencial-1-sezon.html';
  const page = parse.parsePage(read('page.html'), url, host);
  assert.strictEqual(page.id, '25998');
  assert.strictEqual(page.title, 'Високий потенціал (Сезон 1)');
  assert.strictEqual(page.original, 'High Potential');
  assert.strictEqual(page.year, 2024);
  assert.strictEqual(page.poster, 'https://uakino.best/uploads/posts/hp-big.jpg');
  assert.deepStrictEqual(page.torrents.map((t) => t.id), ['703632', '703633', '703634']);
  assert.strictEqual(page.torrents[0].name, 'Високий потенціал (Сезон 1)');
  assert.strictEqual(page.torrents[0].url, 'https://uakino.best/torrent/703632/' + encodeURIComponent('Високий потенціал (Сезон 1) .torrent'));
  // Пробіли й кирилиця в сирому href теж кодуються.
  assert.strictEqual(page.torrents[1].url, 'https://uakino.best/torrent/703633/' + encodeURIComponent('Високий потенціал (Сезон 1) 1080p.torrent'));
  assert.strictEqual(page.torrents[1].name, 'Високий потенціал (Сезон 1) 1080p');
});

test('parsePage: посилання з прикладу користувача', () => {
  const href = 'https://uakino.best/torrent/703632/Високий%20потенціал%20(Сезон%201)%20.torrent';
  const page = parse.parsePage('<a href="' + href + '">Скачати</a>', 'https://uakino.best/x/1-a.html', 'https://uakino.best');
  assert.strictEqual(page.torrents.length, 1);
  assert.strictEqual(page.torrents[0].id, '703632');
  assert.strictEqual(decodeURIComponent(page.torrents[0].url), decodeURIComponent(href));
});

test('normalizeTitle', () => {
  assert.strictEqual(parse.normalizeTitle('Високий  Потенціал: (Сезон 1)'), 'високий потенціал сезон 1');
  assert.strictEqual(parse.normalizeTitle('Ёлки'), 'елки');
});

// ---------------- bencode ----------------

test('parseTorrent: infohash, розмір, трекери, magnet', () => {
  const t = torrents['703632'];
  const info = parseTorrent(t.buf);
  assert.strictEqual(info.infoHash, t.hash);
  assert.strictEqual(info.name, 'Високий потенціал (Сезон 1)');
  assert.strictEqual(info.size, 6000);
  assert.strictEqual(info.files.length, 3);
  assert.deepStrictEqual(info.trackers, ['udp://tracker.example:80/announce', 'http://bt.example/announce']);
  assert.ok(info.magnet.startsWith('magnet:?xt=urn:btih:' + t.hash + '&dn='));
  assert.throws(() => parseTorrent(Buffer.from('<html>Cloudflare</html>')));
});

// ---------------- server ----------------

test('сервер: Jackett API, magnet, /download, плагін, CORS', async () => {
  const up = await startUpstream();
  const indexFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uakino-')), 'index.json');
  const { createServer, toJackett } = require('../server');
  const { UAKino } = require('../lib/uakino');
  const client = new UAKino({ host: up.base, indexFile, scrapePeers: false });
  const srv = createServer(client);
  const base = await listen(srv);
  try {
    const q = '/api/v2.0/indexers/all/results?apikey=&Query=' + encodeURIComponent('Високий потенціал') +
      '&title=' + encodeURIComponent('Високий потенціал') + '&title_original=' + encodeURIComponent('High Potential') + '&year=2024&is_serial=2';
    const { status, body, headers } = await getJson(base + q);
    assert.strictEqual(status, 200);
    assert.strictEqual(headers.get('access-control-allow-origin'), '*');
    const r = body.Results;
    assert.strictEqual(r.length, 3, JSON.stringify(r, null, 1));
    assert.ok(!r.some((x) => /комедія/.test(x.Title)), 'нерелевантні результати відфільтровано');
    assert.strictEqual(r[0].Title, 'Високий потенціал (Сезон 1) / High Potential (2024) [Скачати торент]');
    assert.strictEqual(r[0].Size, 6000);
    assert.strictEqual(r[0].InfoHash, torrents['703632'].hash);
    assert.strictEqual(r[0].Category[0], 5000);
    assert.strictEqual(r[0].Details, up.base + '/seriesss/drama_series/25998-vysokyy-potencial-1-sezon.html');
    assert.strictEqual(r[0].PublishDate, new Date(1730000000 * 1000).toISOString());
    assert.ok(r[0].MagnetUri.indexOf(torrents['703632'].hash) > 0);
    assert.strictEqual(r[1].InfoHash, torrents['703633'].hash);
    assert.strictEqual(r[2].InfoHash, torrents['703634'].hash);

    // Повторний запит іде з кешу.
    const before = up.requests.length;
    await getJson(base + q);
    assert.strictEqual(up.requests.length, before);

    // Індекс збережено на диск.
    const saved = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    assert.ok(saved.pages['25998']);
    assert.ok(saved.torrents[r[0].Guid]);

    // .torrent через парсер
    const dl = await fetch(r[0].Link);
    assert.strictEqual(dl.status, 200);
    assert.strictEqual(dl.headers.get('content-type'), 'application/x-bittorrent');
    assert.ok(Buffer.from(await dl.arrayBuffer()).equals(torrents['703632'].buf));

    const bad = await fetch(base + '/download?url=' + encodeURIComponent('http://evil.example/torrent/1/x.torrent'));
    assert.strictEqual(bad.status, 403);
    const bad2 = await fetch(base + '/download?url=' + encodeURIComponent(up.base + '/index.php'));
    assert.strictEqual(bad2.status, 403);

    // Плагін з підставленою адресою сервера.
    const js = await (await fetch(base + '/uakino.js')).text();
    assert.ok(js.indexOf("var BUILT_IN_SERVER = \"" + base + "\"") >= 0);

    const opt = await fetch(base + '/api/v2.0/indexers/all/results', { method: 'OPTIONS' });
    assert.strictEqual(opt.status, 204);

    // Нічого не знайдено → порожній список, а не помилка.
    const empty = await getJson(base + '/api/v2.0/indexers/all/results?Query=zzzz');
    assert.strictEqual(empty.status, 200);
    assert.deepStrictEqual(empty.body.Results, []);

    assert.ok(typeof toJackett === 'function');
  } finally {
    srv.close();
    up.server.close();
  }
});

test('сервер: apikey', async () => {
  const { createServer, config } = require('../server');
  const { UAKino } = require('../lib/uakino');
  config.apikey = 'secret';
  const srv = createServer(new UAKino({ host: 'http://127.0.0.1:1', scrapePeers: false }));
  const base = await listen(srv);
  try {
    assert.strictEqual((await fetch(base + '/api/v2.0/indexers/all/results?Query=x')).status, 401);
  } finally {
    config.apikey = '';
    srv.close();
  }
});

test('crawl: sitemap → індекс усіх торентів, потім пошук з індексу', async () => {
  const up = await startUpstream();
  const indexFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uakino-')), 'index.json');
  const { UAKino } = require('../lib/uakino');
  try {
    const client = new UAKino({ host: up.base, indexFile, scrapePeers: false });
    const stat = await client.crawl({ delay: 0 });
    assert.deepStrictEqual(stat, { pages: 2, torrents: 4 });

    // Новий клієнт читає індекс; пошук на сайті нічого не дає, але індекс знаходить.
    const fresh = new UAKino({ host: up.base, indexFile, scrapePeers: false });
    const results = await fresh.find({ query: 'Зовсім інша комедія' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].page.id, '11111');
    assert.strictEqual(results[0].meta, null); // .torrent віддає 404 — запис лишається без magnet
  } finally {
    up.server.close();
  }
});

// ---------------- plugin (Playwright, якщо доступний) ----------------

test('плагін Lampa: кнопка, пошук, вибір торента → Lampa.Torrent.start', async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('    (пропущено: немає playwright)'); return; }

  const up = await startUpstream();
  const { createServer } = require('../server');
  const { UAKino } = require('../lib/uakino');
  const srv = createServer(new UAKino({ host: up.base, scrapePeers: false, indexFile: '' }));
  const base = await listen(srv);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/health');
    await page.setContent('<div id="full"><div class="full-start-new__buttons"><div class="full-start__button selector view--torrent">Торренти</div></div></div>');
    await page.addScriptTag({ path: path.join(__dirname, 'lampa-stub.js') });
    await page.addScriptTag({ url: base + '/uakino.js' });

    await page.evaluate(() => window.__fireFull({ title: 'Високий потенціал', original_name: 'High Potential', name: 'Високий потенціал', first_air_date: '2024-09-17' }));
    const btn = await page.$$eval('.view--uakino', (els) => els.map((e) => e.previousElementSibling.className));
    assert.deepStrictEqual(btn, ['full-start__button selector view--torrent']);

    await page.evaluate(() => window.__enter('.view--uakino'));
    await page.waitForFunction(() => window.__select, null, { timeout: 15000 });
    const sel = await page.evaluate(() => ({ title: window.__select.title, items: window.__select.items.map((i) => [i.title, i.subtitle]) }));
    assert.strictEqual(sel.items.length, 3);
    assert.strictEqual(sel.items[0][0], 'Високий потенціал (Сезон 1) / High Potential (2024) [Скачати торент]');
    assert.ok(/5\.86 KB • 3 файл\. • ▲ 0 • ▼ 0/.test(sel.items[0][1]), sel.items[0][1]);

    await page.evaluate(() => window.__select.onSelect(window.__select.items[1]));
    const started = await page.evaluate(() => window.__started);
    assert.strictEqual(started.element.InfoHash, torrents['703633'].hash);
    assert.strictEqual(started.movie.original_name, 'High Potential');
    assert.deepStrictEqual(errors, []);

    // Settings зареєстровано
    const settings = await page.evaluate(() => window.__settings);
    assert.deepStrictEqual(settings, ['uakino', 'uakino_server', 'uakino_apikey']);
  } finally {
    await browser.close();
    srv.close();
    up.server.close();
  }
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('  ✓ ' + t.name);
    } catch (e) {
      failed++;
      console.log('  ✗ ' + t.name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 6).join('\n    '));
    }
  }
  console.log(failed ? '\n' + failed + ' failed' : '\nall ' + tests.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
