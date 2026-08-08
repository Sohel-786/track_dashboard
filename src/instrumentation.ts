export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { ensureMongoDns } = await import("./lib/mongo-dns");
  ensureMongoDns();
}
