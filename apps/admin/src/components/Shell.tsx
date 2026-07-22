import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearApiKey, USE_MOCK } from "../lib/api";

const nav = [
  { to: "/projects", label: "Seus Sistemas" },
  { to: "/agents", label: "Agentes MCP" },
  { to: "/engines", label: "Engines" },
  { to: "/metrics", label: "Métricas" },
  { to: "/settings", label: "Configurações" },
];

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  function logout() {
    clearApiKey();
    navigate("/login", { replace: true });
  }

  const navLinks = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2.5 text-sm transition ${
              isActive
                ? "bg-cyan/10 text-cyan"
                : "text-slate-400 hover:bg-surface-card hover:text-white"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen min-w-0 bg-surface">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface-raised md:flex">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              Synapsee <span className="text-cyan">IA</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Admin</p>
          </div>
        </div>
        {navLinks}
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-slate-400 transition hover:border-border-bright hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-surface-raised shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="flex items-center gap-2.5">
                <img src="/favicon.svg" alt="" className="h-7 w-7" />
                <p className="text-sm font-semibold text-white">
                  Synapsee <span className="text-cyan">IA</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-400"
              >
                Fechar
              </button>
            </div>
            {navLinks}
            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-slate-400"
              >
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/80 px-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-slate-300 md:hidden"
              aria-label="Abrir menu"
              onClick={() => setMenuOpen(true)}
            >
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            </button>
            <p className="truncate font-mono text-[11px] text-slate-500 sm:text-xs">
              {USE_MOCK ? "modo mock" : "API · :3000"}
            </p>
          </div>
          <span className="shrink-0 rounded border border-green/30 bg-green/10 px-2 py-0.5 text-[10px] font-medium uppercase text-green">
            Online
          </span>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
