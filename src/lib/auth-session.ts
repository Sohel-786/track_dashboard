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
  /**
   * Account's `sessionVersion` at sign-in. Server routes compare it against the
   * stored value so a password reset or deactivation invalidates tokens that
   * are otherwise still inside their 30-day life.
   */
  sessionVersion: number;
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
    sv: payload.sessionVersion,
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
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.username !== "string") return null;
    const role = payload.role === "admin" ? "admin" : "user";
    return {
      sub: payload.sub,
      username: payload.username,
      name: typeof payload.name === "string" ? payload.name : payload.username,
      role,
      sessionVersion: typeof payload.sv === "number" ? payload.sv : 0,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    /**
     * `strict` would drop the cookie on the first navigation in from anywhere
     * else (including a PWA launch through an external link) and bounce the
     * user to /login; `lax` still blocks cross-site POSTs, and the Origin check
     * in middleware covers the rest.
     */
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
