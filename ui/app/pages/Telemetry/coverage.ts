/**
 * Telemetry audit — pure verdict + coverage-color helpers.
 *
 * Kept in a plain .ts module (no React) so the classification logic is
 * unit-testable in isolation. Consumed by useTelemetryAudit (verdicts) and by
 * the page / SectionCard (colors).
 *
 * Two verdict models, matching the two DQL shapes in queries.ts:
 *   - Population sections (logs/events, Section A & D): a three-way
 *     present/sparse/missing verdict derived from a presence count and a
 *     population count — ported verbatim from the source app's Attribute
 *     Audit (`classifyVerdict`), since the logic is data-source-agnostic.
 *   - Metric sections (Section B & C): there is no population/share concept
 *     for a CloudWatch metric — detection is binary, so a simpler
 *     detected/not-detected verdict applies.
 */

import { statusColor, type SemanticStatus } from "../../theme/statusColor";
import type { Tier } from "./catalog";

// ─── Population verdict (logs / events sections) ──────────────────────────

/** Three-way presence verdict for a population-based field. */
export type Verdict = "present" | "sparse" | "missing";

/**
 * Share of the section population below which a *present* field is
 * downgraded to SPARSE — it was seen, but on so few rows (< 1%) that treating
 * it as fully covered would manufacture false confidence (a single row out of
 * millions still reads as raw-count > 0).
 */
export const SPARSE_SHARE_THRESHOLD = 0.01;

/**
 * Classify a field from its boolean presence and its share of the section
 * population (0..1). Missing → not seen at all; sparse → seen but below the
 * share threshold; present → seen on a meaningful fraction of rows.
 */
export const classifyVerdict = (present: boolean, share: number): Verdict => {
  if (!present) return "missing";
  if (share < SPARSE_SHARE_THRESHOLD) return "sparse";
  return "present";
};

/** Verdict → shared semantic status, so this page's severity colors stay
 *  consistent with the rest of the app's status ramp. */
export const VERDICT_STATUS: Record<Verdict, SemanticStatus> = {
  present: "good",
  sparse: "warning",
  missing: "critical",
};

/** Verdict → theme-safe color token, resolved via the shared statusColor. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  present: statusColor(VERDICT_STATUS.present),
  sparse: statusColor(VERDICT_STATUS.sparse),
  missing: statusColor(VERDICT_STATUS.missing),
};

/**
 * Graduated coverage color keyed to the covered ratio, so a section at 6/8
 * reads visibly greener than one at 1/8 (a flat binary ramp would paint both
 * the same amber). Snaps to red at exactly 0 and green at full; between, it
 * interpolates amber→green by the ratio.
 */
export const coverageRampColor = (present: number, total: number): string => {
  if (total <= 0) return "var(--text-3)";
  if (present <= 0) return "var(--red)";
  if (present >= total) return "var(--green-2)";
  const greenPct = Math.round((present / total) * 100);
  return `color-mix(in oklab, var(--green-2) ${greenPct}%, var(--amber))`;
};

// ─── Metric verdict (metrics sections) ─────────────────────────────────────

/** Binary presence verdict for a CloudWatch-metric field — there is no
 *  population/share concept, only "did any datapoint land in the window". */
export type MetricVerdict = "detected" | "not-detected";

export const classifyMetricVerdict = (anyDatapoints: boolean): MetricVerdict =>
  anyDatapoints ? "detected" : "not-detected";

/**
 * A missing REQUIRED metric is a real gap (critical, red). A missing
 * OPTIONAL metric — e.g. any Guardrails metric on a tenant that hasn't
 * configured Guardrails — is an expected, healthy state and must not read as
 * alarming: neutral, not amber/red.
 */
export const metricVerdictStatus = (
  tier: Tier,
  verdict: MetricVerdict,
): SemanticStatus => {
  if (verdict === "detected") return "good";
  return tier === "required" ? "critical" : "neutral";
};

export const metricVerdictColor = (tier: Tier, verdict: MetricVerdict): string =>
  statusColor(metricVerdictStatus(tier, verdict));
