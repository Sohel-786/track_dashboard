import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import {
  NAMAZ_MADHABS,
  isNamazMadhabId,
} from "@/lib/namaz-madhab";
import { getUserNamazMadhab } from "@/lib/namaz-user";
import { getNamazScheduleSnapshot } from "@/lib/prayer-times";

const patchSchema = z.object({
  madhab: z.enum(["hanafi", "shafi", "maliki", "hanbali"]),
});

/** Current madhab preference + refreshed schedule for the selected school. */
export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();

    const madhabId = await getUserNamazMadhab(session.sub);
    return ok({
      madhabId,
      madhabs: NAMAZ_MADHABS.map(({ id, label, arabic, asrRule }) => ({
        id,
        label,
        arabic,
        asrRule,
      })),
      schedule: getNamazScheduleSnapshot(new Date(), madhabId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Persist madhab preference and return updated Ahmedabad schedule. */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success || !isNamazMadhabId(parsed.data.madhab)) {
      return fail("Invalid madhab");
    }

    const madhabId = parsed.data.madhab;
    await User.findByIdAndUpdate(session.sub, {
      $set: { namazMadhab: madhabId },
    });

    return ok({
      madhabId,
      madhabs: NAMAZ_MADHABS.map(({ id, label, arabic, asrRule }) => ({
        id,
        label,
        arabic,
        asrRule,
      })),
      schedule: getNamazScheduleSnapshot(new Date(), madhabId),
      message: `Madhab set to ${
        NAMAZ_MADHABS.find((m) => m.id === madhabId)?.label ?? madhabId
      }. Asr (and related) windows updated.`,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
