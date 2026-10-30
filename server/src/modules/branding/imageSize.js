// Reads intrinsic pixel dimensions straight from the header bytes of the image
// types updateBranding() accepts, so the generated web app manifest can declare
// real icon sizes instead of guessing (Chrome needs them for PWA install).
export function imageSize(buffer, mime) {
  try {
    if (mime === "image/png") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mime === "image/gif") {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (mime === "image/jpeg") {
      let offset = 2;
      while (offset + 9 <= buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
      return null;
    }
    if (mime === "image/webp") {
      const fourcc = buffer.subarray(12, 16).toString("latin1");
      const uint24 = (at) => buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16);
      if (fourcc === "VP8X") return { width: 1 + uint24(24), height: 1 + uint24(27) };
      if (fourcc === "VP8L") {
        const bits = buffer.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (fourcc === "VP8 ")
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (mime === "image/svg+xml") {
      const text = buffer.subarray(0, 4096).toString("utf8");
      const tag = /<svg[^>]*>/i.exec(text)?.[0] ?? "";
      const width = /\bwidth=["']?([\d.]+)/i.exec(tag)?.[1];
      const height = /\bheight=["']?([\d.]+)/i.exec(tag)?.[1];
      if (width && height) return { width: Math.round(Number(width)), height: Math.round(Number(height)) };
      const box = /viewBox=["'][\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)/i.exec(tag);
      if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
    }
  } catch {
    // A truncated or spoofed upload simply reports no size.
  }
  return null;
}
