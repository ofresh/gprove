'use strict';

// Збирає Cloudflare Worker в один файл worker/dist/worker.mjs (його можна просто
// вставити в редактор на dash.cloudflare.com). Запуск: node worker/build.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const entry = 'worker/src.js';
const modules = new Map();

function resolve(from, spec) {
  let p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  if (!p.endsWith('.js')) p += '.js';
  return p;
}

function collect(id) {
  if (modules.has(id)) return;
  const code = fs.readFileSync(path.join(root, id), 'utf8');
  const deps = {};
  modules.set(id, { code, deps });
  const re = /require\((['"])(\.{1,2}\/[^'"]+)\1\)/g;
  let m;
  while ((m = re.exec(code))) {
    const dep = resolve(id, m[2]);
    deps[m[2]] = dep;
    collect(dep);
  }
}

collect(entry);

const plugin = fs.readFileSync(path.join(root, 'plugin', 'uakino.js'), 'utf8');

let out = '// Згенеровано worker/build.js з lampa-uakino — не редагуйте вручну.\n';
out += '// UAKino → Lampa: Jackett-сумісний парсер торентів uakino.best для Cloudflare Workers.\n\n';
out += 'const __PLUGIN_SOURCE__ = ' + JSON.stringify(plugin) + ';\n\n';
out += 'const __modules = {\n';
for (const [id, { code, deps }] of modules) {
  out += '  ' + JSON.stringify(id) + ': [' + JSON.stringify(deps) + ', function (module, exports, require) {\n' + code + '\n  }],\n';
}
out += '};\n\n';
out += `const __cache = {};
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

export default __load(${JSON.stringify(entry)});
`;

const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'worker.mjs'), out);
console.log('worker/dist/worker.mjs: ' + modules.size + ' modules, ' + Buffer.byteLength(out) + ' bytes');
