import { useState } from "react";
import {
  GitBranch,
  Play,
  Square,
  Zap,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

const icons = { trigger: Zap, action: Play, condition: GitBranch, end: Square };
export const emptyGraph = () => ({
  nodes: [{ id: "start", label: "Start", type: "trigger" }],
  edges: [],
});

export default function WorkflowGraph({ value, onChange, readOnly = false }) {
  const [selected, setSelected] = useState(value.nodes[0]?.id),
    [zoom, setZoom] = useState(1);
  const [source, setSource] = useState(""),
    [target, setTarget] = useState("");
  const node = value.nodes.find((item) => item.id === selected);
  const columns = Math.min(4, value.nodes.length),
    width = Math.max(700, columns * 240 + 80);
  const height = Math.max(320, Math.ceil(value.nodes.length / 4) * 160 + 100);
  const positions = Object.fromEntries(
    value.nodes.map((item, i) => [
      item.id,
      { x: 45 + (i % 4) * 240, y: 70 + Math.floor(i / 4) * 160 },
    ]),
  );
  function updateNode(patch) {
    onChange({
      ...value,
      nodes: value.nodes.map((item) =>
        item.id === selected ? { ...item, ...patch } : item,
      ),
    });
  }
  function connect() {
    if (
      source &&
      target &&
      source !== target &&
      value.nodes.some((node) => node.id === source) &&
      value.nodes.some((node) => node.id === target) &&
      !value.edges.some(
        (edge) => edge.source === source && edge.target === target,
      )
    ) {
      onChange({ ...value, edges: [...value.edges, { source, target }] });
    }
  }
  return (
    <section className="graph-studio" aria-label="Workflow preview">
      <div className="graph-toolbar">
        <span>
          <strong>Workflow preview</strong> · {value.nodes.length} nodes ·{" "}
          {value.edges.length} connections
        </span>
        <div className="record-actions">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((v) => Math.max(0.4, v - 0.2))}
          >
            <ZoomOut size={16} />
          </button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((v) => Math.min(1.8, v + 0.2))}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            onClick={() => setZoom(1)}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div
        className="graph-scroll"
        tabIndex={0}
        aria-label="Scrollable workflow canvas"
      >
        <div
          className="graph-surface"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            style={{
              width,
              height,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              width={width}
              height={height}
              className="graph-edges"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="graph-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8" fill="#aaaaaa" />
                </marker>
              </defs>
              {value.edges.map((edge) => {
                const a = positions[edge.source],
                  b = positions[edge.target];
                return a && b ? (
                  <path
                    key={`${edge.source}:${edge.target}`}
                    d={`M${a.x + 174},${a.y + 40} C${a.x + 220},${a.y + 40} ${b.x - 40},${b.y + 40} ${b.x},${b.y + 40}`}
                    fill="none"
                    stroke="#aaaaaa"
                    strokeWidth="2"
                    markerEnd="url(#graph-arrow)"
                  />
                ) : null;
              })}
            </svg>
            {value.nodes.map((item) => {
              const Icon = icons[item.type];
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`graph-node graph-node--${item.type} ${selected === item.id ? "is-selected" : ""}`}
                  style={{
                    left: positions[item.id].x,
                    top: positions[item.id].y,
                  }}
                  onClick={() => setSelected(item.id)}
                  aria-pressed={selected === item.id}
                >
                  <Icon size={21} />
                  <span>
                    <small>{item.type}</small>
                    <strong>{item.label}</strong>
                  </span>
                  <i className="graph-port" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="graph-inspector">
        {node && (
          <>
            <div className="live-eyebrow">Selected node · {node.id}</div>
            <label>
              Node label
              <input
                maxLength={120}
                value={node.label}
                disabled={readOnly}
                onChange={(e) => updateNode({ label: e.target.value })}
              />
            </label>
            <label>
              Node type
              <select
                aria-label="Node type"
                value={node.type}
                disabled={readOnly}
                onChange={(e) => updateNode({ type: e.target.value })}
              >
                {Object.keys(icons).map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            {!readOnly && value.nodes.length > 1 && (
              <button
                className="live-secondary"
                type="button"
                onClick={() => {
                  onChange({
                    nodes: value.nodes.filter((item) => item.id !== selected),
                    edges: value.edges.filter(
                      (edge) =>
                        edge.source !== selected && edge.target !== selected,
                    ),
                  });
                  setSelected(
                    value.nodes.find((item) => item.id !== selected)?.id,
                  );
                }}
              >
                Remove node
              </button>
            )}
          </>
        )}
        {!readOnly && (
          <div className="graph-controls">
            <button
              className="live-secondary"
              type="button"
              disabled={value.nodes.length >= 50}
              onClick={() => {
                const id = crypto.randomUUID();
                onChange({
                  ...value,
                  nodes: [
                    ...value.nodes,
                    { id, label: "New action", type: "action" },
                  ],
                });
                setSelected(id);
              }}
            >
              Add node
            </button>
            <div className="graph-connect">
              <label>
                From
                <select
                  aria-label="From"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Choose node</option>
                  {value.nodes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select
                  aria-label="To"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Choose node</option>
                  {value.nodes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="live-secondary"
                type="button"
                disabled={
                  !source ||
                  !target ||
                  source === target ||
                  value.edges.length >= 100
                }
                onClick={connect}
              >
                Connect
              </button>
            </div>
            {value.edges.map((edge) => (
              <div className="graph-link" key={`${edge.source}:${edge.target}`}>
                <span>
                  {value.nodes.find((n) => n.id === edge.source)?.label} →{" "}
                  {value.nodes.find((n) => n.id === edge.target)?.label}
                </span>
                <button
                  type="button"
                  aria-label={`Remove connection ${edge.source} to ${edge.target}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      edges: value.edges.filter((item) => item !== edge),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
