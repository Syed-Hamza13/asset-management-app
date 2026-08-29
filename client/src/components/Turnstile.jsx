import { useEffect, useRef } from 'react';

export function Turnstile({ onToken }) {
  const ref = useRef(null);
  const isDev = import.meta.env.DEV;
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    if (isDev) {
      onToken('dev-bypass');
      return undefined;
    }

    if (!siteKey) {
      onToken('');
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
  }, [isDev, siteKey, onToken]);

  if (isDev) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Turnstile is bypassed in development because no site key is configured.
      </div>
    );
  }

  if (!siteKey) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Turnstile is not configured for this environment. Rebuild the Docker image with the site key.
      </div>
    );
  }

  return <div ref={ref} />;
}
