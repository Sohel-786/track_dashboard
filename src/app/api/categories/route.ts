import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Category from "@/models/Category";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  target: z.number().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "true";

    const filter: Record<string, unknown> = { userId: session.sub };
    if (!includeInactive) filter.isActive = true;

    const categories = await Category.find(filter)
      .sort({ name: 1 })
      .lean();

    return ok(
      categories.map((c) => ({
        id: String(c._id),
        name: c.name,
        target: c.target,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const parsed = createSchema.safeParse({
      ...body,
      target: typeof body.target === "string" ? Number(body.target) : body.target,
    });
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ||
          "Category name and target (min 1) are required"
      );
    }

    await connectDB();
    const name = parsed.data.name.trim();

    try {
      const category = await Category.create({
        userId: session.sub,
        name,
        target: parsed.data.target,
        isActive: true,
      });

      return ok(
        {
          id: String(category._id),
          name: category.name,
          target: category.target,
          isActive: category.isActive,
        },
        { status: 201 }
      );
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code?: number }).code === 11000
      ) {
        return fail("A category with this name already exists", 409);
      }
      throw err;
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
