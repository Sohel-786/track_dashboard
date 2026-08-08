import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { ok } from "@/lib/api-helpers";
import { isNamazMadhabId, type NamazMadhabId } from "@/lib/namaz-madhab";
import { getUserNamazMadhab } from "@/lib/namaz-user";
import { getNamazScheduleSnapshot } from "@/lib/prayer-times";

/**
 * Schedule clock for the Namaz UI — server time + Ahmedabad prayer windows.
 * Optional `?madhab=` previews times for a school without saving preference.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const preview = request.nextUrl.searchParams.get("madhab");
    const madhabId: NamazMadhabId = isNamazMadhabId(preview)
      ? preview
      : await getUserNamazMadhab(session.sub);

    return ok(getNamazScheduleSnapshot(new Date(), madhabId));
  } catch (error) {
    return authErrorResponse(error);
  }
}
