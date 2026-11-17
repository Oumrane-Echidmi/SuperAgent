export default function Page({
  icon: Icon,
  title,
  count,
  subtitle,
  actions,
  children,
  flush = false,
  bodyClassName = "",
}) {
  return (
    <>
      <header className="page-header">
        <div className="page-heading">
          {Icon ? <Icon /> : null}
          <h1 className="page-title">{title}</h1>
          {count !== undefined && count !== null ? (
            <span className="page-count">{count}</span>
          ) : null}
        </div>
        {subtitle ? <span className="page-subtitle">{subtitle}</span> : null}
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </header>
      <div
        className={`page-body ${flush ? "page-body--flush" : ""} ${bodyClassName}`}
      >
        {children}
      </div>
    </>
  );
}
