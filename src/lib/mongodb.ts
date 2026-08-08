import mongoose from "mongoose";
import { ensureSeedAdmin } from "@/lib/seed";
import { getMongoUri } from "@/lib/env";
import {
  ensureMongoDns,
  isSrvDnsError,
  toStandardMongoUri,
} from "@/lib/mongo-dns";

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

const connectOptions: mongoose.ConnectOptions = {
  bufferCommands: false,
  family: 4,
  serverSelectionTimeoutMS: 15000,
};

async function connectWithFallback(uri: string) {
  ensureMongoDns();
  try {
    return await mongoose.connect(uri, connectOptions);
  } catch (error) {
    if (!uri.startsWith("mongodb+srv://") || !isSrvDnsError(error)) {
      throw error;
    }
    console.warn(
      "[mongodb] SRV DNS lookup failed; retrying with DNS-over-HTTPS standard URI"
    );
    const standardUri = await toStandardMongoUri(uri);
    return mongoose.connect(standardUri, connectOptions);
  }
}

async function connectDB() {
  if (cached.conn) {
    await ensureSeedAdmin();
    return cached.conn;
  }

  const uri = getMongoUri();

  if (!cached.promise) {
    cached.promise = connectWithFallback(uri).then((m) => m);
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
