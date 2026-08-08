import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords";
import { fail, isObjectId, ok } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(4).max(128).optional(),
  role: z.enum(["admin", "user"]).optional(),
  isActive: z.boolean().optional(),
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

    if (parsed.data.name) user.name = parsed.data.name.trim();
    if (parsed.data.role) user.role = parsed.data.role;
    if (typeof parsed.data.isActive === "boolean") {
      user.isActive = parsed.data.isActive;
    }
    if (parsed.data.password) {
      user.passwordHash = await hashPassword(parsed.data.password);
    }

    await user.save();

    return ok({
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    });
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
    await user.save();

    return ok({ id, deactivated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
