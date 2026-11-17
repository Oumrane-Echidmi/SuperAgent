export default function ResourceState({ resource }) {
  if (resource.error)
    return (
      <div className="live-state" role="alert">
        <p>{resource.error.message}</p>
        <button className="live-secondary" onClick={resource.reload}>
          Try again
        </button>
      </div>
    );
  if (!resource.data)
    return (
      <p className="live-state" role="status">
        Loading your workspace…
      </p>
    );
  return null;
}
