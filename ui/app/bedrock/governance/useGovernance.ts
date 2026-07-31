/**
 * Access & Governance data hooks — thin wrappers over `useScopedDql` + the pure
 * parsers in parse.ts/exfiltration.ts, one per CloudTrail query. These are
 * `fetch events` queries with no `gen_ai.*` span attributes, so (like every
 * other page in this app) they don't need the span-only injectors — but,
 * unlike the app this was split from, they do NOT force
 * `samplingRatioOverride: 1`. The toolbar's live Sampling selection applies
 * here like everywhere else (an explicit product decision), which means every
 * `count()`/`countIf()` aggregate this module returns is EXTRAPOLATED back up
 * by the active sampling ratio before it reaches a component.
 *
 * `countDistinct()` aggregates (distinctIdentities, distinctSourceIps,
 * distinctAccounts, and the `identities`/`sourceIps` columns on several detail
 * rows) are the one exception: sampling drops rows before they're ever counted,
 * so multiplying a distinct count by the sampling ratio would OVERCOUNT, not
 * correct it. Those are passed through raw. Components render
 * `<SamplingBadge />` (self-hiding when sampling is off) next to the
 * extrapolated numbers, and should caveat the raw distinct counts in their
 * info tooltips ("exact only when Sampling is set to 'None'").
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../../scope/useScopedDql";
import { useSampling, extrapolate, extrapolateSeries } from "../../scope/SamplingContext";
import type { Timeframe } from "../../scope/types";
import type { GovScope, GovTimeseries } from "./types";
import {
  buildGovKpisQuery,
  buildApiActionsQuery,
  buildApiActionsTimeseriesQuery,
  buildTopIdentitiesQuery,
  buildTopSourceIpsQuery,
  buildIdentityMfaQuery,
  buildAccessDeniedQuery,
  buildThrottleQuery,
  buildErrorsTimeseriesQuery,
  buildCrossRegionQuery,
  buildControlPlaneQuery,
  buildAccountRegionQuery,
  buildReconciliationQuery,
  buildGovFacetsQuery,
} from "./queries";
import {
  parseGovKpis,
  parseApiActions,
  parseTopIdentities,
  parseTopSourceIps,
  parseIdentityMfa,
  parseAccessDenied,
  parseThrottles,
  parseCrossRegion,
  parseControlPlane,
  parseAccountRegion,
  parseReconciliation,
  foldGovTimeseries,
} from "./parse";
import {
  buildExfilByDestinationQuery,
  buildExfilActorsQuery,
  buildExfilTimeseriesQuery,
  buildExfilDetailQuery,
  parseExfilDestinations,
  parseExfilActors,
  parseExfilDetail,
} from "./exfiltration";

const OPTS = { staleTime: 60_000 } as const;

type Rec = Record<string, unknown>;
const recs = (data: { records?: ResultRecord[] } | undefined): Rec[] =>
  data?.records ?? [];

/** Extrapolate a `GovTimeseries`'s per-bucket values by the sampling ratio
 *  (every series here is a `count()` split by a dimension — never distinct). */
const extrapTimeseries = (ts: GovTimeseries, ratio: number): GovTimeseries => ({
  labels: ts.labels,
  series: ts.series.map((s) => ({ key: s.key, values: extrapolateSeries(s.values, ratio) })),
});

const extrap = (v: number, ratio: number): number => extrapolate(v, ratio) ?? v;

export const useGovKpis = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildGovKpisQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(() => {
    const raw = parseGovKpis(recs(res.data));
    return {
      kpis: {
        ...raw,
        totalCalls: extrap(raw.totalCalls, samplingRatio),
        erroredCalls: extrap(raw.erroredCalls, samplingRatio),
        nonMfaCalls: extrap(raw.nonMfaCalls, samplingRatio),
        crossRegionCalls: extrap(raw.crossRegionCalls, samplingRatio),
        // distinctIdentities / distinctSourceIps / distinctAccounts stay raw —
        // countDistinct() can't be extrapolated.
      },
      isLoading: res.isLoading,
    };
  }, [res.data, res.isLoading, samplingRatio]);
};

export const useGovApiActions = (s: GovScope) => {
  const bars = useScopedDql<ResultRecord>(buildApiActionsQuery(s), OPTS);
  const series = useScopedDql<ResultRecord>(buildApiActionsTimeseriesQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      rows: parseApiActions(recs(bars.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      timeseries: extrapTimeseries(foldGovTimeseries(recs(series.data), "calls", "eventName"), samplingRatio),
      isLoading: bars.isLoading || series.isLoading,
    }),
    [bars.data, bars.isLoading, series.data, series.isLoading, samplingRatio],
  );
};

export const useGovIdentities = (s: GovScope) => {
  const top = useScopedDql<ResultRecord>(buildTopIdentitiesQuery(s), OPTS);
  const ips = useScopedDql<ResultRecord>(buildTopSourceIpsQuery(s), OPTS);
  const mfa = useScopedDql<ResultRecord>(buildIdentityMfaQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      topIdentities: parseTopIdentities(recs(top.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      // `identities` (topSourceIps) / `sourceIps` (identityMfa) are countDistinct — raw.
      topSourceIps: parseTopSourceIps(recs(ips.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      identityMfa: parseIdentityMfa(recs(mfa.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      isLoading: top.isLoading || ips.isLoading || mfa.isLoading,
    }),
    [top.data, top.isLoading, ips.data, ips.isLoading, mfa.data, mfa.isLoading, samplingRatio],
  );
};

export const useGovAccessDenied = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildAccessDeniedQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      rows: parseAccessDenied(recs(res.data)).map((r) => ({
        ...r,
        deniedCalls: extrap(r.deniedCalls, samplingRatio),
      })),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading, samplingRatio],
  );
};

export const useGovThrottles = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildThrottleQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      rows: parseThrottles(recs(res.data)).map((r) => ({
        ...r,
        throttledCalls: extrap(r.throttledCalls, samplingRatio),
      })),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading, samplingRatio],
  );
};

