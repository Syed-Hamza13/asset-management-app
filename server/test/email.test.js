import test from 'node:test';
import assert from 'node:assert';
import { validatePlaceholders, renderTemplate, isValidToken } from '../src/modules/email/placeholder.js';
import { isPermanent, sanitize } from '../src/modules/email/classify.js';

test('isValidToken accepts the documented placeholder grammar', () => {
  for (const t of ['asset_type_name', 'asset_public_id', 'created_at', 'updated_at', 'user.email', 'user.name', 'field.status', 'field.status.previous', 'field.my_key2']) {
    assert.ok(isValidToken(t), t);
  }
  for (const t of ['nope', 'field.', 'field.bad-key', 'user.password', 'field.a.b.c']) {
    assert.ok(!isValidToken(t), t);
  }
});

test('validatePlaceholders throws on unknown tokens and passes on known ones', () => {
  assert.doesNotThrow(() => validatePlaceholders('Hi {{asset_type_name}} {{field.status}}', '{{user.email}}'));
  assert.throws(() => validatePlaceholders('{{secret}}'), /Unknown placeholder/);
});

test('renderTemplate substitutes values, previous, and blanks for missing', () => {
  const payload = {
    assetTypeName: 'Laptop', publicId: 'PUB-1', createdAt: 'c', updatedAt: 'u',
    user: { email: 'a@b.c', name: 'a@b.c' },
    fields: { status: 'issued' }, previous: { status: 'stock' },
  };
  const out = renderTemplate('{{asset_type_name}} {{field.status.previous}}->{{field.status}} {{user.email}} [{{field.missing}}]', payload);
  assert.strictEqual(out, 'Laptop stock->issued a@b.c []');
});

test('isPermanent classifies auth/5xx as permanent, network/4xx as transient', () => {
  assert.ok(isPermanent({ code: 'EAUTH', message: 'auth failed' }));
  assert.ok(isPermanent({ responseCode: 550, message: 'mailbox unavailable' }));
  assert.ok(!isPermanent({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }));
  assert.ok(!isPermanent({ responseCode: 421, message: 'try again later' }));
});

test('sanitize redacts password-like fragments and truncates', () => {
  const s = sanitize('auth failed password=hunter2 for user');
  assert.ok(!s.includes('hunter2'));
  assert.ok(s.includes('pass=***'));
  assert.ok(sanitize('x'.repeat(900)).length <= 500);
});
