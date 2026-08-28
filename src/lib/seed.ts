import type { Types } from "mongoose";
import User from "@/models/User";
import Category from "@/models/Category";
import Entry from "@/models/Entry";
import { hashPassword } from "@/lib/passwords";

/**
 * First-run admin. The defaults are documented in the README, so a deployment
 * that keeps them is publicly guessable — override them with env vars before
 * exposing an instance to the internet.
 */
const SEED_USERNAME = (process.env.SEED_ADMIN_USERNAME || "sohel")
  .trim()
  .toLowerCase();
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "1036425";
const SEED_NAME = process.env.SEED_ADMIN_NAME || "Sohel";

let seeding: Promise<void> | null = null;

async function dropLegacyUniqueEntryIndex() {
  try {
    const indexes = await Entry.collection.indexes();
    for (const idx of indexes) {
      const key = idx.key as Record<string, number>;
      if (
        idx.unique &&
        key.userId === 1 &&
        key.categoryId === 1 &&
        key.date === 1
      ) {
        await Entry.collection.dropIndex(idx.name!);
        console.log(`[seed] Dropped legacy unique index ${idx.name}`);
      }
    }
  } catch {
    /* collection may not exist yet */
  }
}

/**
 * Ensure only the admin account exists as system seed.
 * Does NOT create categories or entries — user creates those.
 */
export async function ensureSeedAdmin(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      await dropLegacyUniqueEntryIndex();

      const existing = await User.findOne({ username: SEED_USERNAME });
      if (existing) return;

      const passwordHash = await hashPassword(SEED_PASSWORD);
      await User.create({
        username: SEED_USERNAME,
        passwordHash,
        name: SEED_NAME,
        role: "admin",
        isActive: true,
      });
      console.log(`[seed] Admin user "${SEED_USERNAME}" created`);
      if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV === "production") {
        console.warn(
          "[seed] Admin created with the documented default password. " +
            "Change it from Users, or set SEED_ADMIN_PASSWORD before first run."
        );
      }
    })().catch((err) => {
      seeding = null;
      throw err;
    });
  }
  await seeding;
}

/** Wipe all categories + entries; keep admin account. */
export async function clearDemoData() {
  await dropLegacyUniqueEntryIndex();

  let user = await User.findOne({ username: SEED_USERNAME });
  if (!user) {
    const passwordHash = await hashPassword(SEED_PASSWORD);
    user = await User.create({
      username: SEED_USERNAME,
      passwordHash,
      name: SEED_NAME,
      role: "admin",
      isActive: true,
    });
    console.log(`[seed] Admin user "${SEED_USERNAME}" created`);
  }

  const [entriesDeleted, categoriesDeleted] = await Promise.all([
    Entry.deleteMany({}),
    Category.deleteMany({}),
  ]);

  console.log(
    `[seed] Cleared data — entries: ${entriesDeleted.deletedCount}, categories: ${categoriesDeleted.deletedCount}`
  );

  return {
    userId: String(user._id),
    entriesDeleted: entriesDeleted.deletedCount ?? 0,
    categoriesDeleted: categoriesDeleted.deletedCount ?? 0,
  };
}

/** @deprecated Use clearDemoData — demo month seed removed. */
export async function forceSeedDemoData() {
  return clearDemoData();
}

/** Kept for script compatibility; no-op demo month seeding. */
export async function seedMonthEntries(
  ..._args: [
    Types.ObjectId,
    { _id: Types.ObjectId; name: string; target: number }[],
    ({ force?: boolean } | undefined)?,
  ]
) {
  void _args;
  return 0;
}
