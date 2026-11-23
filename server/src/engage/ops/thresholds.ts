/**
 * The numbers the ops rules compare against (ADR-024). Defaults are ours, chosen for a small tenant that sends in bursts; none is
 * a provider's rule. An operator can change them with ENGAGE_OPS_* variables (an invalid value is ignored, never half-applied).
 */
export interface Thresholds {
  /** The short window of the failure and denial rules, in minutes. */
  windowMinutes: number;
  /** A provider is "failing" when its calls fail at this rate (warning, critical) over at least minAttempts calls. */
  failRateWarning: number;
  failRateCritical: number;
  minAttempts: number;
  /** Credentials rejected by the provider this many times in the window. */
  authFailures: number;
  /** A message the provider accepted is "waiting for a report" after this many minutes; the rule needs this many of them. */
  reportGraceMinutes: number;
  reportMinWaiting: number;
  /** Bounces and complaints over the last 24 hours, against what was sent (with a minimum volume, so a few messages never decide). */
  bounceMinSent: number;
  bounceWarning: number;
  bounceCritical: number;
  complaintMinSent: number;
  complaintWarning: number;
  complaintCritical: number;
  /** Gate denials for reasons that mean something is broken: the count in the window. */
  denialSystemicWarning: number;
  denialSystemicCritical: number;
  /** Denials for ordinary reasons (no consent, suppressed…): only a jump counts: at least this many, and this many times the usual. */
  denialSpikeMin: number;
  denialSpikeFactor: number;
  /** Messages waiting past their time, in minutes; critical at this many messages or this age in minutes. */
  overdueMinutes: number;
  staleSendingMinutes: number;
  queueCriticalCount: number;
  queueCriticalMinutes: number;
  /** An alert is resolved when its condition has been gone this long, and reminded this often while it lasts (hours). */
  resolveGraceMinutes: number;
  remindCriticalHours: number;
  remindWarningHours: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  windowMinutes: 15,
  failRateWarning: 0.25, failRateCritical: 0.5, minAttempts: 10,
  authFailures: 3,
  reportGraceMinutes: 30, reportMinWaiting: 5,
  bounceMinSent: 50, bounceWarning: 0.05, bounceCritical: 0.1,
  complaintMinSent: 500, complaintWarning: 0.001, complaintCritical: 0.005,
  denialSystemicWarning: 5, denialSystemicCritical: 50,
  denialSpikeMin: 50, denialSpikeFactor: 5,
  overdueMinutes: 10, staleSendingMinutes: 15, queueCriticalCount: 100, queueCriticalMinutes: 60,
  resolveGraceMinutes: 10, remindCriticalHours: 6, remindWarningHours: 24,
};

/** ENGAGE_OPS_FAIL_RATE_WARNING -> failRateWarning, and so on: the key in upper snake case. */
export function loadThresholds(env: NodeJS.ProcessEnv = process.env): Thresholds {
  const t: Thresholds = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(t) as Array<keyof Thresholds>) {
    const raw = env[`ENGAGE_OPS_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`];
    if (raw === undefined || raw.trim() === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) t[key] = n;
  }
  return t;
}
