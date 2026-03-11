/**
 * Burnout detection signal weights — configurable for different roles/departments.
 * What signals "burnout" in sales (async, variable hours) may differ from engineering.
 */

export const DEFAULT_BURNOUT_WEIGHTS = {
  hoursCreep: 0.2,
  afterHours: 0.15,
  responseTime: 0.1,
  velocityDecline: 0.2,
  sentimentShift: 0.25,
  ptoAvoidance: 0.1,
} as const;

export type BurnoutWeightKey = keyof typeof DEFAULT_BURNOUT_WEIGHTS;

/** Role/department overrides — lower weight = less impact on overall score */
export const ROLE_OVERRIDES: Record<string, Partial<Record<BurnoutWeightKey, number>>> = {
  sales: { afterHours: 0.08, velocityDecline: 0.15 },
  engineering: { hoursCreep: 0.25, velocityDecline: 0.25 },
  marketing: { afterHours: 0.1 },
};

export function getWeightsForRole(roleOrDepartment: string | null | undefined): Record<BurnoutWeightKey, number> {
  const base = { ...DEFAULT_BURNOUT_WEIGHTS };
  if (!roleOrDepartment) return base;
  const key = roleOrDepartment.toLowerCase();
  const override = ROLE_OVERRIDES[key];
  if (!override) return base;
  return { ...base, ...override } as Record<BurnoutWeightKey, number>;
}
