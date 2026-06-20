// Calls back to the Igla portal to verify a device unit before issuing a guide
// link. The portal is the source of truth for whether a unit serial is real and
// currently eligible (real unit, not certified/active, not removal-pending).
// Fails CLOSED: any misconfig or error means "not eligible" (never issue).

export type UnitEligibility = {
  valid: boolean; // is this a real, known unit?
  eligible: boolean; // allowed to receive a guide right now?
  reason?: string;
  // The unit's product as recorded in the portal's inventory (e.g. "IGLA 231",
  // "IGLA Alarm"). Lets /issue serve the install guide for THIS unit's product.
  unitType?: string | null;
  deviceCategory?: string | null; // "igla" | "compass"
};

export async function verifyUnitWithPortal(serial: string): Promise<UnitEligibility> {
  const base = process.env.PORTAL_BASE_URL;
  const token = process.env.GUIDES_INTEGRATION_TOKEN;
  if (!base || !token) {
    return { valid: false, eligible: false, reason: "integration_not_configured" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/api/integration/unit-eligibility?serial=${encodeURIComponent(serial)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
    );
    if (!res.ok) return { valid: false, eligible: false, reason: `portal_${res.status}` };
    const data = (await res.json()) as Partial<UnitEligibility>;
    return {
      valid: Boolean(data.valid),
      eligible: Boolean(data.eligible),
      reason: data.reason,
      unitType: data.unitType ?? null,
      deviceCategory: data.deviceCategory ?? null,
    };
  } catch (e) {
    return {
      valid: false,
      eligible: false,
      reason: (e as Error).name === "AbortError" ? "portal_timeout" : "portal_unreachable",
    };
  } finally {
    clearTimeout(timeout);
  }
}
