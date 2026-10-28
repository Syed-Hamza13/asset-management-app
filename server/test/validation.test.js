import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_TYPES, assertIntegerId, validateFieldValue } from '../src/utils/validation.js';

test('supports all MVP field types', () => {
  assert.deepEqual([...FIELD_TYPES].sort(), ['auto_date', 'boolean', 'date', 'dropdown', 'mobile', 'multiline', 'number', 'quantity', 'text'].sort());
});

test('validates primitive field values', () => {
  validateFieldValue({ type: 'text', name: 'Name' }, 'Laptop');
  validateFieldValue({ type: 'multiline', name: 'Notes' }, 'hello');
  validateFieldValue({ type: 'number', name: 'Price' }, 123);
  validateFieldValue({ type: 'boolean', name: 'Working' }, true);
  validateFieldValue({ type: 'dropdown', name: 'Department' }, 'IT', new Set(['IT', 'HR']));
  validateFieldValue({ type: 'quantity', name: 'Quantity' }, 15);
  validateFieldValue({ type: 'mobile', name: 'Phone' }, '9876543210');
  validateFieldValue({ type: 'mobile', name: 'Phone' }, '+91 98765-43210');
  assert.throws(() => validateFieldValue({ type: 'quantity', name: 'Quantity' }, 16));
  assert.throws(() => validateFieldValue({ type: 'number', name: 'Price' }, '123'));
  assert.throws(() => validateFieldValue({ type: 'boolean', name: 'Working' }, 'yes'));
  assert.throws(() => validateFieldValue({ type: 'dropdown', name: 'Department' }, 'Finance', new Set(['IT'])));
  assert.throws(() => validateFieldValue({ type: 'mobile', name: 'Phone' }, '12345'));
  assert.throws(() => validateFieldValue({ type: 'mobile', name: 'Phone' }, 'abc-9876543210'));
});

test('rejects unsafe ids', () => {
  assert.equal(assertIntegerId('12'), 12);
  assert.throws(() => assertIntegerId('0'));
  assert.throws(() => assertIntegerId('1 OR 1=1'));
});
