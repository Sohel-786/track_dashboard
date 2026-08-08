import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Category from "@/models/Category";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, isObjectId, ok } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  target: z.number().min(1).optional(),
  isActive: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid category id");

    const body = await request.json();
    const parsed = updateSchema.safeParse({
      ...body,
      target:
        body.target === undefined
          ? undefined
          : typeof body.target === "string"
            ? Number(body.target)
            : body.target,
    });
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid payload");
    }

    await connectDB();
    const category = await Category.findOne({ _id: id, userId: session.sub });
    if (!category) return fail("Category not found", 404);

    if (parsed.data.name) category.name = parsed.data.name.trim();
    if (parsed.data.target !== undefined) category.target = parsed.data.target;
    if (typeof parsed.data.isActive === "boolean") {
      category.isActive = parsed.data.isActive;
    }

    try {
      await category.save();
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

    return ok({
      id: String(category._id),
      name: category.name,
      target: category.target,
      isActive: category.isActive,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid category id");

    await connectDB();
    const category = await Category.findOne({ _id: id, userId: session.sub });
    if (!category) return fail("Category not found", 404);

    category.isActive = false;
    await category.save();

    return ok({ id, deactivated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
