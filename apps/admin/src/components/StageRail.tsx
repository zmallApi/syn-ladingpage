const STAGES = [
  { id: 1, label: "Conexão" },
  { id: 2, label: "Schema" },
  { id: 3, label: "Gerar" },
  { id: 4, label: "Testar" },
];

export function StageRail({
  current,
  maxReachable = current,
  onSelect,
}: {
  current: number;
  /** Highest step the user can jump to (inclusive). */
  maxReachable?: number;
  onSelect?: (step: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {STAGES.map((s) => {
        const done = current > s.id;
        const active = current === s.id;
        const reachable = s.id <= maxReachable && Boolean(onSelect);
        const className = `flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition sm:px-3 ${
          active
            ? "border-cyan/40 bg-cyan/10 text-cyan"
            : done
              ? "border-green/30 bg-green/5 text-green"
              : reachable
                ? "border-border text-slate-400 hover:border-cyan/30 hover:text-cyan"
                : "border-border text-slate-500"
        } ${reachable && !active ? "cursor-pointer" : ""}`;

        if (reachable && !active) {
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect?.(s.id)}
              className={`w-full text-left ${className}`}
            >
              <span className="shrink-0 font-mono">
                {String(s.id).padStart(2, "0")}
              </span>
              <span className="truncate">{s.label}</span>
              {done && <span className="ml-auto shrink-0">✓</span>}
            </button>
          );
        }

        return (
          <div key={s.id} className={className}>
            <span className="shrink-0 font-mono">
              {String(s.id).padStart(2, "0")}
            </span>
            <span className="truncate">{s.label}</span>
            {done && <span className="ml-auto shrink-0">✓</span>}
          </div>
        );
      })}
    </div>
  );
}
