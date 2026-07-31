/**
 * Bedrock data hooks: an existence probe (used to gate the Runtime page) and
 * the overview/cost/session/account/perf hooks the Runtime view's sections
 * read from.
 *
 * Sampling: the log-based queries (overview, cost, sessions, account cost) let
 * the toolbar's live Sampling selection apply (no forced samplingRatioOverride)
 * — a deliberate change from the source app this was split from, which forced
 * exact (samplingRatioOverride: 1) on every query. Their count()/sum()
 * aggregates are extrapolated back up by the active ratio via `extrapolate`/
 * `extrapolateSeries`; countDistinct fields (accounts, models, sessions) are
 * NEVER extrapolated — sampling drops rows before they're counted, so scaling
 * a distinct count would overcount, not correct it. The two facet/discovery
 * queries (`useBedrockFacets`, `useBedrockAvailable`) keep a forced
 * `samplingRatioOverride: 1` since they back dropdown option lists / an
 * existence check that must see the full population, not a sampled slice.
 * The metric (`timeseries`) queries (`useBedrockPerf`) have no samplingRatio
 * parameter at all — DQL doesn't support it there — so nothing changes for them.
 *
 * Segments: kept bypassed (`ignoreSegments: true`) on every hook here, mirroring
 * the source app — these are CloudWatch log/metric queries, not span-based, so
 * platform Segments (built for entity/span scoping) don't apply meaningfully.
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "../scope/ScopeContext";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useSampling, extrapolate, extrapolateSeries } from "../scope/SamplingContext";
import { toNum } from "../data/format";
import type { Timeframe } from "../scope/types";
import type { BedrockScope } from "./types";
import {
  buildBedrockOverviewQuery,
  buildBedrockDailyCostQuery,
  buildAgentSessionsQuery,
  buildAccountModelQuery,
  buildBedrockFacetsQuery,
  bedrockSparkIntervalSec,
} from "./queries";
import { buildBedrockPerfByModelQuery, buildBedrockTpmQuery } from "./metricQueries";
import {
  parseOverview,
  parseAgentSessions,
  parsePerfByModel,
  parseAccountCost,
  parseFacets,
  aggregatePerfSeries,
  type OverviewTotals,
  type AgentSessionRow,
  type PerfByModelRow,
  type AccountCostRow,
  type BedrockFacets,
} from "./parse";
import { foldDailyCost, type BedrockDailyCostPoint } from "./series";
import type { BedrockCostSummary } from "./cost";

/** Log/metric queries bypass Segments (see file doc comment); react-query
 *  results are cached for 60s so scope tweaks don't hammer Grail. */
const OPTS = { ignoreSegments: true, staleTime: 60_000 } as const;
/** Facet/value-discovery + existence-probe queries additionally force full
 *  fidelity so the option lists / availability check see the whole population. */
const FACET_OPTS = { ...OPTS, samplingRatioOverride: 1 } as const;

/** Cheap existence probe: any bedrock log group in the last 24h. */
export const useBedrockAvailable = (): { available: boolean; isLoading: boolean } => {
  const q = `fetch logs, from: now()-24h\n| filter contains(dt.da.aws.log_group, "bedrock")\n| limit 1\n| fields timestamp`;
  const res = useScopedDql<ResultRecord>(q, FACET_OPTS);
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};

export const useBedrockOverview = (
  scope: BedrockScope,
): { totals: OverviewTotals; isLoading: boolean; error?: Error } => {
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const res = useScopedDql<ResultRecord>(buildBedrockOverviewQuery(scope, filters.conditions), OPTS);
  return useMemo(() => {
    const totals = parseOverview(res.data?.records ?? []);
    return {
      totals: {
        ...totals,
        invocations: extrapolate(totals.invocations, samplingRatio) ?? 0,
        inTok: extrapolate(totals.inTok, samplingRatio) ?? 0,
        outTok: extrapolate(totals.outTok, samplingRatio) ?? 0,
        cacheRead: extrapolate(totals.cacheRead, samplingRatio) ?? 0,
        cacheWrite: extrapolate(totals.cacheWrite, samplingRatio) ?? 0,
        errors: extrapolate(totals.errors, samplingRatio) ?? 0,
        // accounts/models/sessions are countDistinct — never extrapolated.
      },
      isLoading: res.isLoading,
      error: res.error ?? undefined,
    };
  }, [res.data, res.isLoading, res.error, samplingRatio]);
};

const scaleCostSummary = (summary: BedrockCostSummary, ratio: number): BedrockCostSummary =>
  ratio === 1
    ? summary
    : {
        total: summary.total * ratio,
        priced: summary.priced * ratio,
        estimated: summary.estimated * ratio,
        savedByCache: summary.savedByCache * ratio,
        estimatedModels: summary.estimatedModels,
      };

const scaleDaily = (daily: BedrockDailyCostPoint[], ratio: number): BedrockDailyCostPoint[] =>
  ratio === 1
    ? daily
    : daily.map((d) => ({
        day: d.day,
        byModel: Object.fromEntries(Object.entries(d.byModel).map(([k, v]) => [k, v * ratio])),
        actual: d.actual * ratio,
        savedByCache: d.savedByCache * ratio,
      }));

