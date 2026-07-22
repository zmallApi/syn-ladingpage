import type { ResourceMeta } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

export function ResourceChecklist({
  resources,
  revealedCount,
  selected,
  selectable,
  onToggle,
}: {
  resources: ResourceMeta[];
  revealedCount: number;
  selected?: string[];
  selectable?: boolean;
  onToggle?: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {resources.map((r, i) => {
        const visible = i < revealedCount;
        const isSelected = selected?.includes(r.name);
        return (
          <button
            key={r.name}
            type="button"
            disabled={!selectable || !visible}
            onClick={() => onToggle?.(r.name)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
              visible ? "opacity-100" : "opacity-0"
            } ${
              selectable
                ? isSelected
                  ? "border border-cyan/40 bg-cyan/10"
                  : "border border-border bg-surface hover:border-border-bright"
                : "border border-transparent hover:bg-surface-raised"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  visible ? "bg-green/20 text-green" : "bg-surface text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="truncate font-mono text-slate-300">{r.name}</span>
              <span className="hidden shrink-0 text-[10px] text-slate-600 sm:inline">
                {r.kind}
              </span>
            </div>
            {visible && (
              <span className="ml-2 shrink-0">
                <StatusBadge status={isSelected || !selectable ? "ok" : "pending"} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
