import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AGENT_DISPLAY, HANDOFF_TAB, STAGE_META } from "@/api";

export default function HandoffFeed({ handoffs = [], live, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div data-testid="handoff-feed" className="px-4 py-2.5 border-b border-slate-800/80 bg-[#0b101c] shrink-0">
      <button type="button" data-testid="handoff-feed-toggle" onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 mb-1.5 group">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-slate-400">
          Agent Handoffs
        </span>
        {handoffs.length > 0 && (
          <span className="font-mono text-[9px] text-slate-600">{handoffs.length}</span>
        )}
        <ChevronDown className={`w-3 h-3 text-slate-500 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {!expanded ? null : handoffs.length === 0 ? (
        <div className="text-slate-600 text-xs">Awaiting first handoff…</div>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {handoffs.map((h, i) => {
            const last = i === handoffs.length - 1;
            const meta = STAGE_META[h.stage] || {};
            return (
              <button
                key={h.id || h.seq}
                data-testid={`handoff-chip-${h.seq}`}
                type="button"
                onClick={() => onSelect?.(HANDOFF_TAB[h.to] || "plan")}
                className={`shrink-0 rounded-lg border px-2 py-1 text-left transition-colors hover:border-slate-500 ${
                  meta.border || "border-slate-700"} ${meta.bg || "bg-slate-800/40"} ${
                  live && last ? "animate-pulse" : ""}`}
              >
                <div className={`text-[10px] font-semibold leading-tight ${meta.text || "text-slate-300"}`}>
                  {AGENT_DISPLAY[h.from] || h.from} → {AGENT_DISPLAY[h.to] || h.to}
                </div>
                <div className="font-mono text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                  {h.artifact} · {h.summary}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
