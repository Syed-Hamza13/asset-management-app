import { useEffect, useRef } from 'react';

// `config` comes from GET /auth/turnstile-config: { enforce, siteKey }.
// When enforcement is off (non-production, or an admin disabled it) the parent
// form receives the 'bypass' token so the submit button stays usable.
export function Turnstile({ onToken, config }) {
  const ref = useRef(null);
  const enabled = Boolean(config?.enforce);
  // Prefer the runtime site key from the server; fall back to a build-time value
  // so existing deployments that only baked VITE_TURNSTILE_SITE_KEY keep working.
  const siteKey = config?.siteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    if (!config) return undefined;
    if (!enabled || !siteKey) {
      onToken(enabled ? '' : 'bypass');
      return undefined;
    }

    const scriptId = 'cf-turnstile-script';
    const render = () => {
      if (!window.turnstile || !ref.current || ref.current.dataset.rendered) return;
      ref.current.dataset.rendered = '1';
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.head.appendChild(script);
    } else {
      render();
    }

    return () => {
      if (window.turnstile && ref.current?.dataset.rendered) {
        try { window.turnstile.remove(ref.current); } catch {}
      }
    };
  }, [config, enabled, siteKey, onToken]);

  if (!config) return null;

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Human verification is turned off for this environment.
      </div>
    );
  }

  if (!siteKey) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Turnstile is enabled but this server has no site key configured, so sign-in is blocked.
      </div>
    );
  }

  return <div ref={ref} />;
}
