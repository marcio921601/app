import { cx } from "@/components/common/ui";

export function StatCard({ label, value, tone = "default", detail }) {
  return (
    <article className={cx("stat-card", `tone-${tone}`)}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? <div className="stat-detail">{detail}</div> : null}
    </article>
  );
}
