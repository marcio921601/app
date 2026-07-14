import { cx } from "@/components/common/ui";

export function TabsBar({ items, value, onChange }) {
  return (
    <div className="tabs-bar" role="tablist" aria-label="Modulos do diario">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={cx("tab-button", value === item.value && "is-active")}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
