import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const connectDB = (await import("../src/lib/mongodb")).default;
  const { clearDemoData } = await import("../src/lib/seed");

  await connectDB();
  const result = await clearDemoData();
  console.log("[seed] Cleared demo data. Admin only remains:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
