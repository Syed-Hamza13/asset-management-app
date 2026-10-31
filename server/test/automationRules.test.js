import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITIONS,
  actionValue,
  applyAutomationRules,
  automationToday,
  conditionMatches,
} from '../../shared/automationRules.js';

const rule = (overrides = {}) => ({
  sourceKey: 'user',
  sourceType: 'text',
  conditionType: 'filled',
  conditionValue: null,
  targetKey: 'status',
  targetType: 'dropdown',
  actionType: 'set_value',
  actionValue: 'Issued',
  ...overrides,
});

test('exposes the supported conditions and actions', () => {
  assert.deepEqual(AUTOMATION_CONDITIONS, ['filled', 'empty', 'changed', 'equals']);
  assert.deepEqual(AUTOMATION_ACTIONS, ['set_value', 'set_today', 'clear']);
});

test('automationToday returns IST YYYY-MM-DD', () => {
  assert.match(automationToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test('conditionMatches handles filled/empty', () => {
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), 'Hamza', undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), '', undefined), false);
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), 0, undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), false, undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'empty' }), '', undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'empty' }), null, undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'empty' }), 'x', undefined), false);
  // Whitespace-only values are treated as empty.
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), '   ', undefined), false);
  assert.equal(conditionMatches(rule({ conditionType: 'filled' }), '\t \n', undefined), false);
  assert.equal(conditionMatches(rule({ conditionType: 'empty' }), '   ', undefined), true);
});

test('conditionMatches handles changed against previous values', () => {
  assert.equal(conditionMatches(rule({ conditionType: 'changed' }), 'Hamza', ''), true);
  assert.equal(conditionMatches(rule({ conditionType: 'changed' }), 'Hamza', 'Hamza'), false);
  assert.equal(conditionMatches(rule({ conditionType: 'changed' }), '', undefined), false);
  assert.equal(conditionMatches(rule({ conditionType: 'changed' }), 5, '5'), false);
});

test('conditionMatches handles equals with string coercion', () => {
  assert.equal(conditionMatches(rule({ conditionType: 'equals', conditionValue: 'Issued' }), 'Issued', undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'equals', conditionValue: '5' }), 5, undefined), true);
  assert.equal(conditionMatches(rule({ conditionType: 'equals', conditionValue: 'Stock' }), 'Issued', undefined), false);
});

test('conditionMatches returns false for unknown condition', () => {
  assert.equal(conditionMatches(rule({ conditionType: 'nope' }), 'x', undefined), false);
});

test('actionValue coerces by target type and supports set_today', () => {
  assert.equal(actionValue(rule()), 'Issued');
  assert.equal(actionValue(rule({ targetType: 'number', actionValue: '42' })), 42);
  assert.equal(actionValue(rule({ targetType: 'boolean', actionValue: 'true' })), true);
  assert.equal(actionValue(rule({ targetType: 'boolean', actionValue: 'false' })), false);
  assert.equal(actionValue(rule({ actionType: 'set_today' })), automationToday());
  assert.equal(actionValue(rule({ actionType: 'clear', actionValue: 'Ignored' })), '');
});

test('applyAutomationRules does a single ordered pass without mutating input', () => {
  const values = { user: 'Hamza', status: '' };
  const result = applyAutomationRules([rule()], values);
  assert.deepEqual(result, { user: 'Hamza', status: 'Issued' });
  assert.deepEqual(values, { user: 'Hamza', status: '' });
});

test('applyAutomationRules supports chained rules in order', () => {
  const rules = [
    rule(),
    rule({ sourceKey: 'status', conditionType: 'equals', conditionValue: 'Issued', targetKey: 'issue_date', actionType: 'set_today' }),
  ];
  const result = applyAutomationRules(rules, { user: 'Hamza', status: '', issue_date: '' });
  assert.equal(result.status, 'Issued');
  assert.equal(result.issue_date, automationToday());
});

test('applyAutomationRules skips non-matching rules', () => {
  const result = applyAutomationRules([rule()], { user: '', status: 'Stock' });
  assert.equal(result.status, 'Stock');
});

test('applyAutomationRules uses previousValues only for changed', () => {
  const rules = [rule({ conditionType: 'changed' })];
  assert.equal(applyAutomationRules(rules, { user: 'Hamza', status: '' }, { user: 'Hamza' }).status, '');
  assert.equal(applyAutomationRules(rules, { user: 'Hamza', status: '' }, {}).status, 'Issued');
});

test('a clear rule cannot blank an auto_date that already holds a date', () => {
  const clearDate = rule({
    conditionType: 'empty',
    targetKey: 'date_of_issue',
    targetType: 'auto_date',
    actionType: 'clear',
    actionValue: null,
  });
  assert.equal(applyAutomationRules([clearDate], { user: '', date_of_issue: '2026-10-31' }).date_of_issue, '2026-10-31');
  // Nothing to protect when the field is already blank.
  assert.equal(applyAutomationRules([clearDate], { user: '', date_of_issue: '' }).date_of_issue, '');
  // A whitespace-only date is treated as blank, so the rule still applies.
  assert.equal(applyAutomationRules([clearDate], { user: '', date_of_issue: '  ' }).date_of_issue, '');
});

test('a clear rule still blanks other field types and set_today still fills auto_date', () => {
  assert.equal(
    applyAutomationRules([rule({ conditionType: 'empty', targetKey: 'remark', targetType: 'multiline', actionType: 'clear' })], { user: '', remark: 'note' }).remark,
    '',
  );
  assert.equal(
    applyAutomationRules([rule({ conditionType: 'empty', targetKey: 'date_of_issue', targetType: 'auto_date', actionType: 'set_today', actionValue: null })], { user: '', date_of_issue: '2020-01-01' }).date_of_issue,
    automationToday(),
  );
});
