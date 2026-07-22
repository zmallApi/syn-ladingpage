import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { EngineInfo } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";

export function EnginesPage() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);

  useEffect(() => {
    api.listEngines().then(setEngines);
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-widest text-cyan">Engines</p>
      <h1 className="mt-1 mb-8 text-xl font-bold text-white sm:text-2xl">Adapters de banco</h1>
      <div className="space-y-3">
        {engines.map((e) => (
          <div
            key={e.engine}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-card px-3 py-3 card-glow sm:px-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{e.label}</p>
              <p className="font-mono text-[11px] text-slate-500">{e.engine}</p>
            </div>
            <span className="shrink-0">
              <StatusBadge status={e.status === "ready" ? "ok" : "pending"} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
