export interface WaitlistPayload {
  name: string;
  email: string;
  company?: string;
  useCase?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatWaitlistMessage(data: WaitlistPayload): string {
  const lines = [
    "🆕 <b>Novo lead — Synapse</b>",
    "",
    `<b>Nome:</b> ${escapeHtml(data.name.trim())}`,
    `<b>E-mail:</b> ${escapeHtml(data.email.trim())}`,
  ];

  if (data.company?.trim()) {
    lines.push(`<b>Empresa:</b> ${escapeHtml(data.company.trim())}`);
  }
  if (data.useCase?.trim()) {
    lines.push(`<b>Uso:</b> ${escapeHtml(data.useCase.trim())}`);
  }

  lines.push(
    "",
    `📅 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
  );

  return lines.join("\n");
}

export async function sendTelegramMessage(
  text: string,
  token: string,
  chatId: string,
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram: ${res.status} ${body}`);
  }
}

export function validatePayload(body: unknown): WaitlistPayload | null {
  if (!body || typeof body !== "object") return null;

  const { name, email, company, useCase } = body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return {
    name: name.trim(),
    email: email.trim(),
    company: typeof company === "string" ? company : undefined,
    useCase: typeof useCase === "string" ? useCase : undefined,
  };
}
