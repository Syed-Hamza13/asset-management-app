import { createHash } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { imageSize } from './imageSize.js';
import { decodeIconDataUrl, getBranding, updateBranding } from './service.js';

const ICON_URL = '/api/v1/branding/icon';
const PLACEHOLDER_ICONS = [
  { src: '/icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
  { src: '/icons/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
];
const MANIFEST_BASE = {
  name: 'Asset Manager',
  short_name: 'Assets',
  description: 'Manage assets, forms, dropdowns and automations.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#f8fafc',
  theme_color: '#0f172a',
  prefer_related_applications: false,
};

const bodySchema = z.object({ key: z.enum(['favicon_data_url', 'app_icon_data_url']), value: z.string().min(1).max(4_000_000) });

export const get = asyncHandler(async (_req, res) => res.json({ success: true, data: await getBranding() }));
export const update = asyncHandler(async (req, res) => {
  const data = bodySchema.parse(req.body);
  res.json({ success: true, data: await updateBranding(data.key, data.value) });
});

// Public, unauthenticated icon bytes so the tab favicon is correct on the sign-in
// screen too (the client cannot read GET /branding before login).
export const icon = asyncHandler(async (req, res) => {
  const image = decodeIconDataUrl((await getBranding()).favicon);
  if (!image) return res.redirect(302, '/icons/icon.svg');
  const etag = `"${createHash('sha1').update(image.buffer).digest('hex')}"`;
  res.setHeader('Content-Type', image.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Admin-uploaded SVG would otherwise be a same-origin scriptable document.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', etag);
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.send(image.buffer);
});

// Same reason as above, for the install/home-screen icon: it has to declare the
// uploaded image's real dimensions, which a static file in the bundle cannot do.
export const manifest = asyncHandler(async (_req, res) => {
  const image = decodeIconDataUrl((await getBranding()).favicon);
  const size = image && imageSize(image.buffer, image.mime);
  const icons = image
    ? [{ src: ICON_URL, sizes: size ? `${size.width}x${size.height}` : 'any', type: image.mime, purpose: 'any maskable' }, ...PLACEHOLDER_ICONS]
    : PLACEHOLDER_ICONS;
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/manifest+json');
  res.send(JSON.stringify({ ...MANIFEST_BASE, icons }));
});
