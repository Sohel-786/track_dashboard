import mongoose from "mongoose";
import { ensureSeedAdmin } from "@/lib/seed";
import { getMongoUri } from "@/lib/env";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

async function connectDB() {
  if (cached.conn) {
    await ensureSeedAdmin();
    return cached.conn;
  }

  const uri = getMongoUri();

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  await ensureSeedAdmin();
  return cached.conn;
}

export default connectDB;
