/**
 * Telemetry audit — per-section DQL builders.
 *
 * One query per catalog section (4 total), mirroring the source app's
 * Attribute Audit `buildSectionQuery` pattern: every field's presence check is
 * packed into a single `summarize`/`timeseries` block alongside a population
 * denominator, so the whole audit costs 4 DQL executions, not one per field.
 *
 * Two shapes, matching the two section kinds in catalog.ts:
 *
 *   - "logs" / "events" (Section A, D): `fetch logs|events` → filter (cheap,
 *     pre-parse fields) → `parse` → optional post-parse filter → `summarize {
 *     section_rows = count(), a0 = countIf(isNotNull(...)), ... }`. Every
 *     field's presence is a countIf against the section's row population —
 *     the classic present/sparse/missing shape from the source app.
 *
 *   - "metrics" (Section B, C): `timeseries { a0 = count(`metric.key`,
 *     scalar:true), ... }`. There is no population/countIf concept for a
 *     CloudWatch metric — `count(metric, scalar:true)` collapses the whole
 *     timeframe to a single "how many datapoints landed" scalar, which is
 *     exactly the binary detected/not-detected signal this section needs.
 *
 * Every query interpolates the active scope's timeframe only. Sections A and
 * D are called with `samplingRatioOverride: 1` and every section is called
 * with `ignoreSegments: true` (see useTelemetryAudit.ts) — this audit answers
 * "is this field present at all," so sampling must never manufacture a false
 * sparse/missing verdict, and the audit is deliberately tenant-wide, not
 * scoped to whatever Segment happens to be active in the toolbar. No query
 * here hardcodes `scanLimitGBytes` — useScopedDql injects the toolbar's scan
 * limit into every `fetch` automatically; `timeseries` has no such parameter.
 */

import { dqlTimeArg } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";
import type { AuditSection } from "./catalog";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Build the coverage query for a "logs" or "events" section. The summarize
 * block names the field counters a0..aN in catalog order so the hook can zip
 * them back to `section.fields`.
 */
export const buildPopulationSectionQuery = (
  section: AuditSection,
  timeframe: Timeframe,
): string => {
  if (!section.prefilter || !section.parse) {
    throw new Error(
      `Telemetry section "${section.id}" is missing its logs/events query shape (prefilter/parse)`,
    );
  }

  const fetchKind = section.kind === "events" ? "events" : "logs";
  const counters = section.fields
    .map((f, i) => `    a${i} = countIf(isNotNull(${f.path}))`)
    .join(",\n");
  const postfilter = section.postfilter ? `\n| filter ${section.postfilter}` : "";

  return `
fetch ${fetchKind}, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter ${section.prefilter}
| parse ${section.parse}${postfilter}
| summarize {
    section_rows = count(),
${counters}
  }
`.trim();
};

/**
 * Build the presence-check query for a "metrics" section — one
 * `count(metric, scalar:true)` per catalog metric, packed into a single
 * `timeseries` block. `scalar:true` collapses each aggregation to a single
 * value spanning the whole timeframe instead of materializing an array,
 * which is all a presence check needs.
 */
export const buildMetricSectionQuery = (
  section: AuditSection,
  timeframe: Timeframe,
): string => {
  const counters = section.fields
    .map((f, i) => `    a${i} = count(\`${f.path}\`, scalar:true)`)
    .join(",\n");

  return `
timeseries {
${counters}
  }, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
`.trim();
};

/** Dispatch to the right builder for a section's kind. */
export const buildSectionQuery = (
  section: AuditSection,
  timeframe: Timeframe,
): string =>
  section.kind === "metrics"
    ? buildMetricSectionQuery(section, timeframe)
    : buildPopulationSectionQuery(section, timeframe);
