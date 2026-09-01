import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A named location, cached from OpenStreetMap.
 *
 * Deliberately **not** scoped to a user: a masjid is the same masjid for
 * everyone, and OSM's free endpoints ask callers to cache aggressively rather
 * than re-query. One lookup per real-world place, shared by every account.
 */
const MapPlaceSchema = new Schema(
  {
    /**
     * Stable identity. `node/123456` for a real OSM object, or `geo:23.02,72.57`
     * for a reverse-geocode result that carried no OSM id.
     */
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 200 },
    /**
     * `masjid` drives the whole masjid workspace; `place` is any other named
     * location; `unknown` is a stay we could not name at all.
     */
    kind: {
      type: String,
      enum: ["masjid", "place", "unknown"],
      default: "place",
      required: true,
    },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    address: { type: String, default: "", maxlength: 400 },
    /** `node` | `way` | `relation`, when the place came from a real OSM object. */
    osmType: { type: String, default: null },
    osmId: { type: Number, default: null },
    /** Whichever free endpoint produced this record. */
    source: {
      type: String,
      enum: ["overpass", "nominatim", "manual"],
      required: true,
    },
    /** Selected OSM tags worth showing (denomination, opening hours, …). */
    tags: { type: Map, of: String, default: {} },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

MapPlaceSchema.index({ kind: 1, lat: 1, lng: 1 });

export type IMapPlace = InferSchemaType<typeof MapPlaceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const MapPlace: Model<IMapPlace> =
  mongoose.models.MapPlace ||
  mongoose.model<IMapPlace>("MapPlace", MapPlaceSchema);

export default MapPlace;
