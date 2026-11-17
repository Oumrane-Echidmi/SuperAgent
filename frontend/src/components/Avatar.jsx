import { gradientFor, initialsOf } from "../lib/identity";

export default function Avatar({
  name = "",
  size = 28,
  square = false,
  icon: Icon,
  palette,
  className = "",
  style,
  title,
}) {
  return (
    <span
      className={`avatar ${square ? "avatar--square" : ""} ${className}`}
      style={{
        "--av-size": `${size}px`,
        background: gradientFor(name, palette),
        ...style,
      }}
      title={title ?? name}
      aria-hidden={Icon ? "true" : undefined}
    >
      {Icon ? <Icon /> : initialsOf(name)}
    </span>
  );
}
