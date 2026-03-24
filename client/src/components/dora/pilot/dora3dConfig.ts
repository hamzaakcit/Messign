/** Shared constants for the Dora 3D paper-plane scene. */

/** Brand gradient stops — same as PilotPlaneSVG defs. */
export const DORA_COLORS = {
  cyan: '#00D9D5',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  hatDark: '#1e293b',
  hatDeep: '#0f172a',
  lensCyan: '#06b6d4',
  lensPurple: '#8b5cf6',
  goggleRim: '#94a3b8',
} as const;

/**
 * Paper-plane vertex positions mapped from the 2D SVG (viewBox 0 0 64 64) into
 * a centered, unit-scale 3D coordinate system.  The SVG path
 * `M10 32 L52 14 L44 32 L52 50 L10 32` becomes a centered diamond with the
 * nose at +X, wings spread along X/Y, and the body given a small Z thickness
 * to read as 3D.
 *
 * Coordinate mapping: SVG x→3D +X (reversed so nose faces right),
 * SVG y→3D -Y (SVG y-down → 3D y-up).
 */
export const PLANE_GEOMETRY = {
  nose: [1.3, 0, 0] as const,
  upperWing: [-1.0, 0.56, 0] as const,
  center: [-0.5, 0, 0] as const,
  lowerWing: [-1.0, -0.56, 0] as const,
  thickness: 0.06,
} as const;

/** Default sizes for raster export (Instagram square + portrait). */
export const EXPORT_SIZES = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
} as const;
