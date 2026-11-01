import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Github, Info, Linkedin, Mail } from "lucide-react";
import { APP } from "../appInfo";
import { CloseButton } from "./ui";

const iconSize = "h-[18px] w-[18px]";

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}

function IconLink({ href, label, children }) {
  const isMail = href.startsWith("mailto:");
  return (
    <a
      href={href}
      {...(isMail ? {} : { target: "_blank", rel: "noreferrer" })}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
    >
      {children}
    </a>
  );
}

function TextLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

// Portalled to <body> like the notification panel: opened from the sidebar footer it
// would otherwise sit in that stacking context, and opened from the mobile header —
// which has a backdrop-filter — a fixed overlay would be clipped to the header box.
export function AboutDialog({ open, onClose, icon = "" }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`About ${APP.name}`}
        onClick={(event) => event.stopPropagation()}
        // Phones get the full screen minus the overlay padding; the width then
        // grows in two capped steps and settles at ~58% of a large monitor, and
        // the card scrolls inside its own height cap so it never touches the
        // top and bottom edges of the screen.
        className="my-auto max-h-[calc(100vh-3rem)] w-full max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl shadow-slate-900/25 sm:max-w-[min(40rem,calc(100vw-2rem))] sm:max-h-[calc(100vh-7rem)] xl:max-w-[min(60rem,58vw)]"
      >
        <div className="sticky top-0 flex items-start gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
          {icon ? (
            <img src={icon} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
              <Info className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{APP.name}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                v{APP.version}
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {APP.license.short} · open source
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{APP.tagline}</p>
          </div>
          <CloseButton onClose={onClose} label="Close About" className="shrink-0" />
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
          <Section title="Overview">
            {APP.overview.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </Section>

          <Section title="What it does">
            <ul className="space-y-1.5">
              {APP.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="License">
            <p>
              <a
                href={APP.license.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
              >
                {APP.license.name}
              </a>{" "}
              — {APP.license.blurb}
            </p>
          </Section>

          <Section title="Author">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{APP.author.name}</p>
                <p className="text-xs text-slate-500">{APP.author.role}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <IconLink href={APP.author.github} label="GitHub profile">
                  <Github className={iconSize} />
                </IconLink>
                <IconLink href={APP.author.linkedin} label="LinkedIn profile">
                  <Linkedin className={iconSize} />
                </IconLink>
                <IconLink href={`mailto:${APP.author.email}`} label="Email the author">
                  <Mail className={iconSize} />
                </IconLink>
              </div>
            </div>
            <p className="break-words text-xs text-slate-500">{APP.author.email}</p>
          </Section>

          <Section title="Contributors">
            <ul className="flex flex-wrap gap-2">
              {APP.contributors.map((name) => (
                <li key={name} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[13px] font-medium text-slate-700">
                  {name}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Tech stack">
            <dl className="space-y-1">
              {APP.techStack.map(([group, detail]) => (
                <div key={group} className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs font-semibold text-slate-400">{group}</dt>
                  <dd className="min-w-0 flex-1 text-[13px]">{detail}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>

        <div className="space-y-3 border-t border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <TextLink href={APP.repository}>Source repository</TextLink>
            <TextLink href={APP.issues}>Report an issue</TextLink>
          </div>
          <p className="text-xs text-slate-400">
            {APP.copyright} · {APP.name} v{APP.version}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
