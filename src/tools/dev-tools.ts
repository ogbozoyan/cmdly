/** Developer utilities: Base64, URL encoding, JWT decoding. Pure functions, unit-tested. */
import { t, type MessageKey } from "../i18n/index.ts";

const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder("utf-8", { fatal: true });

/** UTF-8 safe Base64 encoding (btoa alone breaks on non-Latin text). */
export function base64Encode(text: string): string {
  let bin = "";
  for (const byte of utf8.encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

/** Accepts standard and URL-safe alphabets, with or without padding. Null if not valid UTF-8 Base64. */
export function base64Decode(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  try {
    return utf8Strict.decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function urlDecode(text: string): string | null {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/;

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/** Decodes (does NOT verify) a JWT. Accepts an optional "Bearer " prefix. */
export function decodeJwt(token: string): DecodedJwt | null {
  const t = token.trim().replace(/^Bearer\s+/i, "");
  if (!JWT_PATTERN.test(t)) return null;
  const [header, payload] = t.split(".");
  try {
    return { header: JSON.parse(base64Decode(header)!), payload: JSON.parse(base64Decode(payload)!) };
  } catch {
    return null;
  }
}

/** "JWT payload · sub 42 · expires 2026-10-25 14:00" */
export function describeJwt(payload: Record<string, unknown>, now = Date.now()): string {
  const parts = [t("jwtPayload")];
  if (payload.sub) parts.push(`sub ${payload.sub}`);
  if (typeof payload.exp === "number") {
    const expired = payload.exp * 1000 < now;
    parts.push(t(expired ? "jwtExpiredShort" : "jwtExpiresShort", formatDate(payload.exp)));
  }
  return parts.join(" · ");
}

const TIME_CLAIMS: Record<string, MessageKey> = { iat: "jwtIssued", nbf: "jwtValidFrom", exp: "jwtExpires" };

/** Human-readable time claims for the preview panel: "Expires 2023-11-14 22:13 (expired)". */
export function jwtTimeNotes(payload: Record<string, unknown>, now = Date.now()): string[] {
  return Object.entries(TIME_CLAIMS)
    .filter(([claim]) => typeof payload[claim] === "number")
    .map(([claim, label]) => {
      const seconds = payload[claim] as number;
      const suffix = claim === "exp" && seconds * 1000 < now ? " " + t("jwtExpiredNote") : "";
      return t(label, formatDate(seconds)) + suffix;
    });
}

function formatDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
