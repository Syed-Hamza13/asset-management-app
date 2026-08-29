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

export function Select({ label, options, error, ...props }) {
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
        <option value="">Select...</option>
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
