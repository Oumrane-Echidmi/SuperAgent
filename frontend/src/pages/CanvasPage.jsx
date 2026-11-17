import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Image as ImageIcon,
  Maximize,
  Minus,
  Palette,
  Play,
  Plus,
  StickyNote,
  Terminal,
  Video,
} from "lucide-react";
import Page from "../components/Page";
import Modal from "../components/Modal";
import { canvasEdges, canvasNodes } from "../data/canvas";

const WORLD = { w: 1600, h: 960 };

const kindMeta = {
  notes: { icon: StickyNote, tone: "muted" },
  prompt: { icon: Terminal, tone: "muted" },
  image: { icon: ImageIcon, tone: "muted" },
  generate: { icon: ImageIcon, tone: "blue" },
  video: { icon: Video, tone: "purple" },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function CanvasNodeView({ node, position, dragging, onDragStart, onPreview }) {
  const meta = kindMeta[node.kind];
  const Icon = meta.icon;
  const style = {
    left: position.x,
    top: position.y,
    width: node.w,
    height: node.h,
  };

  const head = (
    <div
      className="canvas-node-head"
      onPointerDown={(event) => onDragStart(event, node)}
      title="Drag to move"
    >
      <span className={`canvas-node-label canvas-node-label--${meta.tone}`}>
        <Icon size={10} strokeWidth={1.8} />
        {node.title}
      </span>
    </div>
  );

  return (
    <article
      className={`canvas-node canvas-node--${node.kind} ${
        dragging ? "is-dragging" : ""
      }`}
      style={style}
    >
      {node.kind === "notes" ? (
        <>
          {head}
          <p className="canvas-note-text">{node.text}</p>
        </>
      ) : null}

      {node.kind === "prompt" ? (
        <>
          {head}
          <p className="canvas-prompt-text">{node.text}</p>
        </>
      ) : null}

      {node.kind === "image" ? (
        <>
          {head}
          <div className="canvas-image-body">
            <button
              aria-label={`Preview ${node.title} ${node.index}`}
              className={`canvas-art art--${node.art}`}
              onClick={() =>
                onPreview({
                  title: node.previewTitle,
                  description: node.previewDescription,
                  art: node.art,
                })
              }
              type="button"
            >
              <span className="canvas-art-index">{node.index}</span>
            </button>
          </div>
        </>
      ) : null}

      {node.kind === "generate" ? (
        <>
          {head}
          <div className="canvas-gen-grid">
            {node.items.map((item) => (
              <button
                className={`canvas-thumb ${item.tall ? "canvas-thumb--tall" : ""}`}
                key={item.id}
                onClick={() =>
                  onPreview({
                    title: item.previewTitle || item.label,
                    description:
                      item.previewDescription ||
                      `Generated from the prompt above with ${node.footer.model}.`,
                    art: item.art,
                  })
                }
                type="button"
              >
                <span className={`canvas-art art--${item.art}`} />
                <span className="canvas-thumb-label">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="canvas-gen-footer">
            <span className="canvas-model">{node.footer.model}</span>
            <span className="canvas-gen-meta">
              <span>
                <Copy size={9} />
                {node.footer.count}
              </span>
              <span className="canvas-ratio">
                <span className="canvas-ratio-glyph" />
                {node.footer.ratio}
              </span>
            </span>
          </div>
        </>
      ) : null}

      {node.kind === "video" ? (
        <>
          {head}
          <div className="canvas-video-body">
            <button
              aria-label={`Preview ${node.previewTitle}`}
              className={`canvas-art art--${node.art}`}
              onClick={() =>
                onPreview({
                  title: node.previewTitle,
                  description: node.previewDescription,
                  art: node.art,
                })
              }
              type="button"
            >
              <span className="canvas-play">
                <Play size={15} fill="currentColor" />
              </span>
            </button>
          </div>
          <div className="canvas-gen-footer">
            <span className="canvas-model">{node.footer.model}</span>
            <span className="canvas-gen-meta">
              <span>
                <Copy size={9} />
                {node.footer.count}
              </span>
              <span className="canvas-ratio">
                <span className="canvas-ratio-glyph" />
                {node.footer.ratio}
              </span>
            </span>
          </div>
        </>
      ) : null}
    </article>
  );
}

export default function CanvasPage() {
  const viewportRef = useRef(null);
  const panRef = useRef(null);
  const [viewport, setViewport] = useState({ w: 1600, h: 980 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [positions, setPositions] = useState(() =>
    Object.fromEntries(
      canvasNodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    ),
  );
  const [dragging, setDragging] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const update = () =>
      setViewport({ w: element.clientWidth, h: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = Math.max(
    0.3,
    Math.min((viewport.w - 44) / WORLD.w, (viewport.h - 44) / WORLD.h, 1.12),
  );
  const scale = fit * zoom;

  const zoomBy = (factor) =>
    setZoom((current) => clamp(current * factor, 0.35, 2.6));

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".canvas-node, .canvas-controls")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setPanning(true);
  };

  const handlePointerMove = (event) => {
    if (!panRef.current) return;
    setPan({
      x: panRef.current.panX + event.clientX - panRef.current.pointerX,
      y: panRef.current.panY + event.clientY - panRef.current.pointerY,
    });
  };

  const endPan = (event) => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const startNodeDrag = (event, node) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      nodeX: positions[node.id].x,
      nodeY: positions[node.id].y,
    };
    const scaleAtStart = scale;
    setDragging(node.id);

    const onMove = (moveEvent) => {
      setPositions((current) => ({
        ...current,
        [node.id]: {
          x: clamp(
            start.nodeX + (moveEvent.clientX - start.pointerX) / scaleAtStart,
            -node.w + 70,
            WORLD.w - 70,
          ),
          y: clamp(
            start.nodeY + (moveEvent.clientY - start.pointerY) / scaleAtStart,
            -40,
            WORLD.h - 70,
          ),
        },
      }));
    };

    const onUp = () => {
      setDragging(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const nodeById = Object.fromEntries(canvasNodes.map((node) => [node.id, node]));

  return (
    <Page
      bodyClassName="canvas-page-body"
      flush
      icon={Palette}
      title="Canvas"
    >
      <div
        className={`canvas-viewport ${panning ? "is-panning" : ""}`}
        onPointerCancel={endPan}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onWheel={(event) => {
          if (!event.deltaY) return;
          zoomBy(event.deltaY > 0 ? 0.92 : 1.08);
        }}
        ref={viewportRef}
      >
        <div
          className="canvas-stage"
          style={{
            width: WORLD.w,
            height: WORLD.h,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          <svg
            aria-hidden="true"
            className="canvas-edge-svg"
            height={WORLD.h}
            viewBox={`0 0 ${WORLD.w} ${WORLD.h}`}
            width={WORLD.w}
          >
            {canvasEdges.map((edge, index) => {
              const from = nodeById[edge.from];
              const to = nodeById[edge.to];
              if (!from || !to) return null;
              const fromPosition = positions[edge.from];
              const toPosition = positions[edge.to];
              const x1 = fromPosition.x + from.w;
              const y1 = fromPosition.y + from.h * (edge.fromOffset ?? 0.5);
              const x2 = toPosition.x;
              const y2 = toPosition.y + to.h * (edge.toOffset ?? 0.5);
              const bend = Math.max(55, Math.abs(x2 - x1) * 0.44);
              return (
                <path
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  key={`${edge.from}-${edge.to}-${index}`}
                  stroke={edge.color}
                  strokeLinecap="round"
                  strokeWidth="1.4"
                />
              );
            })}
          </svg>

          {canvasNodes.map((node) => (
            <CanvasNodeView
              dragging={dragging === node.id}
              key={node.id}
              node={node}
              onDragStart={startNodeDrag}
              onPreview={setPreview}
              position={positions[node.id]}
            />
          ))}
        </div>

        <div
          className="canvas-controls"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="Zoom out"
            className="canvas-control-btn"
            onClick={() => zoomBy(0.87)}
            title="Zoom out"
            type="button"
          >
            <Minus />
          </button>
          <button
            aria-label="Reset zoom"
            className="canvas-zoom-value"
            onClick={resetView}
            title="Reset view"
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            className="canvas-control-btn"
            onClick={() => zoomBy(1.15)}
            title="Zoom in"
            type="button"
          >
            <Plus />
          </button>
          <span className="canvas-control-divider" />
          <button
            aria-label="Fit canvas"
            className="canvas-control-btn"
            onClick={resetView}
            title="Fit to view"
            type="button"
          >
            <Maximize />
          </button>
        </div>
      </div>

      <Modal
        description={preview?.description}
        footer={
          <button className="btn btn--light" onClick={() => setPreview(null)} type="button">
            Close
          </button>
        }
        onClose={() => setPreview(null)}
        open={Boolean(preview)}
        title={preview?.title}
        wide
      >
        {preview ? (
          <div className={`canvas-art canvas-preview-art art--${preview.art}`} />
        ) : null}
      </Modal>
    </Page>
  );
}
