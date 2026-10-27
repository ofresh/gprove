'use strict';

// Запит кількості сідів/пірів у трекерів (UDP — BEP 15, HTTP — /scrape).

const dgram = require('dgram');
const crypto = require('crypto');
const { decode } = require('./bencode');

function udpScrape(tracker, infoHash, timeout) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(tracker); } catch (e) { return resolve(null); }
    const socket = dgram.createSocket(u.hostname.indexOf(':') >= 0 ? 'udp6' : 'udp4');
    const port = Number(u.port) || 80;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch (e) { /* вже закрито */ }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeout);
    const tx = crypto.randomBytes(4);

    socket.on('error', () => finish(null));
    socket.on('message', (msg) => {
      if (msg.length < 8 || !msg.subarray(4, 8).equals(tx)) return;
      const action = msg.readUInt32BE(0);
      if (action === 0 && msg.length >= 16) {
        const req = Buffer.alloc(36);
        msg.copy(req, 0, 8, 16); // connection_id
        req.writeUInt32BE(2, 8); // scrape
        tx.copy(req, 12);
        Buffer.from(infoHash, 'hex').copy(req, 16);
        socket.send(req, port, u.hostname);
      } else if (action === 2 && msg.length >= 20) {
        finish({ seeders: msg.readUInt32BE(8), completed: msg.readUInt32BE(12), leechers: msg.readUInt32BE(16) });
      } else {
        finish(null);
      }
    });

    const connect = Buffer.alloc(16);
    connect.writeUInt32BE(0x417, 0);
    connect.writeUInt32BE(0x27101980, 4);
    connect.writeUInt32BE(0, 8);
    tx.copy(connect, 12);
    socket.send(connect, port, u.hostname, (err) => { if (err) finish(null); });
  });
}

async function httpScrape(tracker, infoHash, timeout) {
  if (!/\/announce(\.php)?(\?|$)/.test(tracker)) return null;
  const url = tracker.replace(/\/announce(\.php)?/, '/scrape$1');
  const hash = Buffer.from(infoHash, 'hex').toString('latin1').split('')
    .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  try {
    const res = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'info_hash=' + hash, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const { value } = decode(Buffer.from(await res.arrayBuffer()));
    const files = value && value.files;
    if (!files) return null;
    const stat = Object.values(files)[0];
    if (!stat) return null;
    return { seeders: stat.complete || 0, leechers: stat.incomplete || 0, completed: stat.downloaded || 0 };
  } catch (e) {
    return null;
  }
}

// Опитує до `limit` трекерів паралельно й бере найбільші значення.
async function scrape(trackers, infoHash, { timeout = 3000, limit = 5 } = {}) {
  const list = (trackers || []).filter((t) => /^(udp|https?):\/\//i.test(t)).slice(0, limit);
  const stats = await Promise.all(list.map((t) => (t.startsWith('udp:') ? udpScrape(t, infoHash, timeout) : httpScrape(t, infoHash, timeout))));
  const ok = stats.filter(Boolean);
  if (!ok.length) return null;
  return {
    seeders: Math.max(...ok.map((s) => s.seeders)),
    leechers: Math.max(...ok.map((s) => s.leechers)),
  };
}

module.exports = { scrape };
