import { useEffect, useId, useMemo } from "react";
import {
  useDql,
  type DqlQueryParams,
  type UseDqlOptions,
  type UseDqlResult,
} from "@dynatrace-sdk/react-hooks";
import { useSegments } from "@dynatrace/strato-components/filters";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScanLimit } from "./ScanLimitContext";
import { useSampling } from "./SamplingContext";
import { readScanMeta, useScanReporter, useScanScope } from "./ScanReportContext";
import { injectScanLimit } from "./dqlScanLimit";

const SAMPLING_RE = /samplingRatio:\s*\d+/g;
// Matches `fetch logs` / `fetch events` followed by a comma, ONLY when the
// statement (up to the next `|` pipe) does not already declare a
// samplingRatio. This app has no `fetch spans` anywhere and `timeseries`
// (metrics) has no samplingRatio parameter at all, so those are correctly
// left untouched.
const FETCH_NEEDS_SAMPLING_RE =
  /\bfetch\s+(logs|events)\s*,(?![^|]*\bsamplingRatio\b)/g;

const applySampling = (query: string, samplingRatio: number): string => {
  if (!query) return query;
  const injected = query.replace(
    FETCH_NEEDS_SAMPLING_RE,
    `fetch $1, samplingRatio: 1,`,
  );
  return injected.replace(SAMPLING_RE, `samplingRatio: ${samplingRatio}`);
};

/**
 * Extra options layered onto useDql's own options. Unlike the generic AI
 * Observability app this was split from, there is no app-wide attribute
 * filter or bucket-filter injection here — every Bedrock/Governance/
 * Telemetry query builder applies its own Account/Model/Filters conditions
 * directly (see `applyFilterConditions` in `./queries`), since those
 * conditions must be interpolated after each query's own `parse` step. The
 * scan limit is ALWAYS the toolbar selector (injected into every fetch); Grail
 * doesn't currently expose a per-query opt-out for it.
 */
export interface UseScopedDqlExtra {
  /**
   * Opt this query out of the active platform Segments (the `filterSegments`
   * request param). Used by facet/value-discovery queries that must see
   * every possible value regardless of the active segment.
   */
  ignoreSegments?: boolean;
  /**
   * Force this query's sampling ratio instead of the toolbar selection. Used
   * by facet/value-discovery queries that back dropdown option lists, which
   * should reflect the full population rather than a sampled slice — the
   * caller is responsible for extrapolating any count/sum aggregates by the
   * same ratio if it uses one coarser than the toolbar's.
   */
  samplingRatioOverride?: number;
}

/**
 * Drop-in replacement for `useDql` that injects:
 *   - the global scan-limit (injected into every fetch; no query hardcodes it)
 *   - the global sampling ratio (rewrites `samplingRatio: N` in logs/events queries)
 *   - the active filter segments (passed as a request parameter, not in DQL)
 *
 * Same signature and return shape as `useDql`. Segments are only attached
 * when at least one is selected — otherwise the underlying call uses the
 * plain string form so query keys stay stable.
 */
export function useScopedDql<T = ResultRecord>(
  query: string,
  options?: UseDqlOptions<T> & UseScopedDqlExtra,
): UseDqlResult<T> {
  const { scanLimitGb } = useScanLimit();
  const { samplingRatio } = useSampling();
  const { segments } = useSegments();
  const ignoreSegments = Boolean(options?.ignoreSegments);
  const effectiveSampling = options?.samplingRatioOverride ?? samplingRatio;

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    const sampled = applySampling(query, effectiveSampling);
    const scanned = injectScanLimit(sampled, scanLimitGb);
    if (!scanned) return scanned;
    if (ignoreSegments || !segments || segments.length === 0) return scanned;
    return { query: scanned, filterSegments: segments };
  }, [query, scanLimitGb, effectiveSampling, segments, ignoreSegments]);

  const result = useDql<T>(queryInput, options);

  // Scan telemetry: report every query's Grail scan stats (scanned bytes, exec
  // time, and whether it reached the scan-limit budget) to the ScanReport
  // aggregator, tagged with the nearest ScanScope group.
  const report = useScanReporter();
  const group = useScanScope();
  const queryId = useId();
  const injectedQuery =
    typeof queryInput === "string" ? queryInput : (queryInput?.query ?? "");
  const fetchCount = (injectedQuery.match(/scanLimitGBytes:/g) ?? []).length || 1;
  const meta = readScanMeta(result, scanLimitGb, fetchCount);
  const hasMeta = meta != null;
  const scannedBytes = meta?.scannedBytes ?? 0;
  const executionMs = meta?.executionMs ?? 0;
  const limitHit = meta?.limitHit ?? false;
  const executedQuery =
    typeof queryInput === "string" ? queryInput : (queryInput?.query ?? query);
  useEffect(() => {
    if (!hasMeta) {
      report(queryId, null);
      return;
    }
    report(queryId, { group, query: executedQuery, scannedBytes, executionMs, limitHit });
    return () => report(queryId, null);
  }, [hasMeta, group, executedQuery, scannedBytes, executionMs, limitHit, queryId, report]);

  return result;
}
