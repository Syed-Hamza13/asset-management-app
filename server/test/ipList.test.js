import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ENTRIES, isIpInList, parseIp, parseIpList, parseEntry } from '../src/utils/ipList.js';

test('parses IPv4 and IPv6 addresses', () => {
  assert.deepEqual(parseIp('192.168.1.10'), { family: 4, value: (192n << 24n) + (168n << 16n) + (1n << 8n) + 10n });
  assert.equal(parseIp('0.0.0.0').family, 4);
  assert.equal(parseIp('255.255.255.255').value, (1n << 32n) - 1n);
  assert.equal(parseIp('::1').family, 6);
  assert.equal(parseIp('2001:db8::1').family, 6);
  assert.equal(parseIp('2001:0db8:0000:0000:0000:0000:0000:0001').value, parseIp('2001:db8::1').value);
  assert.equal(parseIp('fe80::1%eth0').value, parseIp('fe80::1').value);
  assert.equal(parseIp('[2001:db8::1]').value, parseIp('2001:db8::1').value);
  assert.equal(parseIp('2001:db8::192.0.2.1').value, parseIp('2001:db8::c000:201').value);
});

test('rejects malformed addresses', () => {
  for (const bad of ['192.168.1', '192.168.1.256', '1.2.3.4.5', 'abc.def.ghi.jkl', '', '  ', '2001:db8:::1', 'gggg::1', '1:2:3:4:5:6:7']) {
    assert.equal(parseIp(bad), null, `expected "${bad}" to be invalid`);
  }
});

test('matches single addresses per family', () => {
  const { entries } = parseIpList('192.168.1.10\n2001:db8::1');
  assert.equal(entries.length, 2);
  assert.ok(isIpInList('192.168.1.10', entries));
  assert.ok(isIpInList('2001:db8::1', entries));
  assert.ok(!isIpInList('192.168.1.11', entries));
  assert.ok(!isIpInList('::1', entries));
});

test('matches CIDR blocks', () => {
  const { entries, invalid } = parseIpList('192.168.1.0/24, 10.0.0.0/8, 2001:db8::/48');
  assert.equal(invalid.length, 0);
  assert.equal(entries.length, 3);
  assert.ok(isIpInList('192.168.1.200', entries));
  assert.ok(isIpInList('10.255.255.255', entries));
  assert.ok(isIpInList('2001:db8:0:ffff::5', entries));
  assert.ok(!isIpInList('192.168.2.1', entries));
  assert.ok(!isIpInList('11.0.0.1', entries));
  assert.ok(!isIpInList('2001:db9::1', entries));
});

test('CIDR with host bits set still covers the block', () => {
  const { entries } = parseIpList('192.168.1.37/24');
  assert.ok(isIpInList('192.168.1.1', entries));
  assert.ok(isIpInList('192.168.1.254', entries));
  assert.ok(!isIpInList('192.168.2.1', entries));
});

test('matches explicit ranges', () => {
  const { entries, invalid } = parseIpList('192.168.1.20-192.168.1.60');
  assert.equal(invalid.length, 0);
  assert.ok(isIpInList('192.168.1.20', entries));
  assert.ok(isIpInList('192.168.1.45', entries));
  assert.ok(isIpInList('192.168.1.60', entries));
  assert.ok(!isIpInList('192.168.1.19', entries));
  assert.ok(!isIpInList('192.168.1.61', entries));
});

test('matches trailing-octet wildcards', () => {
  const { entries } = parseIpList('192.168.1.*, 10.20.*');
  assert.equal(entries.length, 2);
  assert.ok(isIpInList('192.168.1.77', entries));
  assert.ok(isIpInList('10.20.99.1', entries));
  assert.ok(!isIpInList('192.168.2.77', entries));
  assert.ok(!isIpInList('10.21.1.1', entries));
});

test('treats IPv4-mapped IPv6 entries as IPv4', () => {
  const { entries } = parseIpList('::ffff:192.168.1.10');
  assert.equal(entries[0].family, 4);
  assert.ok(isIpInList('192.168.1.10', entries));
});

test('IPv4-mapped socket addresses match IPv4 entries', () => {
  const { entries } = parseIpList('127.0.0.1');
  assert.ok(isIpInList('::ffff:127.0.0.1', entries));
});

test('reports invalid entries instead of silently dropping them', () => {
  const { entries, invalid } = parseIpList('192.168.1.10\nnot-an-ip\n192.168.1.0/33\n192.168.1.60-192.168.1.20\n192.168.*.1');
  assert.equal(entries.length, 1);
  assert.equal(invalid.length, 4);
  assert.deepEqual(invalid.map((x) => x.raw), ['not-an-ip', '192.168.1.0/33', '192.168.1.60-192.168.1.20', '192.168.*.1']);
  assert.match(invalid[1].error, /between 0 and 32/);
  assert.match(invalid[2].error, /lower than/);
});

test('blank input yields no entries (fail-open path)', () => {
  for (const text of ['', '   ', '\n\n', ',,;;']) {
    const { entries, invalid } = parseIpList(text);
    assert.equal(entries.length, 0);
    assert.equal(invalid.length, 0);
  }
  assert.equal(isIpInList('10.0.0.1', []), false);
});

test('enforces the entry cap', () => {
  const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => `10.0.${Math.floor(i / 256)}.${i % 256}`).join('\n');
  const { entries, invalid } = parseIpList(many);
  assert.equal(entries.length, MAX_ENTRIES);
  assert.equal(invalid.length, 5);
  assert.match(invalid[0].error, /Too many entries/);
});

test('parseEntry classifies kinds', () => {
  assert.equal(parseEntry('1.2.3.4').kind, 'ip');
  assert.equal(parseEntry('1.2.3.0/24').kind, 'cidr');
  assert.equal(parseEntry('1.2.3.4-1.2.3.9').kind, 'range');
  assert.equal(parseEntry('1.2.3.*').kind, 'wildcard');
  assert.equal(parseEntry('  '), null);
  assert.equal(parseEntry('1.2.3.4').valid, true);
});
