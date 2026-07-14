import { cx } from "@/components/common/ui";

export function Card({ title, subtitle, actions, children, className = "", bodyClassName = "" }) {
  return (
    <section className={cx("card", className)}>
      {(title || subtitle || actions) && (
        <header className="card-header">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      )}
      <div className={cx("card-body", bodyClassName)}>{children}</div>
    </section>
  );
}
