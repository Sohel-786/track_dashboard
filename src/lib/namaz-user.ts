import User from "@/models/User";
import {
  DEFAULT_NAMAZ_MADHAB,
  isNamazMadhabId,
  type NamazMadhabId,
} from "@/lib/namaz-madhab";

/** Resolve the signed-in user's madhab preference (defaults to Hanafi). */
export async function getUserNamazMadhab(
  userId: string
): Promise<NamazMadhabId> {
  const user = await User.findById(userId).select("namazMadhab").lean();
  const raw = (user as { namazMadhab?: string } | null)?.namazMadhab;
  return isNamazMadhabId(raw) ? raw : DEFAULT_NAMAZ_MADHAB;
}
