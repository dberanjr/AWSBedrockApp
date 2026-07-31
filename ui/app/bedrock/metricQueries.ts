import type { Timeframe } from "../scope/types";
import { pickChartIntervalSec } from "../scope/chartInterval";
import { dqlTimeArg } from "../scope/queries";

const K = (name: string) => `\`cloud.aws.bedrock.${name}.By.ModelId\``;

const range = (tf: Timeframe): string =>
  `from: ${dqlTimeArg(tf.from)}, to: ${dqlTimeArg(tf.to ?? "now()")}`;

/** Per-model latency/TTFT/invocations/tokens. `rollup: avg` lets the percentile
 *  fall back to average where the ingested statistic has no percentile. `interval`
 *  is fine-grained (targets ~240 buckets via `pickChartIntervalSec`, keyed off
 *  `tf.from`) so the per-tile KPI sparklines (see BedrockKpiRow / parse.ts's
 *  `aggregatePerfSeries`) render real intraday shape instead of one coarse
 *  scope-wide bucket. */
export const buildBedrockPerfByModelQuery = (tf: Timeframe): string =>
  `timeseries {
    latencyMs = avg(${K("InvocationLatency")}),
    ttftMs = avg(${K("TimeToFirstToken")}),
    invocations = sum(${K("Invocations")}),
    inTok = sum(${K("InputTokenCount")}),
    outTok = sum(${K("OutputTokenCount")})
  }, ${range(tf)}, interval: ${pickChartIntervalSec(tf.from)}s, by: { ModelId }`;

export const buildBedrockTpmQuery = (tf: Timeframe): string =>
  `timeseries tpm = avg(${K("EstimatedTPMQuotaUsage")}), ${range(tf)}, interval: ${pickChartIntervalSec(tf.from)}s, by: { ModelId }`;
