import { Logo } from "./Logo";

export function Header({ onConnect }: { onConnect: () => void }) {
  return (
    <header className="fixed top-0 z-40 w-full border-b border-border/60 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="group flex items-center gap-2.5">
          <Logo className="h-7 w-7 transition group-hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.45)]" />
          <span className="text-base font-semibold tracking-tight text-white">
            Synapsee <span className="font-medium text-cyan">IA</span>
          </span>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
          <a href="#quem-precisa" className="transition hover:text-white">Quem precisa</a>
          <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
          <a href="#entregaveis" className="transition hover:text-white">Entregáveis</a>
          <a href="#planos" className="transition hover:text-white">Planos</a>
        </nav>

        <button
          type="button"
          onClick={onConnect}
          className="rounded-lg cyan-gradient px-4 py-2 text-sm font-semibold text-surface transition hover:brightness-110"
        >
          Solicitar acesso Beta
        </button>
      </div>
    </header>
  );
}
