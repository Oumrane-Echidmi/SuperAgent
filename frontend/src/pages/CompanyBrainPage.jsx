import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  BrainCircuit,
  Clock,
  LayoutGrid,
  Palette,
  Quote,
  Sparkles,
} from "lucide-react";
import Page from "../components/Page";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import {
  brainCards,
  brainGraphAltNodes,
  brainGraphEdges,
  brainGraphNodes,
  observations,
  reviewItems,
} from "../data/brain";

const cardIcons = {
  product: Box,
  company: BookOpen,
  brand: Palette,
  voice: Quote,
};

function GraphNode({ node }) {
  return (
    <div
      className={`brain-node ${node.variant ? `brain-node--${node.variant}` : ""}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
    >
      <div className="brain-node-head">
        <span className="brain-node-dot" style={{ background: node.color }} />
        <span>{node.title}</span>
      </div>
      <div className="brain-node-fields">
        {node.fields.map(([label, value]) => (
          <div className="brain-node-field" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrainGraph({ alt = false, expanded = false }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const nodes = alt ? brainGraphAltNodes : brainGraphNodes;

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const update = () => {
      const padding = expanded ? 70 : 54;
      const next = Math.min(
        (element.clientWidth - padding) / 1200,
        (element.clientHeight - padding) / 300,
        expanded ? 1.8 : 1.05,
      );
      setScale(Math.max(0.42, next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));

  return (
    <div className="brain-graph-viewport" ref={wrapRef}>
      <div
        className="brain-graph-stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <svg
          aria-hidden="true"
          className="brain-graph-edges"
          preserveAspectRatio="none"
          viewBox="0 0 1200 300"
        >
          {brainGraphEdges.map((edge, index) => {
            const from = byId[edge.from];
            const to = byId[edge.to];
            if (!from || !to) return null;
            const x1 = from.x + from.w / 2;
            const y1 = from.y + from.h;
            const x2 = to.x + to.w / 2;
            const y2 = to.y;
            const bend = Math.max(16, (y2 - y1) * 0.5);
            return (
              <path
                d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`}
                fill="none"
                key={`${edge.from}-${edge.to}-${index}`}
                stroke={edge.color}
                strokeWidth="1"
              />
            );
          })}
        </svg>
        {nodes.map((node) => (
          <GraphNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

export default function CompanyBrainPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeCard, setActiveCard] = useState(null);
  const [noticedOpen, setNoticedOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [altLayout, setAltLayout] = useState(false);

  const autoLayout = () => {
    setAltLayout((value) => !value);
    toast("Graph layout refreshed.");
  };

  return (
    <Page
      icon={BrainCircuit}
      title="Company Brain"
      count={brainCards.length}
      subtitle="Your organization's trusted profile, grounded in evidence."
    >
      <div className="brain-content">
        <div className="brain-cards">
          {brainCards.map((card) => {
            const Icon = cardIcons[card.icon];
            return (
              <button
                className="brain-card"
                key={card.id}
                onClick={() => setActiveCard(card)}
                type="button"
              >
                <div className="brain-card-top">
                  <span className="brain-card-icon">
                    <Icon size={19} strokeWidth={1.7} />
                  </span>
                  <span className="brain-card-updated">{card.updated}</span>
                </div>
                <div className="brain-card-text">
                  <h2>{card.title}</h2>
                  <p>{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <button className="brain-banner" onClick={() => navigate("/inbox")} type="button">
          <span className="brain-banner-icon brain-banner-icon--purple">
            <Sparkles size={14} />
          </span>
          <span className="brain-banner-copy">
            <strong>3 things to review</strong>
            <span className="brain-banner-metrics">
              {reviewItems.map((item, index) => (
                <span key={item.label}>
                  {index > 0 ? <span className="brain-metric-dot">·</span> : null}
                  {item.label} {item.percent}%
                </span>
              ))}
            </span>
          </span>
          <span className="brain-banner-link">
            Review in Inbox
            <ArrowRight size={13} />
          </span>
        </button>

        <button
          className="brain-banner"
          onClick={() => setNoticedOpen(true)}
          type="button"
        >
          <span className="brain-banner-icon">
            <Sparkles size={14} />
          </span>
          <span className="brain-banner-copy">
            <strong>What the brain noticed</strong>
            <span className="brain-banner-sub">
              The running log of observations from your conversations.
            </span>
          </span>
          <span className="brain-banner-arrow">
            <ArrowUpRight size={14} />
          </span>
        </button>

        <div className="brain-graph-card">
          <button
            className="brain-graph-action brain-graph-action--expand"
            onClick={() => setExpanded(true)}
            type="button"
          >
            Expand
            <ArrowUpRight size={13} />
          </button>
          <BrainGraph alt={altLayout} />
          <button
            className="brain-graph-action brain-graph-action--layout"
            onClick={autoLayout}
            type="button"
          >
            <LayoutGrid size={13} />
            Auto layout
          </button>
        </div>
      </div>

      <Modal
        description={activeCard?.description}
        footer={
          <>
            <button className="btn btn--subtle" onClick={() => setActiveCard(null)} type="button">
              Close
            </button>
            <button
              className="btn btn--light"
              onClick={() => {
                setActiveCard(null);
                navigate("/docs");
              }}
              type="button"
            >
              Open in Docs
              <ArrowUpRight size={13} />
            </button>
          </>
        }
        onClose={() => setActiveCard(null)}
        open={Boolean(activeCard)}
        title={activeCard?.title}
      >
        {activeCard ? (
          <div className="brain-detail">
            <div className="brain-detail-meta">
              <span className="badge badge--green">
                <span className="dot" />
                {activeCard.confidence}% confidence
              </span>
              <span className="brain-detail-updated">
                <Clock size={12} />
                {activeCard.updated}
              </span>
            </div>
            <div className="brain-facts">
              {activeCard.facts.map(([label, value]) => (
                <div className="brain-fact" key={label}>
                  <span>{label}</span>
                  <p>{value}</p>
                </div>
              ))}
            </div>
            <p className="brain-detail-note">
              Every fact is tied to a source. Open Docs to inspect the evidence or correct
              something the brain should know.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        description="A running log of patterns, gaps, and contradictions found while agents work."
        footer={
          <button className="btn btn--subtle" onClick={() => setNoticedOpen(false)} type="button">
            Close
          </button>
        }
        onClose={() => setNoticedOpen(false)}
        open={noticedOpen}
        title="What the brain noticed"
        wide
      >
        <div className="observation-list">
          {observations.map((item) => (
            <div className="observation" key={item.id}>
              <span className="observation-icon">
                <Sparkles size={13} />
              </span>
              <div className="observation-copy">
                <div className="observation-head">
                  <strong>{item.title}</strong>
                  <span>{item.time}</span>
                </div>
                <p>{item.detail}</p>
                <span className="observation-source">{item.source}</span>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        className="modal--graph"
        description="Every profile card traced back to the rows and conversations behind it."
        footer={
          <>
            <button className="btn btn--subtle" onClick={autoLayout} type="button">
              <LayoutGrid size={13} />
              Auto layout
            </button>
            <button className="btn btn--light" onClick={() => setExpanded(false)} type="button">
              Close
            </button>
          </>
        }
        onClose={() => setExpanded(false)}
        open={expanded}
        title="Company Brain graph"
      >
        <BrainGraph alt={altLayout} expanded />
      </Modal>
    </Page>
  );
}
