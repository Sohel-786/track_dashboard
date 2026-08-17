import { getUserSettings } from "@/lib/user-settings";
import { type NamazMadhabId } from "@/lib/namaz-madhab";

/**
 * Resolve the signed-in user's madhab preference (defaults to Hanafi).
 *
 * Prefer `getUserSettings` when the caller also needs the tracking start —
 * it returns both from a single lookup.
 */
export async function getUserNamazMadhab(
  userId: string
): Promise<NamazMadhabId> {
  return (await getUserSettings(userId)).madhabId;
}
