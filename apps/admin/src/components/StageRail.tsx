const STAGES = [
  { id: 1, label: "Conexão" },
  { id: 2, label: "Schema" },
  { id: 3, label: "Gerar" },
  { id: 4, label: "Testar" },
];

export function StageRail({ current }: { current: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {STAGES.map((s) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <div
            key={s.id}
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition sm:px-3 ${
              active
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : done
                  ? "border-green/30 bg-green/5 text-green"
                  : "border-border text-slate-500"
            }`}
          >
            <span className="shrink-0 font-mono">{String(s.id).padStart(2, "0")}</span>
            <span className="truncate">{s.label}</span>
            {done && <span className="ml-auto shrink-0">✓</span>}
          </div>
        );
      })}
    </div>
  );
}
