import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAutomationRules,
  automationToday,
  conditionMatches,
  actionValue,
  isBlockedAutoDateClear,
  isFilledValue,
  AUTOMATION_CONDITIONS,
  AUTOMATION_ACTIONS,
} from '../../shared/automationRules.js';

// These tests lock the rule engine's observable behaviour. The refactor must not
// change a single one of them; the client preview uses the same code path, so a
// change here silently changes what users see in the Add/Edit forms.

const rule = (o = {}) => ({
  id: 1,
  scope: 'common_form',
  sourceKey: 'user',
  sourceType: 'text',
  conditionType: 'filled',
  conditionValue: null,
  targetKey: 'status',
  targetType: 'dropdown',
  actionType: 'set_value',
  actionValue: 'issued',
  ...o,
});

test('vocabulary is frozen: conditions and actions in order', () => {
  assert.deepEqual(AUTOMATION_CONDITIONS, ['filled', 'empty', 'changed', 'equals']);
  assert.deepEqual(AUTOMATION_ACTIONS, ['set_value', 'set_today', 'clear']);
});

test('isFilledValue: whitespace and nullish count as empty, zero and false count as filled', () => {
  for (const empty of [undefined, null, '', ' ', '\t \n']) assert.equal(isFilledValue(empty), false, String(empty));
  for (const filled of [0, false, 'x', ' x ', '2026-10-31']) assert.equal(isFilledValue(filled), true, String(filled));
});

test('conditionMatches semantics per condition type', () => {
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), 'Ram', undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'empty' }), '   ', undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'changed' }), 'a', 'b'), true);
  assert.equal(conditionMatches(rule({ conditionType: 'changed' }), 5, '5'), false);
  assert.equal(conditionMatches(rule({ conditionType: 'equals', conditionValue: 'issued' }), 'issued', null), true);
  assert.equal(conditionMatches(rule({ conditionType: 'unknown' }), 'x', undefined), false);
});

test('actionValue: clear blanks, set_today uses IST today, set_value coerces by target type', () => {
  assert.equal(actionValue(rule({ actionType: 'clear' })), '');
  assert.equal(actionValue(rule({ actionType: 'set_today' })), automationToday());
  assert.match(automationToday(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(actionValue(rule({ targetType: 'number', actionValue: '42' })), 42);
  assert.equal(actionValue(rule({ targetType: 'boolean', actionValue: 'true' })), true);
  assert.equal(actionValue(rule({ targetType: 'text', actionValue: '42' })), '42');
});

test('one ordered pass, later rules see earlier writes, input object is not mutated', () => {
  const rules = [
    rule(),
    rule({ sourceKey: 'status', conditionType: 'equals', conditionValue: 'issued', targetKey: 'date_of_issue', targetType: 'auto_date', actionType: 'set_today' }),
  ];
  const values = { user: 'Ram', status: '', date_of_issue: '' };
  const out = applyAutomationRules(rules, values);
  assert.deepEqual(out, { user: 'Ram', status: 'issued', date_of_issue: automationToday() });
  assert.deepEqual(values, { user: 'Ram', status: '', date_of_issue: '' });
});

test('common-form rules run before asset-type rules (merge order contract)', () => {
  const common = rule({ scope: 'common_form', id: 5, conditionType: 'empty', actionValue: 'stock' });
  const asset = rule({ scope: 'asset_type', id: 9, conditionType: 'empty', actionValue: 'issued' });
  assert.equal(applyAutomationRules([common, asset], { user: '', status: '' }).status, 'issued');
  assert.equal(applyAutomationRules([asset, common], { user: '', status: '' }).status, 'stock');
});

test('isBlockedAutoDateClear protects only a filled auto_date from a clear rule', () => {
  const clearDate = rule({ targetKey: 'date_of_issue', targetType: 'auto_date', conditionType: 'empty', actionType: 'clear', actionValue: null });
  assert.equal(isBlockedAutoDateClear(clearDate, '2026-10-31'), true);
  assert.equal(isBlockedAutoDateClear(clearDate, ''), false);
  assert.equal(isBlockedAutoDateClear(clearDate, '  '), false);
  assert.equal(isBlockedAutoDateClear(clearDate, undefined), false);
  // other targets and other actions are never blocked
  assert.equal(isBlockedAutoDateClear(rule({ actionType: 'clear', targetKey: 'remark' }), 'note'), false);
  assert.equal(isBlockedAutoDateClear(rule({ targetType: 'auto_date', actionType: 'set_today' }), '2026-01-01'), false);
});

test('a clear rule cannot blank a prefilled auto_date but can blank an untouched one', () => {
  const rules = [rule({ conditionType: 'empty', actionValue: 'stock' }), rule({ targetKey: 'date_of_issue', targetType: 'auto_date', conditionType: 'empty', actionType: 'clear', actionValue: null })];
  assert.equal(applyAutomationRules(rules, { user: '', date_of_issue: automationToday(), status: '' }).date_of_issue, automationToday());
  assert.equal(applyAutomationRules(rules, { user: '', date_of_issue: '', status: '' }).date_of_issue, '');
});

test('previousValues is only consulted by the changed condition', () => {
  const rules = [rule({ conditionType: 'changed' })];
  assert.equal(applyAutomationRules(rules, { user: 'Ram', status: '' }, { user: 'Ram' }).status, '');
  assert.equal(applyAutomationRules(rules, { user: 'Ram', status: '' }, { user: 'Sam' }).status, 'issued');
  // empty/filled ignore previousValues entirely: an unchanged empty source still fires
  assert.equal(applyAutomationRules([rule({ conditionType: 'empty', actionValue: 'stock' })], { user: '', status: '' }, { user: '' }).status, 'stock');
});
