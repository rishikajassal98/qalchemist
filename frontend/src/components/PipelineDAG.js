import { Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Search, ListChecks, ShieldAlert, Code2, PlayCircle, Wrench, FileBarChart, PlayCircle as Play, Square, RotateCcw } from "lucide-react";
import { STAGES, STAGE_META, EDGE_HANDOFF } from "@/api";
import { Button } from "@/components/ui/button";

const ICONS = {
  EXPLORE: Search, PLAN: ListChecks, EVALUATE: ShieldAlert, GENERATE: Code2,
  RUN: PlayCircle, HEAL: Wrench, REPORT: FileBarChart,
};

// stages without their own workspace tab jump to the closest relevant one
const STAGE_TAB = {
  EXPLORE: "plan", PLAN: "plan", EVALUATE: "eval", GENERATE: "code",
  RUN: "exec", HEAL: "heal", REPORT: "report",
};

// reverse map: which single stage "owns" the active-node highlight for a given tab — EXPLORE and
// PLAN both navigate to the "plan" tab, but only one node should ever show as active at a time
const TAB_OWNER_STAGE = {
  plan: "PLAN", eval: "EVALUATE", code: "GENERATE", exec: "RUN", heal: "HEAL", report: "REPORT",
};

// fixed connector-column width in the grid track list below — a real px value (not a Tailwind
// class) because the same number has to appear in both the CSS grid-template-columns string and
// the label's max-width, so the two can never drift out of sync on resize.
const CONNECTOR_PX = 44;
const BOX_MIN_PX = 132;

// interleave 7 flexible box columns with 6 fixed connector columns: box, gap, box, gap, ... box.
// Doing this as one grid (instead of a flex row + separately-positioned connector divs) is what
// guarantees every edge meets its box's actual left/right border at any viewport width — a flex
// row with a fixed-width filler div can only approximate that, and drifts if a box's content
// forces it wider than its neighbors.
const GRID_TEMPLATE_COLUMNS = STAGES
  .map(() => `minmax(${BOX_MIN_PX}px, 1fr)`)
  .join(` ${CONNECTOR_PX}px `);

