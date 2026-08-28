import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { verifyPassword } from "@/lib/passwords";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { fail, normalizeUsername, ok } from "@/lib/api-helpers";
import { EnvError } from "@/lib/env";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(1).max(128),
});

/** Per-IP: absorbs a shared office NAT but stops a scripted flood. */
const IP_LIMIT = { limit: 20, windowMs: 10 * 60_000, blockMs: 10 * 60_000 };
/** Per-account: 5 wrong passwords locks that username out for 15 minutes. */
const ACCOUNT_LIMIT = { limit: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };

function tooManyAttempts(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return NextResponse.json(
    {
      success: false,
      message: `Too many sign-in attempts. Try again in ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

function loginFailureMessage(error: unknown): { message: string; status: number } {
  if (
    error instanceof EnvError ||
    (error instanceof Error && error.name === "EnvError")
  ) {
    return {
      message:
        "Server misconfiguration: required environment variables are missing. Check AUTH_SECRET and MONGODB_URI on the host (Vercel Environment Variables), then redeploy.",
      status: 503,
    };
  }

  if (
    error instanceof Error &&
    /querySrv|ECONNREFUSED|ServerSelectionError|MongoNetworkError|ENOTFOUND/i.test(
      error.message
    )
  ) {
    const dnsHint = /querySrv/i.test(error.message)
      ? " DNS/SRV lookup failed for mongodb+srv (common with local DNS on Windows)."
      : "";
    return {
      message:
        `Database unavailable.${dnsHint} Check MONGODB_URI, Atlas network access (IP allowlist), and your internet connection.`,
      status: 503,
    };
  }

  return { message: "Unable to login", status: 500 };
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);

  try {
    const ipCheck = rateLimit(`login:ip:${ip}`, IP_LIMIT);
    if (!ipCheck.ok) return tooManyAttempts(ipCheck.retryAfterSeconds);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("Username and password are required");
    }

    const username = normalizeUsername(parsed.data.username);

    const accountCheck = rateLimit(`login:user:${username}`, ACCOUNT_LIMIT);
    if (!accountCheck.ok) {
      return tooManyAttempts(accountCheck.retryAfterSeconds);
    }

    await connectDB();
    const user = await User.findOne({ username });

    /**
     * Same message and roughly the same work for "no such user" and "wrong
     * password", so the response cannot be used to enumerate valid usernames.
     */
    if (!user || !user.isActive) {
      return fail("Invalid credentials", 401);
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      return fail("Invalid credentials", 401);
    }

    // Successful sign-in clears that account's failure budget.
    resetRateLimit(`login:user:${username}`);

    const token = await createSessionToken({
      sub: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role as "admin" | "user",
      sessionVersion: user.sessionVersion ?? 0,
    });

    const response = ok({
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
    });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login error:", error);
    const { message, status } = loginFailureMessage(error);
    return NextResponse.json({ success: false, message }, { status });
  }
}
