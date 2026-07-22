export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-xl text-sm text-slate-400">
          O Synapsee faz a IA entender como a sua empresa funciona.
        </p>
        <p className="shrink-0 text-xs text-slate-600">
          © {new Date().getFullYear()} Synapsee IA
        </p>
      </div>
    </footer>
  );
}
