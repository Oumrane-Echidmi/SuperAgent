import { useEffect, useRef, useState } from "react";

export default function Dropdown({
  trigger,
  items = [],
  align = "right",
  direction = "down",
  menuClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="has-menu" ref={ref}>
      {trigger({
        onClick: (event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        },
        "aria-expanded": open,
      })}
      {open ? (
        <div
          className={`menu menu--${align} ${direction === "up" ? "menu--up" : ""} ${menuClassName}`}
          role="menu"
        >
          {items.map((item, index) => {
            if (item.type === "separator") {
              return <div className="menu-sep" key={`sep-${index}`} />;
            }
            if (item.type === "label") {
              return (
                <div className="menu-label" key={`label-${index}`}>
                  {item.label}
                </div>
              );
            }
            const Icon = item.icon;
            return (
              <button
                className={`menu-item ${item.danger ? "menu-item--danger" : ""}`}
                disabled={item.disabled}
                key={item.label}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onClick?.();
                }}
                role="menuitem"
                type="button"
              >
                {Icon ? <Icon /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