export const useGovErrorsSeries = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildErrorsTimeseriesQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      timeseries: extrapTimeseries(foldGovTimeseries(recs(res.data), "errors", "errorCode"), samplingRatio),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading, samplingRatio],
  );
};

export const useGovCrossRegion = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildCrossRegionQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      rows: parseCrossRegion(recs(res.data)).map((r) => ({ ...r, calls: extrap(r.calls, samplingRatio) })),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading, samplingRatio],
  );
};

export const useGovControlPlane = (s: GovScope) => {
  // Raw event list (no aggregate) — nothing to extrapolate. Sampling can still
  // thin the row SET itself (inherent to sampling a raw event list, same as
  // any "recent events" table elsewhere in the app).
  const res = useScopedDql<ResultRecord>(buildControlPlaneQuery(s), OPTS);
  return useMemo(
    () => ({ rows: parseControlPlane(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

/**
 * Cross-region / data-exfiltration deep-dive — the four datasets behind the
 * Cross-region tile modal: per-destination-country breakdown, the actors
 * driving out-of-country inference (with client classification), the
 * out-of-country-vs-same-country timeline, and the raw per-call detail list.
 */
export const useExfiltration = (s: GovScope) => {
  const dest = useScopedDql<ResultRecord>(buildExfilByDestinationQuery(s), OPTS);
  const actors = useScopedDql<ResultRecord>(buildExfilActorsQuery(s), OPTS);
  const series = useScopedDql<ResultRecord>(buildExfilTimeseriesQuery(s), OPTS);
  const detail = useScopedDql<ResultRecord>(buildExfilDetailQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      // identities / sourceIps / destinations below are countDistinct — raw.
      destinations: parseExfilDestinations(recs(dest.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      actors: parseExfilActors(recs(actors.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      timeseries: extrapTimeseries(foldGovTimeseries(recs(series.data), "calls", "category"), samplingRatio),
      detail: parseExfilDetail(recs(detail.data)),
      isLoading: dest.isLoading || actors.isLoading || series.isLoading || detail.isLoading,
    }),
    [dest.data, dest.isLoading, actors.data, actors.isLoading, series.data, series.isLoading, detail.data, detail.isLoading, samplingRatio],
  );
};

/**
 * Logging-coverage reconciliation: CloudTrail invoke-event count vs
 * ModelInvocationLog metering count. Forces `samplingRatioOverride: 1` on the
 * comparison query — unlike the rest of this tab, these two numbers need to be
 * EXACT (not extrapolated) for the gap to mean anything, since extrapolating
 * two independently-sampled counts and subtracting them would compound error.
 * The account/region breakdown alongside it is an ordinary governance
 * breakdown, so it follows the toolbar's sampling like every other query here.
 */
export const useGovReconciliation = (s: GovScope) => {
  const recon = useScopedDql<ResultRecord>(buildReconciliationQuery(s), {
    ...OPTS,
    samplingRatioOverride: 1,
  });
  const acctRegion = useScopedDql<ResultRecord>(buildAccountRegionQuery(s), OPTS);
  const { samplingRatio } = useSampling();
  return useMemo(
    () => ({
      reconciliation: parseReconciliation(recs(recon.data)),
      accountRegion: parseAccountRegion(recs(acctRegion.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      isLoading: recon.isLoading || acctRegion.isLoading,
    }),
    [recon.data, recon.isLoading, acctRegion.data, acctRegion.isLoading, samplingRatio],
  );
};

/**
 * Account facets for the toolbar Account picker (D6). Deliberately takes only
 * `timeframe` (not the full GovScope) and forces `ignoreSegments: true` +
 * `samplingRatioOverride: 1` — a discovery/option-list query should show the
 * full population (every account CloudTrail has EVER seen in scope),
 * unaffected by the active segment or by sampling dropping a low-volume
 * account's only rows.
 */
export const useGovernanceFacets = (
  timeframe: Timeframe,
): { accounts: string[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildGovFacetsQuery(timeframe), {
    ignoreSegments: true,
    samplingRatioOverride: 1,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const row = (res.data?.records ?? [])[0] as Rec | undefined;
    const raw = row?.accounts;
    const accounts = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    return { accounts, isLoading: res.isLoading };
  }, [res.data, res.isLoading]);
};

/**
 * Cheap existence probe: any Bedrock CloudTrail event in the last 24h. Gates
 * the whole page — this tab is a fully independent route now (no longer a
 * sub-tab sharing the Runtime tab's logs-based gate), so it needs its own
 * events-based check. Forced exact (`samplingRatioOverride: 1`) so a heavily
 * sampled, low-volume tenant can't produce a false "no instrumentation".
 */
export const useGovernanceAvailable = (): { available: boolean; isLoading: boolean } => {
  const q = `fetch events, from: now()-24h
| filter cloud.provider == "aws"
| parse data, "JSON:ct"
| filter ct[eventSource] == "bedrock.amazonaws.com"
| limit 1
| fields timestamp`;
  const res = useScopedDql<ResultRecord>(q, {
    ignoreSegments: true,
    samplingRatioOverride: 1,
    staleTime: 60_000,
  });
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};
