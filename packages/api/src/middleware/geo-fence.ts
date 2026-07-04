import type { Address } from "@coldcash/shared";

const GEO_FENCE_LIST: string[] = [
  // TODO P3: populate with restricted jurisdictions per compliance requirements
  // Format: ISO 3166-1 alpha-2 country codes
];

export interface GeoFenceContext {
  ipAddress?: string;
  countryCode?: string;
}

export function isGeoRestricted(ctx: GeoFenceContext): boolean {
  if (!ctx.countryCode) return false;
  return GEO_FENCE_LIST.includes(ctx.countryCode.toUpperCase());
}

export function geoFenceMiddleware(ctx: GeoFenceContext): void {
  if (isGeoRestricted(ctx)) {
    throw new Error(`Service unavailable in jurisdiction: ${ctx.countryCode}`);
  }
}
