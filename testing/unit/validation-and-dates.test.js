import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_TYPES, assertIntegerId, validateFieldValue } from '../../server/src/utils/validation.js';
import { ownerScope, accessibleTypesSql, assetAccessSql } from '../../server/src/utils/scope.js';
import { indianDateToIso, formatDateValue, formatIndiaDateTime, todayInputValue } from '../../client/src/utils/date.js';
import { automationToday } from '../../shared/automationRules.js';

const err = (fn) => { try { fn(); } catch (e) { return e; } };

test('field type vocabulary is exactly the nine supported types', () => {
  assert.deepEqual([...FIELD_TYPES], ['text', 'multiline', 'number', 'boolean', 'date', 'auto_date', 'dropdown', 'quantity', 'mobile']);
});

test('validateFieldValue accepts and rejects per type', () => {
  const f = (type, name = 'F') => ({ type, name });
  assert.equal(err(() => validateFieldValue(f('text'), 'x'.repeat(5001)))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('text'), 'x')), undefined);
  assert.equal(err(() => validateFieldValue(f('multiline'), 'x'.repeat(20001)))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('number'), '42'))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('number'), 42)), undefined);
  assert.equal(err(() => validateFieldValue(f('number'), Infinity))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('quantity'), 0))?.code, 'INVALID_QUANTITY');
  assert.equal(err(() => validateFieldValue(f('quantity'), 15)), undefined);
  assert.equal(err(() => validateFieldValue(f('quantity'), 1.5))?.code, 'INVALID_QUANTITY');
  assert.equal(err(() => validateFieldValue(f('boolean'), 'true'))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('boolean'), true)), undefined);
  for (const bad of ['2026-13-01', '01-01-2026', '2026-02-30', 20260101])
    assert.equal(err(() => validateFieldValue(f('date'), bad))?.code, 'INVALID_FIELD_VALUE', String(bad));
  assert.equal(err(() => validateFieldValue(f('date'), '2024-02-29')), undefined); // real leap day
  assert.equal(err(() => validateFieldValue(f('date'), '2026-02-29'))?.code, 'INVALID_FIELD_VALUE'); // 2026 is not a leap year
  assert.equal(err(() => validateFieldValue(f('auto_date'), '2026-10-31')), undefined);
  assert.equal(err(() => validateFieldValue(f('mobile'), '12345'))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('mobile'), '9876543210')), undefined);
  assert.equal(err(() => validateFieldValue(f('mobile'), '+91 98765-43210')), undefined);
  assert.equal(err(() => validateFieldValue(f('mobile'), '9876543210987654'))?.code, 'INVALID_FIELD_VALUE');
  assert.equal(err(() => validateFieldValue(f('dropdown'), 'nope', new Set(['a'])))?.code, 'INVALID_DROPDOWN_OPTION');
  assert.equal(err(() => validateFieldValue(f('dropdown'), 'a', new Set(['a']))), undefined);
  // an unknown type is passed through untouched (legacy custom types)
  assert.equal(err(() => validateFieldValue({ type: 'future', name: 'F' }, 'anything')), undefined);
});

test('error messages keep their exact wording (the UI shows them verbatim)', () => {
  assert.equal(err(() => validateFieldValue({ type: 'text', name: 'Serial Number' }, 5)).message, 'Serial Number must be text.');
  assert.equal(err(() => validateFieldValue({ type: 'mobile', name: 'Mobile No.' }, '1')).message, 'Mobile No. must be a valid mobile number.');
  assert.equal(err(() => validateFieldValue({ type: 'quantity', name: 'Qty' }, 99)).message, 'Qty must be a whole number between 1 and 15.');
  assert.equal(err(() => validateFieldValue({ type: 'date', name: 'Joining' }, 'x')).message, 'Joining must be a valid date.');
  assert.equal(err(() => validateFieldValue({ type: 'dropdown', name: 'Status' }, 'x', new Set())).message, 'Status has an invalid option.');
});

test('assertIntegerId blocks unsafe ids', () => {
  for (const bad of ['0', -1, '1.5', 'abc', undefined, null, '', '9007199254740993'])
    assert.equal(err(() => assertIntegerId(bad))?.code, 'INVALID_ID', String(bad));
  assert.equal(assertIntegerId('42'), 42);
});

test('scope helpers: admin sees everything, a user is parameterised to their own id', () => {
  const admin = { id: 1, isAdmin: true };
  const user = { id: 7, isAdmin: false };
  assert.deepEqual(ownerScope(admin), { sql: '', params: [] });
  assert.deepEqual(ownerScope(user), { sql: ' AND owner_user_id = ?', params: [7] });
  assert.deepEqual(ownerScope(user, 'at.owner_user_id'), { sql: ' AND at.owner_user_id = ?', params: [7] });
  assert.deepEqual(accessibleTypesSql(admin), { sql: '', params: [] });
  assert.deepEqual(assetAccessSql(admin), { sql: '', params: [] });

  const types = accessibleTypesSql(user, 'at');
  assert.equal(types.params.length, 2);
  assert.match(types.sql, /at\.owner_user_id = \?/);
  assert.match(types.sql, /FROM asset_type_shares ats WHERE ats\.asset_type_id = at\.id AND ats\.user_id = \?/);

  const assets = assetAccessSql(user, 'a');
  assert.equal(assets.params.length, 3, 'asset scope must bind owner, type owner and share user');
  assert.match(assets.sql, /a\.owner_user_id = \?/);
  assert.match(assets.sql, /at_acc\.owner_user_id = \?/);
  assert.match(assets.sql, /ats\.user_id = \?/);
});

test('Indian date helpers round-trip and reject impossible dates', () => {
  assert.equal(formatDateValue('2026-10-31'), '31/10/2026');
  assert.equal(formatDateValue('2026-10-31 05:30:00'), '31/10/2026'); // naive MySQL datetime
  assert.equal(formatDateValue(''), '');
  assert.equal(formatDateValue('31/10/2026'), '31/10/2026'); // already display-formatted: passed through
  assert.equal(indianDateToIso('31/10/2026'), '2026-10-31');
  assert.equal(indianDateToIso('1/9/2026'), '2026-09-01');
  assert.equal(indianDateToIso('31/02/2026'), null);
  assert.equal(indianDateToIso('2026-10-31'), null);
  assert.equal(indianDateToIso(''), '');
  assert.equal(formatIndiaDateTime('not a date'), '');
  assert.notEqual(formatIndiaDateTime('2026-10-31T05:30:00Z'), '');
});

test('todayInputValue and automationToday agree on the IST date', () => {
  assert.equal(todayInputValue(), automationToday());
});
