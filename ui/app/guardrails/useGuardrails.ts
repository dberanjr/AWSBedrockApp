/**
 * AI Guardrails data hook. Runs the active provider's metric queries (AWS
 * Bedrock Guardrails today) and returns normalized per-guardrail rows + a fleet
 * rollup + an intervention-rate trend.
 *
 * The queries are `timeseries` over metrics, so there's no samplingRatio to
 * apply (metrics don't support it) — Segments are bypassed the same way every
 * other Bedrock metric hook in this app bypasses them (CloudWatch metrics
 * aren't span-scoped), while the toolbar timeframe still applies.
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "../scope/ScopeContext";
import { toNum } from "../data/format";
import {
  aggregateFleet,
  perBucketRate,
  type GuardrailRow,
  type FleetGuardrails,
} from "./guardrailsLogic";
import { GUARDRAIL_PROVIDERS } from "./providers";
import {
  DEMO_GUARDRAIL_ROWS,
  DEMO_GUARDRAIL_FLEET,
  DEMO_GUARDRAIL_TREND_RATE,
} from "../bedrock/demoData";

const AWS = GUARDRAIL_PROVIDERS.find((p) => p.id === "aws-bedrock")!;

interface TrendRecord {
  inv?: (number | null)[];
  intervened?: (number | null)[];
}

const asNumArray = (v: unknown): (number | null)[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? null : toNum(x))) : [];

export interface GuardrailsData {
  /** Per-guardrail rows, sorted by invocations desc. */
  rows: GuardrailRow[];
  /** Fleet rollup (totals, active count, rate, weighted latency, top blocker). */
  fleet: FleetGuardrails;
  /** Per-bucket fleet intervention-rate series for a trend sparkline. */
  trendRate: (number | null)[];
  /** True when the provider returned at least one guardrail. */
  hasData: boolean;
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` defaults to `false` so the one other consumer of this hook
 * (`GuardrailsSummaryCard`, currently unused elsewhere in the app) keeps
 * behaving exactly as before without needing to pass anything.
 */
export const useGuardrails = (showExample: boolean = false): GuardrailsData => {
  const { scope } = useScope();

  const summary = useScopedDql<ResultRecord>(AWS.summaryQuery!(scope.timeframe), {
    staleTime: 60_000,
    ignoreSegments: true,
    enabled: !showExample,
  });
  const trend = useScopedDql<ResultRecord>(AWS.trendQuery!(scope.timeframe), {
    staleTime: 60_000,
    ignoreSegments: true,
    enabled: !showExample,
  });

  return useMemo<GuardrailsData>(() => {
    if (showExample) {
      return {
        rows: DEMO_GUARDRAIL_ROWS,
        fleet: DEMO_GUARDRAIL_FLEET,
        trendRate: DEMO_GUARDRAIL_TREND_RATE,
        hasData: true,
        isLoading: false,
        error: undefined,
      };
    }
    const rows = AWS.parseRows!(summary.data?.records ?? []);
    const fleet = aggregateFleet(rows);
    const trec = trend.data?.records?.[0] as TrendRecord | undefined;
    const trendRate = trec
      ? perBucketRate(asNumArray(trec.inv), asNumArray(trec.intervened))
      : [];
    return {
      rows,
      fleet,
      trendRate,
      hasData: rows.length > 0,
      isLoading: summary.isLoading || trend.isLoading,
      error: summary.error ?? trend.error ?? undefined,
    };
  }, [
    showExample,
    summary.data,
    summary.isLoading,
    summary.error,
    trend.data,
    trend.isLoading,
    trend.error,
  ]);
};
