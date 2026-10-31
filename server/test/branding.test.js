import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSize } from '../src/modules/branding/imageSize.js';
import { decodeIconDataUrl } from '../src/modules/branding/service.js';

const png = (width, height) => {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
};

const gif = (width, height) => {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'latin1');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
};

const jpeg = (segments, width, height) => {
  const buf = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...segments.map((bytes) => Buffer.from(bytes)),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff]),
  ]);
  return buf;
};

const webp = (fourcc, body) =>
  Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.alloc(4),
    Buffer.from('WEBP', 'latin1'),
    Buffer.from(fourcc, 'latin1'),
    Buffer.alloc(4),
    body,
  ]);

test('imageSize reads PNG and GIF headers', () => {
  assert.deepEqual(imageSize(png(181, 175), 'image/png'), { width: 181, height: 175 });
  assert.deepEqual(imageSize(gif(64, 32), 'image/gif'), { width: 64, height: 32 });
});

test('imageSize walks JPEG markers to the start-of-frame segment', () => {
  // A DQT segment: FF DB, then a 4-byte length that counts itself plus 2 payload bytes.
  const quantTable = [0xff, 0xdb, 0x00, 0x04, 0x00, 0x00];
  assert.deepEqual(imageSize(jpeg([quantTable], 800, 600), 'image/jpeg'), { width: 800, height: 600 });
  assert.deepEqual(imageSize(jpeg([], 300, 150), 'image/jpeg'), { width: 300, height: 150 });
});

test('imageSize reads all three WebP variants', () => {
  // VP8X payload: 4 flag bytes, then canvas width-1 and height-1 as 24-bit LE.
  const extended = Buffer.concat([Buffer.alloc(4), Buffer.from([99, 0, 0, 49, 0, 0])]);
  assert.deepEqual(imageSize(webp('VP8X', extended), 'image/webp'), { width: 100, height: 50 });

  const bits = 99 | (49 << 14);
  const lossless = Buffer.from([0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, 0]);
  assert.deepEqual(imageSize(webp('VP8L', lossless), 'image/webp'), { width: 100, height: 50 });

  // Simple lossy payload: 3 frame-tag bytes, 0x9d 0x01 0x2a, then 14-bit LE size.
  const lossy = Buffer.concat([Buffer.alloc(3), Buffer.from([0x9d, 0x01, 0x2a]), Buffer.from([100, 0, 50, 0])]);
  assert.deepEqual(imageSize(webp('VP8 ', lossy), 'image/webp'), { width: 100, height: 50 });
});

test('imageSize prefers explicit SVG size and falls back to viewBox', () => {
  const sized = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128" viewBox="0 0 1 1"></svg>');
  assert.deepEqual(imageSize(sized, 'image/svg+xml'), { width: 256, height: 128 });
  const boxed = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"></svg>');
  assert.deepEqual(imageSize(boxed, 'image/svg+xml'), { width: 512, height: 512 });
});

test('imageSize reports nothing for truncated or unsupported data', () => {
  assert.equal(imageSize(png(181, 175).subarray(0, 18), 'image/png'), null);
  assert.equal(imageSize(Buffer.from('not an image'), 'image/png'), null);
  assert.equal(imageSize(gif(64, 32), 'image/apng'), null);
});

test('decodeIconDataUrl only decodes the accepted image types', () => {
  const pngUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const decoded = decodeIconDataUrl(pngUrl);
  assert.equal(decoded.mime, 'image/png');
  assert.deepEqual([...decoded.buffer], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(decodeIconDataUrl('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(decodeIconDataUrl('<script>alert(1)</script>'), null);
  assert.equal(decodeIconDataUrl(''), null);
  assert.equal(decodeIconDataUrl(undefined), null);
});
