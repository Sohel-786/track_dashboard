import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Entry from "@/models/Entry";
import Category from "@/models/Category";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, isObjectId, ok } from "@/lib/api-helpers";
import { isValidIsoDate, todayIso } from "@/lib/date-ranges";
import { dayTotalsByCategory } from "@/lib/analytics";

const createSchema = z.object({
  categoryId: z.string().min(1),
  value: z.number().min(0),
  date: z.string().optional(),
  note: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { searchParams } = request.nextUrl;
    // Default to today — entries portion is day-scoped.
    const dateParam = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const categoryId = searchParams.get("categoryId");
    const limit = Math.min(Number(searchParams.get("limit") || 300), 1000);

    const filter: Record<string, unknown> = { userId: session.sub };

    if (dateParam) {
      if (!isValidIsoDate(dateParam)) return fail("Invalid date");
      filter.date = dateParam;
    } else if (from || to) {
      filter.date = {};
      if (from && isValidIsoDate(from)) {
        (filter.date as Record<string, string>).$gte = from;
      }
      if (to && isValidIsoDate(to)) {
        (filter.date as Record<string, string>).$lte = to;
      }
    } else {
      filter.date = todayIso();
    }

    if (categoryId) {
      if (!isObjectId(categoryId)) return fail("Invalid category id");
      filter.categoryId = categoryId;
    }

    const entries = await Entry.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("categoryId", "name target")
      .lean();

    const dayMap = dayTotalsByCategory(
      entries.map((e) => {
        const cat = e.categoryId as unknown as {
          _id?: { toString(): string };
        } | null;
        return {
          categoryId: cat?._id ? String(cat._id) : String(e.categoryId),
          date: e.date,
          value: e.value,
        };
      })
    );

    // Also compute day totals from DB for accuracy when limit truncates
    const dayKey =
      typeof filter.date === "string" ? filter.date : todayIso();
    const dayEntriesForTotals =
      typeof filter.date === "string"
        ? await Entry.find({
            userId: session.sub,
            date: filter.date,
            ...(categoryId ? { categoryId } : {}),
          }).lean()
        : entries;

    const accurateDayMap = dayTotalsByCategory(dayEntriesForTotals);

    const categories = await Category.find({
      userId: session.sub,
      isActive: true,
    })
      .sort({ name: 1 })
      .lean();

    const daySummaries = categories.map((cat) => {
      const id = String(cat._id);
      const dayTotal = accurateDayMap.get(`${id}|${dayKey}`) ?? 0;
      return {
        categoryId: id,
        name: cat.name,
        target: cat.target,
        dayTotal,
        remaining: Math.max(0, cat.target - dayTotal),
        progress:
          cat.target > 0
            ? Math.round((dayTotal / cat.target) * 1000) / 10
            : 0,
        hitTarget: dayTotal >= cat.target,
        entryCount: dayEntriesForTotals.filter(
          (e) => String(e.categoryId) === id
        ).length,
      };
    });

    const mapped = entries.map((e) => {
      const cat = e.categoryId as unknown as {
        _id?: { toString(): string };
        name?: string;
        target?: number;
      } | null;
      const catId = cat?._id ? String(cat._id) : String(e.categoryId);
      const target = cat?.target ?? 0;
      const dayTotal =
        accurateDayMap.get(`${catId}|${e.date}`) ??
        dayMap.get(`${catId}|${e.date}`) ??
        e.value;

      return {
        id: String(e._id),
        categoryId: catId,
        categoryName: cat?.name ?? "Unknown",
        categoryTarget: target,
        value: e.value,
        date: e.date,
        note: e.note ?? "",
        dayTotal,
        dayRemaining: Math.max(0, target - dayTotal),
        dayProgress:
          target > 0 ? Math.round((dayTotal / target) * 1000) / 10 : 0,
        dayHitTarget: dayTotal >= target,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
    });

    return ok({
      date: typeof filter.date === "string" ? filter.date : dayKey,
      entries: mapped,
      daySummaries,
    });
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
      value: typeof body.value === "string" ? Number(body.value) : body.value,
    });
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Category and value are required"
      );
    }

    if (!isObjectId(parsed.data.categoryId)) {
      return fail("Invalid category id");
    }

    const date = parsed.data.date || todayIso();
    if (!isValidIsoDate(date)) return fail("Invalid date format (YYYY-MM-DD)");

    await connectDB();

    const category = await Category.findOne({
      _id: parsed.data.categoryId,
      userId: session.sub,
      isActive: true,
    }).lean();

    if (!category) return fail("Category not found", 404);

    // Always create a new entry — multiple per day are allowed.
    const entry = await Entry.create({
      userId: session.sub,
      categoryId: parsed.data.categoryId,
      value: parsed.data.value,
      date,
      note: parsed.data.note?.trim() || "",
    });

    const dayAgg = await Entry.aggregate([
      {
        $match: {
          userId: entry.userId,
          categoryId: entry.categoryId,
          date,
        },
      },
      { $group: { _id: null, total: { $sum: "$value" }, count: { $sum: 1 } } },
    ]);
    const dayTotal = dayAgg[0]?.total ?? entry.value;

    return ok(
      {
        id: String(entry._id),
        categoryId: String(entry.categoryId),
        categoryName: category.name,
        categoryTarget: category.target,
        value: entry.value,
        date: entry.date,
        note: entry.note ?? "",
        dayTotal,
        dayRemaining: Math.max(0, category.target - dayTotal),
        dayProgress:
          Math.round((dayTotal / category.target) * 1000) / 10,
        dayHitTarget: dayTotal >= category.target,
      },
      { status: 201 }
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
