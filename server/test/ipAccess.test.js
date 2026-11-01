import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIp, parseIpList, isIpInList } from '../src/utils/ipList.js';
import { clientIp, resolveClientIp } from '../src/modules/ipAccess/service.js';

const trust = (list) => parseIpList(list).entries;
const PROXY = '172.17.0.1,127.0.0.1';

function req(remoteAddress, headers = {}) {
  return { socket: { remoteAddress }, headers };
}

test('ignores forwarded headers while no proxy is trusted', () => {
  const resolved = resolveClientIp(req('203.0.113.7', { 'x-forwarded-for': '192.168.1.5' }), []);
  assert.equal(resolved.raw, '203.0.113.7');
  assert.deepEqual(resolved.ip, parseIp('203.0.113.7'));
});

test('uses the socket address when the peer is not a trusted proxy', () => {
  // A direct hit on the container port cannot supply an honest chain.
  const resolved = resolveClientIp(req('203.0.113.7', { 'x-forwarded-for': '192.168.1.5' }), trust(PROXY));
  assert.equal(resolved.raw, '203.0.113.7');
});

test('takes the right-most untrusted address from the forwarded chain', () => {
  const resolved = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': '198.51.100.9, 203.0.113.25' }), trust(PROXY));
  assert.equal(resolved.raw, '203.0.113.25');
});

test('never reaches an address the visitor forged further left in the chain', () => {
  // The client sends X-Forwarded-For: 8.8.8.8; the proxy appends the real peer.
  const resolved = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': '8.8.8.8, 198.51.100.7' }), trust(PROXY));
  assert.equal(resolved.raw, '198.51.100.7');
  assert.ok(!isIpInList(resolved.ip, trust('8.8.8.8')), 'a forged allowlisted address must not win');
});

test('skips trusted hops anywhere in a longer chain', () => {
  const resolved = resolveClientIp(
    req('127.0.0.1', { 'x-forwarded-for': '198.51.100.7, 172.17.0.1, 127.0.0.1' }),
    trust(PROXY)
  );
  assert.equal(resolved.raw, '198.51.100.7');
});

test('falls back to X-Real-IP when the chain has no usable address', () => {
  const resolved = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': 'unknown', 'x-real-ip': '198.51.100.4' }), trust(PROXY));
  assert.equal(resolved.raw, '198.51.100.4');
  assert.deepEqual(resolved.ip, parseIp('198.51.100.4'));
});

test('stays on the socket address when nothing usable is forwarded', () => {
  const noHeaders = resolveClientIp(req('172.17.0.1'), trust(PROXY));
  assert.equal(noHeaders.raw, '172.17.0.1');
  // A chain of only proxies (e.g. an internal health check) is not a client.
  const allProxies = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': '127.0.0.1, 172.17.0.1' }), trust(PROXY));
  assert.equal(allProxies.raw, '172.17.0.1');
});

test('normalises an IPv4-mapped IPv6 socket address', () => {
  const mapped = resolveClientIp(req('::ffff:203.0.113.7'), []);
  assert.equal(mapped.ip.family, 4);
  assert.equal(mapped.ip.value, parseIp('203.0.113.7').value);
  // The mapped bridge gateway is still recognised as the trusted proxy.
  const viaProxy = resolveClientIp(req('::ffff:172.17.0.1', { 'x-forwarded-for': '203.0.113.9' }), trust(PROXY));
  assert.equal(viaProxy.raw, '203.0.113.9');
});

test('joins repeated forwarded headers', () => {
  const resolved = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': ['198.51.100.9', '203.0.113.25'] }), trust(PROXY));
  assert.equal(resolved.raw, '203.0.113.25');
});

test('trims whitespace and blank tokens in the chain', () => {
  const resolved = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': ' ,   203.0.113.25   , ' }), trust(PROXY));
  assert.equal(resolved.raw, '203.0.113.25');
});

test('resolves the real client behind a proxy for allowlist matching', () => {
  const allowlist = trust('198.51.100.0/24');
  const behindProxy = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': '198.51.100.42' }), trust(PROXY));
  assert.ok(isIpInList(behindProxy.ip, allowlist), 'office client must match its own range');
  const colleague = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': '203.0.113.42' }), trust(PROXY));
  assert.ok(!isIpInList(colleague.ip, allowlist), 'an address outside the range must still be blocked');
  // Without the trusted-proxy list the proxy IP is all the gate can see.
  const socketOnly = resolveClientIp(req('172.17.0.1', { 'x-forwarded-for': '198.51.100.42' }), []);
  assert.ok(!isIpInList(socketOnly.ip, allowlist));
});

test('clientIp keeps the previous socket-only behaviour when the env is unset', () => {
  // IP_ACCESS_TRUSTED_PROXIES is empty for the whole test run, so headers are ignored.
  assert.equal(clientIp(req('203.0.113.7', { 'x-forwarded-for': '172.17.0.1' })).raw, '203.0.113.7');
  assert.equal(clientIp({}).raw, '');
  assert.equal(clientIp({}).ip, null);
  assert.equal(clientIp({ connection: { remoteAddress: '10.1.2.3' } }).raw, '10.1.2.3');
});
