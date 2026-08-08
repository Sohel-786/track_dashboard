import { NextResponse } from "next/server";
import mongoose from "mongoose";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export function isObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}
