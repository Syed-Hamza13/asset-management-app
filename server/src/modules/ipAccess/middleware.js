import { AppError } from '../../utils/errors.js';
import { decideAccess } from './service.js';

// Self-contained on purpose: it must not reference the app bundle, /assets, the
// manifest or the service worker, since those are blocked too. Inline style is
// allowed by the helmet CSP (styleSrc 'unsafe-inline').
const BLOCKED_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>404</title>
<style>
  html,body{height:100%}
  body{
    margin:0;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%);
    color:#0f172a;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  h1{
    margin:0;font-size:clamp(110px,30vw,260px);font-weight:800;
    line-height:1;letter-spacing:-.05em;color:#1e293b;
  }
  @media (prefers-color-scheme:dark){
    body{background:linear-gradient(180deg,#0f172a 0%,#020617 100%);color:#e2e8f0}
    h1{color:#e2e8f0}
  }
</style>
</head>
<body><h1>404</h1></body>
</html>`;

// Blocked visitors must not learn that anything exists here: every gated request
// answers with the same 404 the app uses for unknown routes. The real reason and
// the caller's address stay in the server log (see decideAccess).
export function blockedResponse(req, res) {
  res.status(404);
  const wantsHtml = req.method === 'GET' && /text\/html/i.test(req.get('accept') || '');
  if (wantsHtml) return res.type('html').send(BLOCKED_PAGE);
  return res.json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
}

// Per-endpoint gate, used where only one feature is restricted.
export function requireIpAccess(purpose) {
  return async (req, _res, next) => {
    try {
      const decision = await decideAccess(req, purpose);
      if (decision.allowed) return next();
      return next(new AppError(404, 'NOT_FOUND', 'Resource not found.'));
    } catch (error) {
      return next(error);
    }
  };
}

// Whole-app gate driven by the sign-in switch: an address outside the allowlist
// gets 404 for the page, the assets and every API route.
//
// Two paths stay reachable on purpose:
//   /health                       so container/uptime checks are not mistaken for an outage
//   /settings/ip-access           so an admin who is already signed in can repair the list
//                                 from a now-blocked network (route still enforces admin auth;
//                                 a signed-out stranger gets the same 404 as everywhere else)
export function requireNetworkGate() {
  return async (req, res, next) => {
    try {
      if (req.path === '/health') return next();
      if (req.path.startsWith('/api/v1/settings/ip-access') && req.session?.userId) return next();
      const decision = await decideAccess(req, 'login');
      if (decision.allowed) return next();
      return blockedResponse(req, res);
    } catch (error) {
      return next(error);
    }
  };
}
