'use strict';

const crypto = require('crypto');

// Мінімальний bencode-декодер. Рядки повертаються як Buffer,
// для словника "info" запам'ятовуються межі в байтах, щоб порахувати infohash.
function decode(buf) {
  let pos = 0;
  let infoRange = null;

  function readInt(end) {
    const n = Number(buf.toString('ascii', pos, end));
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
        const key = next(depth + 1).toString('utf8');
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
  return Buffer.isBuffer(v) ? v.toString('utf8') : (v == null ? '' : String(v));
}

// Розбирає .torrent і повертає назву, розмір, infohash, трекери та magnet.
function parseTorrent(buf) {
  if (!Buffer.isBuffer(buf) || buf[0] !== 0x64) throw new Error('not a torrent file');
  const { value, infoRange } = decode(buf);
  if (!value.info || !infoRange) throw new Error('torrent has no info dictionary');

  const info = value.info;
  const infoHash = crypto.createHash('sha1').update(buf.subarray(infoRange[0], infoRange[1])).digest('hex');
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

// Кодувальник потрібен лише для тестів (генерація .torrent-фікстур).
function encode(v) {
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(v.length + ':'), v]);
  if (typeof v === 'string') return encode(Buffer.from(v, 'utf8'));
  if (typeof v === 'number') return Buffer.from('i' + Math.trunc(v) + 'e');
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('l'), ...v.map(encode), Buffer.from('e')]);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return Buffer.concat([Buffer.from('d'), ...keys.map((k) => Buffer.concat([encode(k), encode(v[k])])), Buffer.from('e')]);
  }
  throw new Error('bencode: cannot encode ' + typeof v);
}

module.exports = { decode, encode, parseTorrent };
