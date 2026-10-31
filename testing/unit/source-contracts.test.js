import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const walk = (dir, filter) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : walk(full, filter);
    return filter(e.name) ? [full] : [];
  });

// 1. Every module specifier in the app must resolve to a real file. After a
//    refactor this is the cheapest proof that nothing was orphaned.
test('all relative imports resolve to an existing file', () => {
  const files = [
    ...walk(path.join(root, 'server', 'src'), (n) => n.endsWith('.js')),
    ...walk(path.join(root, 'client', 'src'), (n) => /\.(js|jsx)$/.test(n)),
    ...walk(path.join(root, 'shared'), (n) => n.endsWith('.js')),
  ];
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = [
      ...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g),
      ...source.matchAll(/import\(['"](\.[^'"]+)['"]\)/g),
    ].map((m) => m[1]);
    for (const spec of specifiers) {
      const base = path.resolve(path.dirname(file), spec);
      const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
      if (!candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile())) {
        missing.push(`${path.relative(root, file)} -> ${spec}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Unresolved imports:\n${missing.join('\n')}`);
});

// 2. The browser must not call an endpoint the server never registers. Both
//    sides are parsed, so renaming or dropping a route fails this test.
//    Matching is on path shape only (params and query strings are wildcarded);
//    the HTTP verbs are exercised by the live e2e suite.
test('every client API path is registered on the server', () => {
  const client = read('client', 'src', 'api', 'client.js');
  const routes = `${read('server', 'src', 'routes.js')}${read('server', 'src', 'app.js')}`;

  const clientPaths = requestLiterals(client).filter(
    (p) => !p.startsWith('/auth/login') && !p.startsWith('/setup'),
  );
  const registered = [...routes.matchAll(/\b(?:app|router)\.(?:get|post|patch|put|delete)\(\s*['"`]([^'"`]+)/g)]
    .map((m) => pathSegments(m[1]))
    .map((segs) => (segs[0] === 'api' && segs[1] === 'v1' ? segs.slice(2) : segs));

  // Guards the test itself: if either parser stops matching the source style,
  // an empty list would look like a pass.
  assert.ok(clientPaths.length > 40, `only parsed ${clientPaths.length} client calls — the api client changed shape`);
  assert.ok(registered.length > 40, `only parsed ${registered.length} server routes — the router changed shape`);

  const unmatched = [];
  for (const raw of clientPaths) {
    const wanted = pathSegments(raw);
    const hit = registered.some(
      (have) => have.length === wanted.length && wanted.every((seg, i) =>
        seg === '*' || have[i] === '*' || have[i] === seg),
    );
    if (!hit) unmatched.push(`/${wanted.join('/')}`);
  }
  assert.deepEqual(unmatched, [], `Client calls with no registered route:\n${unmatched.join('\n')}`);
});

// 3. Every field type the server accepts must reach a rendering branch in the
//    shared form. "text" is the intentional fallthrough (plain <Input>), so it
//    is covered by the default-control check instead of an explicit branch.
test('DynamicForm renders a control for every server field type', () => {
  const { FIELD_TYPES, DEFAULT_TYPE } = fieldTypesFromSource();
  const form = read('client', 'src', 'components', 'DynamicForm.jsx');
  assert.ok(
    /return \(\s*<Input/.test(form) || /\n\t\treturn \(\n\t\t\t<Input/.test(form),
    'DynamicForm lost its default <Input> fallback: an unmapped type would render nothing',
  );
  const missing = [...FIELD_TYPES]
    .filter((type) => type !== DEFAULT_TYPE)
    .filter((type) => !form.includes(`"${type}"`) && !form.includes(`'${type}'`));
  assert.deepEqual(missing, [], `Types with no branch in DynamicForm: ${missing.join(', ')}`);
});

// 4. The admin field list labels every supported type; an unmapped type would
//    show its raw key in the Field Definitions table.
test('Field Definitions page labels every field type', () => {
  const source = read('client', 'src', 'pages', 'Fields.jsx');
  const list = source.match(/const types = \[([\s\S]*?)\];/);
  assert.ok(list, 'Fields.jsx no longer has a `const types = [...]` label list');
  const labelled = [...list[1].matchAll(/\[\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1]);
  const { FIELD_TYPES } = fieldTypesFromSource();
  const missing = [...FIELD_TYPES].filter((type) => !labelled.includes(type));
  assert.deepEqual(missing, [], `Fields.jsx has no label for: ${missing.join(', ')}`);
  assert.deepEqual(
    [...labelled].sort(),
    [...FIELD_TYPES].sort(),
    'Fields.jsx type list and the server FIELD_TYPES vocabulary have drifted apart',
  );
});

// 5. The SMTP API must expose only the passwordConfigured flag. This is a
//    security contract, not a style preference.
test('SMTP settings never return the stored password', () => {
  const service = read('server', 'src', 'modules', 'smtp', 'service.js');
  const controller = read('server', 'src', 'modules', 'smtp', 'controller.js');
  assert.match(`${service}${controller}`, /passwordConfigured/);
  assert.doesNotMatch(service, /return\s*\{[^}]*\bpassword\s*[:,]/s, 'SMTP service must not return the raw password');
});

// Reads the server type vocabulary without importing it, so this file stays
// synchronous. DEFAULT_TYPE documents the fallthrough branch in DynamicForm.
function fieldTypesFromSource() {
  const source = read('server', 'src', 'utils', 'validation.js');
  const match = source.match(/FIELD_TYPES\s*=\s*new Set\(\[([^\]]+)\]/);
  assert.ok(match, 'server validation.js no longer exports a FIELD_TYPES set');
  return {
    FIELD_TYPES: new Set(match[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)),
    DEFAULT_TYPE: 'text',
  };
}

// Pulls every request('…' | `…`) first argument out of the api client. A
// scanner rather than a regex, because these templates nest backticks inside
// ${…} (e.g. `/email/rules${assetTypeId ? `?assetTypeId=${assetTypeId}` : ''}`)
// and a regex truncates them. Each placeholder becomes \u0000.
function requestLiterals(source) {
  const found = [];
  const opener = /request\(\s*([`'"])/g;
  for (let m = opener.exec(source); m; m = opener.exec(source)) {
    const quote = m[1];
    let lit = '';
    for (let i = m.index + m[0].length; i < source.length; i++) {
      const ch = source[i];
      if (quote === '`' ? ch === '`' : ch === quote) break;
      if (ch === '\\') {
        lit += source[++i] ?? '';
        continue;
      }
      if (quote === '`' && ch === '$' && source[i + 1] === '{') {
        i++; // step onto '{'; the depth counter below starts at the body
        let depth = 1;
        while (depth > 0 && i + 1 < source.length) {
          const next = source[++i];
          if (next === '{') depth++;
          else if (next === '}') depth--;
        }
        lit += '\u0000';
        continue;
      }
      lit += ch;
    }
    found.push(lit);
  }
  return found;
}

// '/asset-types/\u0000/form?a=b' -> ['asset-types', '*', 'form'].
// A placeholder that fills its segment is a path parameter (*); one glued to
// the end of a word is a query string, so only the word is kept. Everything
// after a literal '?' is dropped.
function pathSegments(raw) {
  const withoutQuery = raw.split('?')[0];
  return withoutQuery
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (!seg.includes('\u0000')) return seg.startsWith(':') ? '*' : seg;
      return seg.split('\u0000')[0] || '*';
    });
}
