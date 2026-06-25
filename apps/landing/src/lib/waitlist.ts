export interface WaitlistFormData {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

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
