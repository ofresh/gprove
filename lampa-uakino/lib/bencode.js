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
