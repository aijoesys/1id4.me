import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  return process.env.JWT_SECRET || "id4me-development-secret";
}

export function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeHandle(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createProfileSession(profileId: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${profileId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function readProfileSession(token?: string) {
  if (!token) return undefined;
  const [profileIdText, expiresText, signature] = token.split(".");
  if (!profileIdText || !expiresText || !signature) return undefined;
  const payload = `${profileIdText}.${expiresText}`;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
  const profileId = Number(profileIdText);
  const expiresAt = Number(expiresText);
  if (!Number.isInteger(profileId) || expiresAt < Math.floor(Date.now() / 1000)) return undefined;
  return profileId;
}

export function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  const item = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

export const PROFILE_SESSION_COOKIE = "id4me_profile_session";
