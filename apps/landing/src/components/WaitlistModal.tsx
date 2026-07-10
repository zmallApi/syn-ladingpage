import { useEffect, useState } from "react";
import type { WaitlistFormData } from "../lib/waitlist";
import {
  DATABASE_OPTIONS,
  INTENDED_USE_OPTIONS,
  submitWaitlist,
} from "../lib/waitlist";

interface WaitlistModalProps {
  open: boolean;
  onClose: () => void;
}

const initialForm: WaitlistFormData = {
  name: "",
  email: "",
  company: "",
  database: "",
  intendedUse: "",
};

export function WaitlistModal({ open, onClose }: WaitlistModalProps) {
  const [form, setForm] = useState<WaitlistFormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof WaitlistFormData, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  function update(field: keyof WaitlistFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof WaitlistFormData, string>> = {};
    if (!form.name.trim()) next.name = "Informe seu nome";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = "Informe um e-mail válido";
    }
    if (!form.database) next.database = "Selecione um banco de dados";
    if (!form.intendedUse) next.intendedUse = "Selecione como pretende usar";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);
    setSubmitting(true);

    try {
      await submitWaitlist(form);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm(initialForm);
    setErrors({});
    setSubmitted(false);
    setSubmitError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface-card card-glow"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-cyan">Acesso Beta</p>
            <h2 id="waitlist-title" className="mt-1 text-lg font-semibold text-white">
              Solicitar acesso Beta
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-surface-raised hover:text-white"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="overflow-y-auto px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green/10">
              <svg className="h-7 w-7 text-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white">Solicitação recebida!</h3>
            <p className="mt-2 text-sm text-slate-400">
              Você está na fila do Beta. Entraremos em contato com seu acesso antecipado.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 rounded-xl cyan-gradient px-6 py-2.5 text-sm font-semibold text-surface"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5">
            <p className="mb-5 text-sm text-slate-400">
              Deixe seus dados e receba acesso antecipado ao Beta do Synapsee IA.
            </p>

            <div className="space-y-4">
              <Field label="Nome" error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Seu nome"
                  className={inputClass(errors.name)}
                />
              </Field>

              <Field label="E-mail" error={errors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="voce@empresa.com"
                  className={inputClass(errors.email)}
                />
              </Field>

              <Field label="Empresa (opcional)">
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => update("company", e.target.value)}
                  placeholder="Nome da empresa"
                  className={inputClass()}
                />
              </Field>

              <OptionGroup
                label="Qual banco de dados você gostaria de conectar?"
                options={DATABASE_OPTIONS}
                value={form.database}
                error={errors.database}
                onChange={(value) => update("database", value)}
              />

              <OptionGroup
                label="Como pretende usar?"
                options={INTENDED_USE_OPTIONS}
                value={form.intendedUse}
                error={errors.intendedUse}
                onChange={(value) => update("intendedUse", value)}
              />
            </div>

            {submitError && (
              <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                {submitError}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-border-bright hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface transition hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Enviando..." : "Quero testar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

function OptionGroup({
  label,
  options,
  value,
  error,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-slate-400">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                selected
                  ? "border-cyan/50 bg-cyan/10 text-cyan"
                  : "border-border bg-surface-raised text-slate-400 hover:border-border-bright hover:text-slate-200"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </fieldset>
  );
}

function inputClass(error?: string) {
  return `w-full rounded-lg border bg-surface-raised px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-cyan/50 focus:ring-1 focus:ring-cyan/25 ${
    error ? "border-red-500/50" : "border-border"
  }`;
}
