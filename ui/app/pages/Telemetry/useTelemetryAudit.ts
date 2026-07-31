/**
 * Telemetry audit data hook.
 *
 * Runs exactly one scoped DQL query per catalog section (4 total: Model
 * Invocation Logs, Runtime & Quota Metrics, Guardrails Metrics, Access &
 * Governance) and zips each result back to its field list.
 *
 * The four `useScopedDql` calls are written out explicitly (not looped over
 * SECTIONS) since there are exactly four, fixed at compile time — that keeps
 * hook order trivially stable across renders without an eslint escape hatch.
 *
 * Sections A (logs) and D (events) are called with `samplingRatioOverride: 1`
 * — an audit answering "is this field present at all" must not have sampling
 * manufacture a false sparse/missing verdict. Every section is called with
 * `ignoreSegments: true` — this audit is deliberately tenant-wide, not scoped
 * by whatever Segment happens to be active in the toolbar (same philosophy as
 * the source app's Attributes tab). The toolbar's scan limit still applies
 * automatically via useScopedDql.
 */

import { useMemo } from "react";
import type { UseDqlResult } from "@dynatrace-sdk/react-hooks";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { toNum } from "../../data/format";
import {
  SECTION_BY_ID,
  TOTAL_FIELDS,
  type AuditSection,
  type FieldSpec,
  type Tier,
} from "./catalog";
import { buildSectionQuery } from "./queries";
import {
  classifyVerdict,
  classifyMetricVerdict,
  type Verdict,
  type MetricVerdict,
} from "./coverage";

interface PopulationRecord {
  section_rows?: number | string;
  [key: string]: number | string | undefined;
}

interface MetricRecord {
  [key: string]: number | string | undefined;
}

export interface PopulationFieldResult {
  kind: "population";
  spec: FieldSpec;
  /** Raw row count carrying this field (no extrapolation — sampling is
   *  forced to 1 for population sections, so raw is already the true count). */
  rows: number;
  present: boolean;
  /** Share of the section population carrying the field (0..1). */
  share: number;
  verdict: Verdict;
}

export interface MetricFieldResult {
  kind: "metric";
  spec: FieldSpec;
  /** True when the metric emitted at least one datapoint in the window. */
  detected: boolean;
  verdict: MetricVerdict;
}

export type FieldResult = PopulationFieldResult | MetricFieldResult;

/** Per-tier presence counts for a section or the full audit. */
export interface TierStats {
  required: { present: number; total: number };
  optional: { present: number; total: number };
}

export interface SectionResult {
  section: AuditSection;
  fields: FieldResult[];
  /** Population sections: row population for the window. Metric sections:
   *  null — there is no population concept for a CloudWatch metric. */
  sectionRows: number | null;
  presentCount: number;
  /** Fields present but below the sparse-share threshold (population
   *  sections only; always 0 for metric sections). */
  sparseCount: number;
  totalCount: number;
  /** presentCount / totalCount as a percentage (0..100). */
  coveragePct: number;
  /** True when a population section's row population is zero. Always false
   *  for metric sections — zero detected metrics is meaningful information
   *  (e.g. Guardrails not configured), not an empty-data state. */
  noData: boolean;
  isLoading: boolean;
  error?: Error;
  /** Re-run this section's query. */
  refetch: () => void;
  tierStats: TierStats;
}

export interface AuditOverview {
  presentTotal: number;
  total: number;
  coveragePct: number;
  requiredPresent: number;
  requiredTotal: number;
  /** Percentage of Required fields present/detected across all sections —
   *  the actionable number that can legitimately reach 100%. */
  requiredCoveragePct: number;
  /** Sections with 100% of fields present/detected. */
  sectionsFullyCovered: number;
  sectionCount: number;
  /** Fields present but below the sparse-share threshold (population
   *  sections only). */
  sparseTotal: number;
  tierStats: TierStats;
}