function fmtDur(ms) {
  if (ms == null) return "done";
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function edgeFired(handoffs, edge) {
  if (!edge) return false;
  return (handoffs || []).some((h) => h.from === edge.from && h.to === edge.to && h.artifact === edge.artifact);
}

const ACTIVE = ["queued", "running", "paused"];
const TERMINAL = ["completed", "failed", "aborted"];

function StageNode({ stage, stageStatus, stageDuration, activeTab, onStageClick }) {
  const status = stageStatus[stage] || "pending";
  const meta = STAGE_META[stage];
  const Icon = ICONS[stage];
  const done = status === "done";
  const running = status === "running";
  const tab = STAGE_TAB[stage];
  const isActiveTab = TAB_OWNER_STAGE[activeTab] === stage;
  return (
    <button data-testid={`dag-node-${stage.toLowerCase()}`} type="button"
      onClick={() => onStageClick?.(tab)}
      className={`relative w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${
        running ? `${meta.border} ${meta.bg} ${meta.ring}` :
        done ? `border-slate-700 bg-[#0f1725] hover:border-slate-600` : "border-slate-800 bg-[#0a0f18] hover:border-slate-700"} ${
        isActiveTab ? "ring-2 ring-inset ring-cyan-400/70" : ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
          running ? meta.bg : done ? "bg-emerald-500/15" : "bg-slate-800/60"}`}>
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.span key="done" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={3} />
              </motion.span>
            ) : running ? (
              <motion.span key="running" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Loader2 className={`w-3.5 h-3.5 ${meta.text} animate-spin`} />
              </motion.span>
            ) : (
              <motion.span key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Icon className="w-3.5 h-3.5 text-slate-600" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0">
          <div className={`font-heading text-[13px] font-semibold leading-none truncate ${
            running ? meta.text : done ? "text-slate-200" : "text-slate-600"}`}>{stage}</div>
          <div className={`font-mono text-[9px] mt-0.5 truncate ${running ? meta.text : done ? "text-slate-400" : "text-slate-600"}`}>
            {meta.agent}
          </div>
          <div className="font-mono text-[9px] text-slate-500 truncate">
            {running ? "running…" : done ? fmtDur(stageDuration[stage]) : "pending"}
          </div>
        </div>
      </div>
      {running && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-xl">
          <div className={`h-full w-1/3 ${meta.dot} animate-beam`} />
        </div>
      )}
    </button>
  );
}

function Connector({ labeled, label }) {
  return (
    <div className="relative self-stretch flex items-center" aria-hidden={!labeled}>
      <div className={`h-0.5 w-full transition-colors duration-500 ${labeled ? "bg-emerald-500/40" : "bg-slate-800"}`} />
      {labeled && (
        // centered under the connector itself (not left-anchored in normal flow), and capped to a
        // little wider than the connector column so it can never bleed into the neighboring boxes
        <span
          className="absolute left-1/2 -translate-x-1/2 top-[calc(50%+4px)] font-mono text-[8px] text-slate-500 text-center leading-tight"
          style={{ width: CONNECTOR_PX + 56 }}>
          {label}
        </span>
      )}
    </div>
  );
}

export default function PipelineDAG({ stageStatus, stageDuration, run, awaiting, onResume, onAbort, onRerun, activeTab, onStageClick, handoffs }) {
  return (
    <div data-testid="pipeline-dag-container" className="p-4 border-b border-slate-800/80 bg-[#0b101c] shrink-0">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 shrink-0">State Machine</span>
          {run && <span className="font-mono text-[11px] text-slate-400 truncate">· {run.url}</span>}
          {run?.auth_mode === "authenticated" && (
            <span className="shrink-0 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-950/60 text-amber-300 text-[9px] font-mono uppercase">authenticated</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {awaiting && (
            <Button data-testid="resume-run-button" onClick={onResume} size="sm"
              className="h-7 bg-amber-500 hover:bg-amber-400 text-[#07090e] font-semibold text-xs animate-pulse">
              <Play className="w-3 h-3 mr-1" /> Approve Plan & Resume
            </Button>
          )}
          {ACTIVE.includes(run?.status) && (
            <Button data-testid="abort-run-button" onClick={onAbort} size="sm" variant="outline"
              className="h-7 border-rose-500/40 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 hover:text-rose-200 text-xs">
              <Square className="w-3 h-3 mr-1 fill-current" /> Abort
            </Button>
          )}
          {TERMINAL.includes(run?.status) && (
            <Button data-testid="rerun-run-button" onClick={onRerun} size="sm" variant="outline"
              className="h-7 border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-200 text-xs">
              <RotateCcw className="w-3 h-3 mr-1" /> Rerun
            </Button>
          )}
        </div>
      </div>

      {/* px/py give the active-node ring (ring-offset) and hover lift room so they aren't
          clipped by this row's own overflow-x-auto — per spec, overflow-x:auto forces
          overflow-y to auto too, so vertical space here must come from padding, not overflow-y:visible.
          One CSS grid (rather than a flex row + separately-sized connector divs) is what keeps every
          box the same width and every edge meeting its box's true border at any viewport size. */}
      <div className="overflow-x-auto px-2 py-1 pb-4">
        <div className="grid items-stretch gap-0" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
          {STAGES.map((stage, i) => {
            const edge = EDGE_HANDOFF[stage];
            const labeled = edgeFired(handoffs, edge);
            return (
              <Fragment key={stage}>
                <StageNode stage={stage} stageStatus={stageStatus} stageDuration={stageDuration}
                  activeTab={activeTab} onStageClick={onStageClick} />
                {i < STAGES.length - 1 && (
                  <Connector labeled={labeled} label={edge?.artifact} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
