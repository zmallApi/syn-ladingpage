import { createHmac, timingSafeEqual } from "node:crypto";
import type { MembershipRole } from "@synapse/storage";

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: MembershipRole;
  exp: number;
  iat: number;
}

function b64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat, exp: iat + ttlSeconds };
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const body = b64urlJson(full);
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${b64url(sig)}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  let got: Buffer;
  try {
    got = Buffer.from(
      sig.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
  } catch {
    return null;
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return null;
  }
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as JwtPayload;
    if (!payload.sub || !payload.tenantId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
