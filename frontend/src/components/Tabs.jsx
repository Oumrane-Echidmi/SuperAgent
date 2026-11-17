export default function Tabs({ value, onChange, items, className = "pill-tabs" }) {
  return (
    <div className={className} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={value === item.id}
          className={`pill-tab ${value === item.id ? "active" : ""}`}
          key={item.id}
          onClick={() => onChange(item.id)}
          role="tab"
          type="button"
        >
          {item.label}
          {item.count !== undefined ? <span className="count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
