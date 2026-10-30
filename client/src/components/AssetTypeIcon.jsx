import { useEffect, useState } from 'react';

let registry;
// One shared dynamic import: the icon chunk loads once, in the background, after the
// cards have already painted.
const loadRegistry = () => (registry ??= import('../icons/assetIcons.js'));

export function AssetTypeIcon({ name, className = 'h-5 w-5' }) {
  const [Icon, setIcon] = useState(null);
  useEffect(() => {
    let active = true;
    loadRegistry().then((m) => {
      if (active) setIcon(() => m.resolveIcon(name));
    });
    return () => { active = false; };
  }, [name]);
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-hidden="true">
      {Icon ? <Icon className={className} strokeWidth={1.75} /> : null}
    </span>
  );
}