export interface UseTelemetryAuditResult {
  sections: SectionResult[];
  overview: AuditOverview;
  isLoading: boolean;
  /** True once loaded and there is no Bedrock telemetry anywhere in the
   *  tenant for the selected timeframe — both population sections are empty
   *  AND both metric sections show zero detected metrics. */
  isEmpty: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const EMPTY_TIER_STATS = (): TierStats => ({
  required: { present: 0, total: 0 },
  optional: { present: 0, total: 0 },
});

const computeTierStats = (fields: FieldResult[]): TierStats => {
  const stats = EMPTY_TIER_STATS();
  for (const f of fields) {
    const t: Tier = f.spec.tier;
    stats[t].total += 1;
    const present = f.kind === "population" ? f.present : f.detected;
    if (present) stats[t].present += 1;
  }
  return stats;
};

const mergeTierStats = (all: TierStats[]): TierStats => {
  const merged = EMPTY_TIER_STATS();
  for (const s of all) {
    for (const t of ["required", "optional"] as Tier[]) {
      merged[t].total += s[t].total;
      merged[t].present += s[t].present;
    }
  }
  return merged;
};

const buildPopulationSection = (
  section: AuditSection,
  res: UseDqlResult<PopulationRecord>,
): SectionResult => {
  const record = res.data?.records?.[0];
  const rawRows = num(record?.section_rows);

  const fields: FieldResult[] = section.fields.map((spec, i) => {
    const raw = num(record?.[`a${i}`]);
    const present = raw > 0;
    const share = rawRows > 0 ? Math.min(1, raw / rawRows) : 0;
    const result: PopulationFieldResult = {
      kind: "population",
      spec,
      rows: raw,
      present,
      share,
      verdict: classifyVerdict(present, share),
    };
    return result;
  });

  const presentCount = fields.filter(
    (f): f is PopulationFieldResult => f.kind === "population" && f.present,
  ).length;
  const sparseCount = fields.filter(
    (f): f is PopulationFieldResult =>
      f.kind === "population" && f.verdict === "sparse",
  ).length;
  const totalCount = fields.length;

  return {
    section,
    fields,
    sectionRows: rawRows,
    presentCount,
    sparseCount,
    totalCount,
    coveragePct: totalCount > 0 ? (presentCount / totalCount) * 100 : 0,
    noData: !res.isLoading && rawRows === 0,
    isLoading: res.isLoading,
    error: res.error ?? undefined,
    refetch: () => void res.refetch(),
    tierStats: computeTierStats(fields),
  };
};

const buildMetricSection = (
  section: AuditSection,
  res: UseDqlResult<MetricRecord>,
): SectionResult => {
  const record = res.data?.records?.[0];

  const fields: FieldResult[] = section.fields.map((spec, i) => {
    const raw = num(record?.[`a${i}`]);
    const detected = raw > 0;
    const result: MetricFieldResult = {
      kind: "metric",
      spec,
      detected,
      verdict: classifyMetricVerdict(detected),
    };
    return result;
  });

  const presentCount = fields.filter(
    (f): f is MetricFieldResult => f.kind === "metric" && f.detected,
  ).length;
  const totalCount = fields.length;

  return {
    section,
    fields,
    sectionRows: null,
    presentCount,
    sparseCount: 0,
    totalCount,
    coveragePct: totalCount > 0 ? (presentCount / totalCount) * 100 : 0,
    noData: false,
    isLoading: res.isLoading,
    error: res.error ?? undefined,
    refetch: () => void res.refetch(),
    tierStats: computeTierStats(fields),
  };
};

export const useTelemetryAudit = (): UseTelemetryAuditResult => {
  const { scope } = useScope();

  const logsSection = SECTION_BY_ID.logs;
  const runtimeSection = SECTION_BY_ID.runtimeMetrics;
  const guardrailsSection = SECTION_BY_ID.guardrails;
  const governanceSection = SECTION_BY_ID.governance;

  const logsResult = useScopedDql<PopulationRecord>(
    buildSectionQuery(logsSection, scope.timeframe),
    { staleTime: 60_000, ignoreSegments: true, samplingRatioOverride: 1 },
  );
  const runtimeResult = useScopedDql<MetricRecord>(
    buildSectionQuery(runtimeSection, scope.timeframe),
    { staleTime: 60_000, ignoreSegments: true },
  );
  const guardrailsResult = useScopedDql<MetricRecord>(
    buildSectionQuery(guardrailsSection, scope.timeframe),
    { staleTime: 60_000, ignoreSegments: true },
  );
  const governanceResult = useScopedDql<PopulationRecord>(
    buildSectionQuery(governanceSection, scope.timeframe),
    { staleTime: 60_000, ignoreSegments: true, samplingRatioOverride: 1 },
  );

  // Stable signatures so useMemo recomputes on any query change without a
  // spread dependency array (which eslint can't statically verify).
  const dataSig = JSON.stringify([
    logsResult.data?.records?.[0] ?? null,
    runtimeResult.data?.records?.[0] ?? null,
    guardrailsResult.data?.records?.[0] ?? null,
    governanceResult.data?.records?.[0] ?? null,
  ]);
  const stateSig = [logsResult, runtimeResult, guardrailsResult, governanceResult]
    .map((r) => `${r.isLoading ? 1 : 0}:${r.error?.message ?? ""}`)
    .join("|");

  return useMemo<UseTelemetryAuditResult>(() => {
    const sections: SectionResult[] = [
      buildPopulationSection(logsSection, logsResult),
      buildMetricSection(runtimeSection, runtimeResult),
      buildMetricSection(guardrailsSection, guardrailsResult),
      buildPopulationSection(governanceSection, governanceResult),
    ];

    const presentTotal = sections.reduce((a, s) => a + s.presentCount, 0);
    const total = TOTAL_FIELDS;
    const tierStats = mergeTierStats(sections.map((s) => s.tierStats));

    const overview: AuditOverview = {
      presentTotal,
      total,
      coveragePct: total > 0 ? (presentTotal / total) * 100 : 0,
      requiredPresent: tierStats.required.present,
      requiredTotal: tierStats.required.total,
      requiredCoveragePct:
        tierStats.required.total > 0
          ? (tierStats.required.present / tierStats.required.total) * 100
          : 0,
      sectionsFullyCovered: sections.filter(
        (s) => s.totalCount > 0 && s.presentCount === s.totalCount,
      ).length,
      sectionCount: sections.length,
      sparseTotal: sections.reduce((a, s) => a + s.sparseCount, 0),
      tierStats,
    };

    const isLoading = [logsResult, runtimeResult, guardrailsResult, governanceResult].some(
      (r) => r.isLoading,
    );
    const firstError =
      logsResult.error ??
      runtimeResult.error ??
      guardrailsResult.error ??
      governanceResult.error ??
      undefined;

    // "Empty" means no Bedrock telemetry anywhere in the tenant for this
    // timeframe: both population sections have zero rows AND both metric
    // sections show zero detected metrics. A metric section alone showing
    // zero (e.g. Guardrails unconfigured) is NOT page-level empty — it's a
    // normal, healthy state for that one section.
    const isEmpty =
      !isLoading &&
      sections.every((s) =>
        s.section.kind === "metrics" ? s.presentCount === 0 : s.noData,
      );

    return { sections, overview, isLoading, isEmpty, error: firstError };
    // The real dependencies are dataSig/stateSig — the four result objects
    // are read for their current (already up to date) values inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSig, stateSig]);
};