/** Daily per-model cost (cache-aware, with the no-cache ghost) for the cost
 *  trend chart. The bucket fold is pure logic in `series.ts` — see its tests.
 *  Cost is linear in each token tier, so scaling the already-folded cost
 *  figures by the sampling ratio is equivalent to extrapolating the token
 *  sums before pricing them. */
export const useBedrockCost = (
  scope: BedrockScope,
): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary; isLoading: boolean } => {
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const res = useScopedDql<ResultRecord>(
    buildBedrockDailyCostQuery(scope, undefined, filters.conditions),
    OPTS,
  );
  return useMemo(() => {
    const { daily, summary } = foldDailyCost(res.data?.records ?? []);
    return {
      daily: scaleDaily(daily, samplingRatio),
      summary: scaleCostSummary(summary, samplingRatio),
      isLoading: res.isLoading,
    };
  }, [res.data, res.isLoading, samplingRatio]);
};

/** Finer-grained cost series for the Total Spend hero sparkline only — same
 *  fold as {@link useBedrockCost} but at {@link bedrockSparkIntervalSec} so the
 *  spark reads as a smooth trend, independent of the (coarser, daily) cost bar
 *  chart. Returns just the per-bucket actual spend + day labels. */
export const useBedrockCostSpark = (
  scope: BedrockScope,
): { values: number[]; labels: string[]; isLoading: boolean } => {
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const res = useScopedDql<ResultRecord>(
    buildBedrockDailyCostQuery(scope, bedrockSparkIntervalSec(scope.timeframe.from), filters.conditions),
    OPTS,
  );
  return useMemo(() => {
    const { daily } = foldDailyCost(res.data?.records ?? []);
    return {
      values: extrapolateSeries(
        daily.map((d) => d.actual),
        samplingRatio,
      ),
      labels: daily.map((d) => d.day),
      isLoading: res.isLoading,
    };
  }, [res.data, res.isLoading, samplingRatio]);
};

/** Per-account cost (D4 by-account breakdown). `buildAccountModelQuery`
 *  returns one scalar `summarize` row per (account, modelId) pair — no time
 *  axis — so parsing is a flat fold, not the bucketed `foldDailyCost` the
 *  daily-cost hook uses. */
export const useBedrockAccountCost = (
  scope: BedrockScope,
): { rows: AccountCostRow[]; isLoading: boolean } => {
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const res = useScopedDql<ResultRecord>(
    buildAccountModelQuery(scope, filters.conditions),
    OPTS,
  );
  return useMemo(
    () => ({
      rows: parseAccountCost((res.data?.records ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        cost: r.cost * samplingRatio,
      })),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading, samplingRatio],
  );
};

export const useAgentSessions = (
  scope: BedrockScope,
): { rows: AgentSessionRow[]; isLoading: boolean } => {
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const res = useScopedDql<ResultRecord>(buildAgentSessionsQuery(scope, filters.conditions), OPTS);
  return useMemo(
    () => ({
      rows: parseAgentSessions((res.data?.records ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        invocations: r.invocations * samplingRatio,
        inTok: r.inTok * samplingRatio,
        outTok: r.outTok * samplingRatio,
        estCost: r.estCost * samplingRatio,
        // cachePct / errorRate are ratios of two equally-scaled sums — sampling-invariant, left as-is.
      })),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading, samplingRatio],
  );
};

export const useBedrockPerf = (
  scope: BedrockScope,
): {
  rows: PerfByModelRow[];
  tpmPeakPct: number;
  series: ReturnType<typeof aggregatePerfSeries>;
  isLoading: boolean;
} => {
  const perf = useScopedDql<ResultRecord>(buildBedrockPerfByModelQuery(scope.timeframe), OPTS);
  const tpm = useScopedDql<ResultRecord>(buildBedrockTpmQuery(scope.timeframe), OPTS);
  return useMemo(() => {
    const perfRecords = (perf.data?.records ?? []) as Record<string, unknown>[];
    const tpmRecords = (tpm.data?.records ?? []) as Record<string, unknown>[];
    const rows = parsePerfByModel(perfRecords);
    const tpmVals = tpmRecords
      .flatMap((r) => (Array.isArray(r.tpm) ? (r.tpm as unknown[]) : []))
      .map((x) => toNum(x))
      .filter((n) => Number.isFinite(n));
    return {
      rows,
      tpmPeakPct: tpmVals.length ? Math.max(...tpmVals) : 0,
      series: aggregatePerfSeries(perfRecords, tpmRecords),
      isLoading: perf.isLoading || tpm.isLoading,
    };
  }, [perf.data, perf.isLoading, tpm.data, tpm.isLoading]);
};

/**
 * Distinct accounts + models for the scope-selector option lists. Deliberately
 * takes only `timeframe` (not the full `BedrockScope`) and routes through
 * `buildBedrockFacetsQuery`, which never applies the current account/model
 * selection — see that query's doc comment for why a self-scoped facets query
 * would make each picker prune its own options.
 */
export const useBedrockFacets = (timeframe: Timeframe): BedrockFacets & { isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockFacetsQuery(timeframe), FACET_OPTS);
  return useMemo(
    () => ({
      ...parseFacets((res.data?.records ?? []) as Record<string, unknown>[]),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading],
  );
};

export { useScope }; // re-export for page convenience
