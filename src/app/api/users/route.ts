import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords";
import { fail, normalizeUsername, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(4).max(128),
  name: z.string().min(1).max(120),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const users = await User.find()
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .lean();

    return ok(
      users.map((u) => ({
        id: String(u._id),
        username: u.username,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      }))
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid payload");
    }

    await connectDB();
    const username = normalizeUsername(parsed.data.username);
    const exists = await User.findOne({ username }).lean();
    if (exists) {
      return fail("Username already exists", 409);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await User.create({
      username,
      passwordHash,
      name: parsed.data.name.trim(),
      role: parsed.data.role,
      isActive: true,
    });

    return ok(
      {
        id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
      { status: 201 }
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
