import { useEffect, useRef, useState } from "react";
import { formatDateValue, indianDateToIso } from "../utils";

export function Button({
  children,
  variant = "primary",
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
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
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
    clear: "right-1.5 h-6 w-6 text-base",
  },
  md: {
    box: "h-11 text-sm",
    icon: "left-3 h-4 w-4",
    input: "pl-9 pr-9",
    clear: "right-2 h-7 w-7 text-lg",
  },
  lg: {
    box: "h-12 text-base",
    icon: "left-3.5 h-4 w-4",
    input: "pl-10 pr-10",
    clear: "right-2.5 h-7 w-7 text-lg",
  },
};

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
          className={`absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${s.clear}`}
        >
          ×
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
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="shrink-0 text-xl text-slate-400 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
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
