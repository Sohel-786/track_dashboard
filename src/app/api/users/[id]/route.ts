import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  authErrorResponse,
  createSessionToken,
  invalidateAccountCache,
  requireAdmin,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { fail, isObjectId, ok } from "@/lib/api-helpers";
import { todayIso } from "@/lib/date-ranges";
import { resolveTrackingStart } from "@/lib/user-settings";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .optional(),
  role: z.enum(["admin", "user"]).optional(),
  isActive: z.boolean().optional(),
  /** `null` clears the override and falls back to the account creation day. */
  trackingStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid user id");

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid payload");
    }

    await connectDB();
    const user = await User.findById(id);
    if (!user) return fail("User not found", 404);

    // Prevent admin from locking themselves out
    if (String(user._id) === admin.sub) {
      if (parsed.data.isActive === false) {
        return fail("You cannot deactivate your own account");
      }
      if (parsed.data.role && parsed.data.role !== "admin") {
        return fail("You cannot remove your own admin role");
      }
    }

    /**
     * A reset that lands on the same password would sign every device out for
     * nothing, and usually means the old one was pasted by mistake. Checked
     * before anything is mutated so the request is rejected whole.
     */
    if (
      parsed.data.password &&
      (await verifyPassword(parsed.data.password, user.passwordHash))
    ) {
      return fail("That is already this account's password");
    }

    if (parsed.data.name) user.name = parsed.data.name.trim();

    /**
     * A new password, a role change or a deactivation must not leave the
     * account's existing 30-day tokens usable. Bumping sessionVersion makes
     * every one of them fail the check on the next request.
     */
    let revokeSessions = false;

    if (parsed.data.role && parsed.data.role !== user.role) {
      user.role = parsed.data.role;
      revokeSessions = true;
    }
    if (
      typeof parsed.data.isActive === "boolean" &&
      parsed.data.isActive !== user.isActive
    ) {
      user.isActive = parsed.data.isActive;
      revokeSessions = true;
    }
    if (parsed.data.password) {
      user.passwordHash = await hashPassword(parsed.data.password);
      user.passwordChangedAt = new Date();
      revokeSessions = true;
    }
    if (revokeSessions) {
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    }
    if (parsed.data.trackingStartDate !== undefined) {
      if (parsed.data.trackingStartDate && parsed.data.trackingStartDate > todayIso()) {
        return fail("Tracking start cannot be in the future");
      }
      user.trackingStartDate = parsed.data.trackingStartDate;
    }

    await user.save();
    invalidateAccountCache(String(user._id));

    const response = ok({
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      passwordChangedAt: user.passwordChangedAt
        ? new Date(user.passwordChangedAt).toISOString()
        : null,
      ...resolveTrackingStart(user),
    });

    /**
     * Resetting your own password is how an admin changes it — but the
     * sessionVersion bump above has just invalidated the cookie this very
     * request arrived with. Re-mint it so the admin is not thrown to /login by
     * their own reset; every *other* device still fails the version check.
     */
    if (revokeSessions && String(user._id) === admin.sub) {
      const token = await createSessionToken({
        sub: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role as "admin" | "user",
        sessionVersion: user.sessionVersion ?? 0,
      });
      response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    }

    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid user id");
    if (id === admin.sub) return fail("You cannot delete your own account");

    await connectDB();
    const user = await User.findById(id);
    if (!user) return fail("User not found", 404);

    user.isActive = false;
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    await user.save();
    invalidateAccountCache(String(user._id));

    return ok({ id, deactivated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
