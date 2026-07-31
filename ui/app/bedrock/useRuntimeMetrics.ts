/**
 * Runtime Observability 2.0 metric hooks — thin `useScopedDql` + parser
 * wrappers for the three metric families (per-model TPM quota, log-delivery
 * health, latency/TTFT bands) plus the per-model summary. Mirrors
 * `useBedrock.ts`: metric `timeseries` queries have no samplingRatio
 * parameter at all, so there's nothing to extrapolate here; Segments are
 * bypassed for the same reason as the log-based hooks (CloudWatch metrics
 * aren't span-scoped).
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import type { BedrockScope } from "./types";
import {
  buildTpmByModelQuery,
  buildLogDeliveryQuery,
  buildLatencyBandsQuery,
  buildTtftBandsQuery,
  buildPerModelSummaryQuery,
  parseTpmByModel,
  parseLogDelivery,
  parseBands,
  parsePerModelSummary,
  type TpmModelRow,
  type LogDelivery,
  type MetricBands,
  type PerModelSummaryRow,
} from "./runtimeMetrics";

const OPTS = { ignoreSegments: true, staleTime: 60_000 } as const;

type Rec = Record<string, unknown>;
const recs = (data: { records?: ResultRecord[] } | undefined): Rec[] =>
  data?.records ?? [];

export const useTpmByModel = (
  s: BedrockScope,
): { rows: TpmModelRow[]; peak: number; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildTpmByModelQuery(s), OPTS);
  return useMemo(() => {
    const rows = parseTpmByModel(recs(res.data));
    return { rows, peak: rows.length ? Math.max(...rows.map((r) => r.peak)) : 0, isLoading: res.isLoading };
  }, [res.data, res.isLoading]);
};

export const useLogDelivery = (
  s: BedrockScope,
): { delivery: LogDelivery; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildLogDeliveryQuery(s), OPTS);
  return useMemo(
    () => ({ delivery: parseLogDelivery(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useLatencyBands = (
  s: BedrockScope,
): { latency: MetricBands; ttft: MetricBands; isLoading: boolean } => {
  const lat = useScopedDql<ResultRecord>(buildLatencyBandsQuery(s), OPTS);
  const ttft = useScopedDql<ResultRecord>(buildTtftBandsQuery(s), OPTS);
  return useMemo(
    () => ({
      latency: parseBands(recs(lat.data)),
      ttft: parseBands(recs(ttft.data)),
      isLoading: lat.isLoading || ttft.isLoading,
    }),
    [lat.data, lat.isLoading, ttft.data, ttft.isLoading],
  );
};

export const usePerModelSummary = (
  s: BedrockScope,
): { rows: PerModelSummaryRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildPerModelSummaryQuery(s), OPTS);
  return useMemo(
    () => ({ rows: parsePerModelSummary(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};
