import { cx } from "@/components/common/ui";

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={cx("field", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
