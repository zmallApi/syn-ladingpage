export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4 font-mono text-[11px] text-slate-600">
          <span className="text-green">build ok · 1,42s</span>
          <span>latência p95 32ms</span>
          <span>uptime 99,998%</span>
          <span>agentes online: 3</span>
        </div>
        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} Synapsee IA. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
