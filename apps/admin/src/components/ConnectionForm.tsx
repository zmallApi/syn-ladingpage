import type { CreateProjectInput, DatabaseEngine } from "../lib/types";
import { ENGINE_OPTIONS } from "../lib/types";

const DEFAULTS: CreateProjectInput = {
  name: "",
  engine: "postgresql",
  host: "localhost",
  port: 5432,
  database: "",
  username: "",
  password: "",
  readOnly: true,
};

export function ConnectionForm({
  value,
  onChange,
  disabled,
}: {
  value: CreateProjectInput;
  onChange: (next: CreateProjectInput) => void;
  disabled?: boolean;
}) {
  function set<K extends keyof CreateProjectInput>(key: K, v: CreateProjectInput[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-3">
      <Field label="Nome do sistema">
        <input
          className={inputClass}
          disabled={disabled}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="ERP Produção"
        />
      </Field>

      <Field label="Engine">
        <select
          className={inputClass}
          disabled={disabled}
          value={value.engine}
          onChange={(e) => {
            const engine = e.target.value as DatabaseEngine;
            const port =
              engine === "mongodb"
                ? 27017
                : engine === "sqlserver"
                  ? 1433
                  : engine === "oracle"
                    ? 1521
                    : engine === "mysql"
                      ? 3306
                      : 5432;
            onChange({ ...value, engine, port });
          }}
        >
          {ENGINE_OPTIONS.map((e) => (
            <option key={e.engine} value={e.engine}>
              {e.label}
              {e.status === "planned" ? " (em breve)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Host" className="sm:col-span-2">
          <input
            className={inputClass}
            disabled={disabled}
            value={value.host}
            onChange={(e) => set("host", e.target.value)}
            placeholder="db.cluster.internal"
          />
        </Field>
        <Field label="Porta">
          <input
            className={inputClass}
            disabled={disabled}
            type="number"
            value={value.port}
            onChange={(e) => set("port", Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="Database">
        <input
          className={inputClass}
          disabled={disabled}
          value={value.database}
          onChange={(e) => set("database", e.target.value)}
          placeholder="erp_core"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Usuário">
          <input
            className={inputClass}
            disabled={disabled}
            value={value.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="readonly"
          />
        </Field>
        <Field label="Senha">
          <input
            className={inputClass}
            disabled={disabled}
            type="password"
            value={value.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
          />
        </Field>
      </div>

      <label className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
        <span className="text-slate-400">Somente leitura</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => set("readOnly", !value.readOnly)}
          className={`h-5 w-9 rounded-full p-0.5 transition ${
            value.readOnly ? "bg-cyan/30" : "bg-border"
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full transition ${
              value.readOnly ? "translate-x-4 bg-cyan" : "translate-x-0 bg-slate-400"
            }`}
          />
        </button>
      </label>
    </div>
  );
}

export function emptyConnectionForm(): CreateProjectInput {
  return { ...DEFAULTS };
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-cyan/50 focus:ring-1 focus:ring-cyan/25 disabled:opacity-50";
