import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  SESSION_COOKIE,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth-session";

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/auth-session";

/**
 * A signed token proves *who* asked, not that the account is still allowed in.
 * Deactivating a user or resetting their password has to take effect before the
 * 30-day token expires, so every authenticated request re-checks the account —
 * cached briefly so a page that fires six API calls does one lookup, not six.
 */
const ACCOUNT_CACHE_TTL_MS = 30_000;

type AccountState = { active: boolean; sessionVersion: number; role: string };

const accountCache = new Map<
  string,
  { state: AccountState | null; expiresAt: number }
>();

async function readAccountState(userId: string): Promise<AccountState | null> {
  const cached = accountCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  await connectDB();
  const user = await User.findById(userId)
    .select("isActive sessionVersion role")
    .lean();

  const state: AccountState | null = user
    ? {
        active: Boolean(user.isActive),
        sessionVersion: user.sessionVersion ?? 0,
        role: user.role,
      }
    : null;

  accountCache.set(userId, {
    state,
    expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS,
  });
  return state;
}

/** Drop the cached account state so a change applies on the next request. */
export function invalidateAccountCache(userId: string) {
  accountCache.delete(String(userId));
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Authenticated session for an account that still exists, is still active, and
 * has not had its sessions revoked since the token was minted.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }

  const account = await readAccountState(session.sub);
  if (!account || !account.active) {
    throw new AuthError("Unauthorized", 401);
  }
  if (account.sessionVersion !== session.sessionVersion) {
    throw new AuthError("Session expired — please sign in again.", 401);
  }

  // Role lives in the token but is authoritative in the database.
  return { ...session, role: account.role === "admin" ? "admin" : "user" };
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "admin") {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status }
    );
  }
  console.error(error);
  return NextResponse.json(
    { success: false, message: "Internal server error" },
    { status: 500 }
  );
}

export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
