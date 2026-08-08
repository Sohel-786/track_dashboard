import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/env";

export const SESSION_COOKIE = "track_session";
/** Session valid for 30 days. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  sub: string;
  username: string;
  name: string;
  role: "admin" | "user";
};

function getSecretKey() {
  return new TextEncoder().encode(getAuthSecret());
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({
    username: payload.username,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || typeof payload.username !== "string") return null;
    const role = payload.role === "admin" ? "admin" : "user";
    return {
      sub: payload.sub,
      username: payload.username,
      name: typeof payload.name === "string" ? payload.name : payload.username,
      role,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
