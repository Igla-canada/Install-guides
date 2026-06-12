// VIN decoding adapter. The Igla portal has its own decoder and should pass
// the decoded make/model/year if it has them; this fallback uses the free
// NHTSA vPIC API so the resolve endpoint also works from a raw VIN.
// Per the owner: decoders return make + model + year only (no trim) — so
// resolve matches at generation level.

export type VinDecode = {
  make: string | null;
  model: string | null;
  year: number | null;
};

export async function decodeVin(vin: string): Promise<VinDecode | null> {
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
        vin.trim()
      )}?format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Results?: Array<{ Make?: string; Model?: string; ModelYear?: string }>;
    };
    const r = data.Results?.[0];
    if (!r) return null;
    return {
      make: r.Make?.trim() || null,
      model: r.Model?.trim() || null,
      year: r.ModelYear ? parseInt(r.ModelYear, 10) || null : null,
    };
  } catch {
    return null; // decoder unavailable → resolve falls back to free-text inputs
  }
}
