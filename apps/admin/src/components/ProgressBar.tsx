export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan to-purple transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
