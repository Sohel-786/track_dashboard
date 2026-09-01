import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Marker that one map cell has already been swept for masjids.
 *
 * Overpass is free and asks for restraint in return. Without this the app would
 * re-query the same street every time a visit there is resolved; with it, an
 * area is swept once and then answered from `MapPlace` until the record ages
 * out. `found: 0` is cached too — "nothing here" is an answer worth keeping.
 */
const MapAreaScanSchema = new Schema(
  {
    /** Rounded coordinate cell, e.g. `23.02,72.57` — see `geoCacheKey`. */
    cell: { type: String, required: true, unique: true },
    radiusMeters: { type: Number, required: true },
    found: { type: Number, default: 0, required: true },
    scannedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

export type IMapAreaScan = InferSchemaType<typeof MapAreaScanSchema> & {
  _id: mongoose.Types.ObjectId;
};

const MapAreaScan: Model<IMapAreaScan> =
  mongoose.models.MapAreaScan ||
  mongoose.model<IMapAreaScan>("MapAreaScan", MapAreaScanSchema);

export default MapAreaScan;
