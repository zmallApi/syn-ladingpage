export interface WaitlistFormData {
  name: string;
  email: string;
  company: string;
  database: string;
  intendedUse: string;
}

export const DATABASE_OPTIONS = [
  "PostgreSQL",
  "MySQL",
  "SQL Server (em breve)",
  "Oracle (em breve)",
  "Outro",
] as const;

export const INTENDED_USE_OPTIONS = [
  "Cursor",
  "Claude",
  "ChatGPT",
  "Windsurf",
  "Copilot",
  "Agente interno",
  "Ainda estou avaliando",
] as const;

const API_URL = import.meta.env.VITE_WAITLIST_API_URL || "/api/waitlist";

export async function submitWaitlist(data: WaitlistFormData): Promise<void> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Falha ao enviar cadastro");
  }
}
