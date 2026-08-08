import { Madhab } from "adhan";

/**
 * Classical schools shown in the UI.
 * Adhan only distinguishes Hanafi vs Shafi for Asr shadow length;
 * Maliki & Hanbali use the same Asr calculation as Shafi'i.
 */
export const NAMAZ_MADHABS = [
  {
    id: "hanafi",
    label: "Hanafi",
    arabic: "حنفي",
    asrRule: "Asr when shadow is twice the object (later Asr).",
    adhan: Madhab.Hanafi,
  },
  {
    id: "shafi",
    label: "Shafi'i",
    arabic: "شافعي",
    asrRule: "Asr when shadow equals the object (earlier Asr).",
    adhan: Madhab.Shafi,
  },
  {
    id: "maliki",
    label: "Maliki",
    arabic: "مالكي",
    asrRule: "Asr when shadow equals the object (same as Shafi'i).",
    adhan: Madhab.Shafi,
  },
  {
    id: "hanbali",
    label: "Hanbali",
    arabic: "حنبلي",
    asrRule: "Asr when shadow equals the object (same as Shafi'i).",
    adhan: Madhab.Shafi,
  },
] as const;

export type NamazMadhabId = (typeof NAMAZ_MADHABS)[number]["id"];

export const DEFAULT_NAMAZ_MADHAB: NamazMadhabId = "hanafi";

export function isNamazMadhabId(value: unknown): value is NamazMadhabId {
  return (
    typeof value === "string" &&
    NAMAZ_MADHABS.some((m) => m.id === value)
  );
}

export function getNamazMadhab(id?: string | null) {
  const resolved = isNamazMadhabId(id) ? id : DEFAULT_NAMAZ_MADHAB;
  return NAMAZ_MADHABS.find((m) => m.id === resolved)!;
}

export function adhanMadhabFor(id?: string | null) {
  return getNamazMadhab(id).adhan;
}
