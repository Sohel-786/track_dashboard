import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Entry from "@/models/Entry";
import Category from "@/models/Category";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, isObjectId, ok } from "@/lib/api-helpers";
import { isValidIsoDate } from "@/lib/date-ranges";

const updateSchema = z.object({
  value: z.number().min(0).optional(),
  date: z.string().optional(),
  note: z.string().max(500).optional(),
  categoryId: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid entry id");

    const body = await request.json();
    const parsed = updateSchema.safeParse({
      ...body,
      value:
        body.value === undefined
          ? undefined
          : typeof body.value === "string"
            ? Number(body.value)
            : body.value,
    });
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid payload");
    }

    await connectDB();
    const entry = await Entry.findOne({ _id: id, userId: session.sub });
    if (!entry) return fail("Entry not found", 404);

    if (parsed.data.categoryId) {
      if (!isObjectId(parsed.data.categoryId)) {
        return fail("Invalid category id");
      }
      const category = await Category.findOne({
        _id: parsed.data.categoryId,
        userId: session.sub,
        isActive: true,
      }).lean();
      if (!category) return fail("Category not found", 404);
      entry.categoryId = category._id;
    }

    if (parsed.data.date) {
      if (!isValidIsoDate(parsed.data.date)) {
        return fail("Invalid date format (YYYY-MM-DD)");
      }
      entry.date = parsed.data.date;
    }
    if (parsed.data.value !== undefined) entry.value = parsed.data.value;
    if (parsed.data.note !== undefined) entry.note = parsed.data.note.trim();

    await entry.save();

    return ok({
      id: String(entry._id),
      categoryId: String(entry.categoryId),
      value: entry.value,
      date: entry.date,
      note: entry.note ?? "",
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid entry id");

    await connectDB();
    const result = await Entry.deleteOne({ _id: id, userId: session.sub });
    if (result.deletedCount === 0) return fail("Entry not found", 404);

    return ok({ id, deleted: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
