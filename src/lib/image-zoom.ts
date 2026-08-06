/** Shared zoom helpers for guide image viewing (lightbox). */

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

/** Opening zoom: mobile starts larger so wiring photos are readable. */
export function defaultOpenZoom(): number {
  return isMobileViewport() ? 0.75 : 0.25;
}

export function minZoomForViewport(): number {
  return isMobileViewport() ? 0.5 : 0.25;
}

export function maxZoom(): number {
  return ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

export function clampZoom(z: number): number {
  return Math.min(maxZoom(), Math.max(minZoomForViewport(), z));
}
