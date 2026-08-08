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

const schema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("Username and password are required");
    }

    await connectDB();
    const username = normalizeUsername(parsed.data.username);
    const user = await User.findOne({ username });

    if (!user || !user.isActive) {
      return fail("Invalid credentials", 401);
    }

    const valid = await verifyPassword(
      parsed.data.password,
      user.passwordHash
    );
    if (!valid) {
      return fail("Invalid credentials", 401);
    }

    const token = await createSessionToken({
      sub: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role as "admin" | "user",
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
    const message =
      error instanceof Error && /ECONNREFUSED|ServerSelectionError/i.test(error.message)
        ? "Database unavailable. Start MongoDB or set a valid MONGODB_URI in .env.local."
        : "Unable to login";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
