import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateValue, indianDateToIso } from "../utils/date";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  ...props
}) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary:
      "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  // Padding lives here rather than in className so a smaller toolbar button
  // cannot lose a Tailwind cascade fight with the default px-4/py-2.5.
  const sizes = {
    sm: "px-3 py-2 text-[13px] rounded-lg sm:py-1.5",
    md: "px-4 py-2.5 text-sm rounded-xl",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${styles[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}

export function Input({ label, hint, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {props.required ? <span className="text-red-500"> *</span> : null}
      </span>
      {props.type === "textarea" ? (
        <textarea
          className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          {...props}
        />
      ) : (
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          {...props}
        />
      )}
      {hint && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}

const searchSizes = {
  sm: {
    box: "h-9 text-sm",
    icon: "left-2.5 h-3.5 w-3.5",
    input: "pl-8 pr-8",
    clear: "right-1 h-7 w-7",
  },
  md: {
    box: "h-11 text-sm",
    icon: "left-3 h-4 w-4",
    input: "pl-9 pr-9",
    clear: "right-1.5 h-8 w-8",
  },
  lg: {
    box: "h-12 text-base",
    icon: "left-3.5 h-4 w-4",
    input: "pl-10 pr-10",
    clear: "right-2 h-8 w-8",
  },
};

export function CloseIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className={className}
    >
      <path d="m5.5 5.5 9 9m0-9-9 9" strokeLinecap="round" />
    </svg>
  );
}

export function CloseButton({ onClose, label = "Close", className = "" }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 active:scale-95 sm:h-10 sm:w-10 ${className}`}
    >
      <CloseIcon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = "Search...",
  size = "md",
  className = "",
  inputClassName = "",
  disabled = false,
  onKeyDown,
  ...props
}) {
  const s = searchSizes[size] || searchSizes.md;
  function clear() {
    if (onClear) onClear();
    else onChange?.({ target: { value: "" } });
  }
  function handleKeyDown(event) {
    if (event.key === "Escape" && value) {
      event.preventDefault();
      clear();
    }
    onKeyDown?.(event);
  }
  return (
    <div className={`relative ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${s.icon}`}
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m13 13 4 4" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        enterKeyHint="search"
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-xl border border-slate-200 bg-white ${s.box} ${s.input} outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 ${inputClassName}`}
        {...props}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          title="Clear search"
          className={`absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-900 focus-visible:bg-slate-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100 ${s.clear}`}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DateInput({ label, value, onChange, error, required, disabled }) {
  const pickerRef = useRef(null);
  const [display, setDisplay] = useState(value ? formatDateValue(value) : "");

  useEffect(() => {
    setDisplay(value ? formatDateValue(value) : "");
  }, [value]);

  function updateDisplay(nextDisplay) {
    if (!/^\d{0,2}(\/\d{0,2}(\/\d{0,4})?)?$/.test(nextDisplay)) return;
    setDisplay(nextDisplay);
    if (nextDisplay === "") onChange({ target: { value: "" } });
    else {
      const iso = indianDateToIso(nextDisplay);
      if (iso) onChange({ target: { value: iso } });
    }
  }

  function handlePickerChange(event) {
    onChange(event);
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100">
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/YYYY"
          value={display}
          onChange={(event) => updateDisplay(event.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 outline-none"
        />
        <button
          type="button"
          aria-label="Open calendar"
          title="Open calendar"
          disabled={disabled}
          onClick={() => {
            if (pickerRef.current?.showPicker) pickerRef.current.showPicker();
            else pickerRef.current?.click();
          }}
          className="relative grid w-12 shrink-0 place-items-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <span aria-hidden="true">▦</span>
          <input
            ref={pickerRef}
            type="date"
            value={value ?? ""}
            onChange={handlePickerChange}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </button>
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ label, options, error, hideBlank, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {props.required ? <span className="text-red-500"> *</span> : null}
      </span>
      <select
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        {...props}
      >
        {!hideBlank && <option value="">Select...</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-xl">
        +
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, title, children, onClose, className = "" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-3 sm:p-4">
      <div
        className={`max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:p-6 ${className}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold">{title}</h2>
          <CloseButton onClose={onClose} label={`Close ${typeof title === "string" ? title : "dialog"}`} />
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

// Anchored dropdown panel. Tables sit inside an overflow-x-auto wrapper, which
// also clips vertically, so small tables would cut the panel off — this renders
// into <body> at fixed coordinates instead, flipping and clamping to the viewport.
export function Popover({ anchorRef, onClose, children, className = "" }) {
  const panelRef = useRef(null);
  const [box, setBox] = useState(null);

  function place() {
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const below = window.innerHeight - rect.bottom;
    const openUp =
      height + gap + margin > below && rect.top - gap - margin > below;
    const rawTop = openUp ? rect.top - gap - height : rect.bottom + gap;
    const next = {
      top: Math.max(margin, Math.min(rawTop, window.innerHeight - height - margin)),
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
    };
    setBox((current) =>
      current && current.top === next.top && current.left === next.left ? current : next,
    );
  }

  useEffect(() => {
    place();
    const onScrollOrResize = () => place();
    function onPointerDown(event) {
      if (
        panelRef.current?.contains(event.target) ||
        anchorRef?.current?.contains(event.target)
      )
        return;
      onClose();
    }
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => place()) : null;
    if (observer && panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: box?.top ?? 0,
        left: box?.left ?? 0,
        visibility: box ? "visible" : "hidden",
      }}
      className={`z-[55] w-64 rounded-xl border border-slate-200 bg-white p-3 text-left normal-case shadow-xl ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Alert({ children, type = "error" }) {
  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
