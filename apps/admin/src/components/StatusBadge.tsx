export function StatusBadge({
  status,
}: {
  status:
    | "ok"
    | "active"
    | "pending"
    | "error"
    | "connected"
    | "connecting"
    | "online"
    | "offline";
}) {
  const styles: Record<string, string> = {
    ok: "border-green/30 bg-green/10 text-green",
    connected: "border-green/30 bg-green/10 text-green",
    online: "border-green/30 bg-green/10 text-green",
    active: "border-cyan/30 bg-cyan/10 text-cyan",
    connecting: "border-cyan/30 bg-cyan/10 text-cyan",
    pending: "border-border bg-surface text-slate-500",
    offline: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    error: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  const labels: Record<string, string> = {
    ok: "OK",
    connected: "Conectado",
    online: "Edge + banco OK",
    active: "Analisando",
    connecting: "Conectando",
    pending: "Pendente",
    offline: "Edge offline",
    error: "Banco indisponível",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
