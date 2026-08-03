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
 *
 * Demo data: every hook below takes (or, for useGovernanceFacets, is passed)
 * `scope.showExample` / `showExample`. When true, the hook disables its real
 * Grail query (`enabled: false` — so nothing fires against the tenant) and
 * returns the matching canned constant from `./demoData` instead, with
 * `isLoading: false` immediately. See `GovScope.showExample` in `./types` for
 * when that flag turns on (the global "Show Demo Data" Tweak, or this tab's
 * own telemetry-availability probe finding nothing).
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../../scope/useScopedDql";
import { useSampling, extrapolate, extrapolateSeries } from "../../scope/SamplingContext";
import { useTweaks } from "../../tweaks/TweaksContext";
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
  buildGovernanceAvailableQuery,
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
import {
  DEMO_ACCOUNTS,
  DEMO_GOV_KPIS,
  DEMO_API_ACTIONS,
  DEMO_API_ACTIONS_TIMESERIES,
  DEMO_TOP_IDENTITIES,
  DEMO_TOP_SOURCE_IPS,
  DEMO_IDENTITY_MFA,
  DEMO_ACCESS_DENIED,
  DEMO_THROTTLES,
  DEMO_ERRORS_TIMESERIES,
  DEMO_CROSS_REGION,
  DEMO_CONTROL_PLANE,
  DEMO_RECONCILIATION,
  DEMO_ACCOUNT_REGION,
  DEMO_EXFIL_DESTINATIONS,
  DEMO_EXFIL_ACTORS,
  DEMO_EXFIL_TIMESERIES,
  DEMO_EXFIL_DETAIL,
} from "./demoData";

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
  const res = useScopedDql<ResultRecord>(buildGovKpisQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(() => {
    const raw = parseGovKpis(recs(res.data));
    return {
      ...raw,
      totalCalls: extrap(raw.totalCalls, samplingRatio),
      erroredCalls: extrap(raw.erroredCalls, samplingRatio),
      nonMfaCalls: extrap(raw.nonMfaCalls, samplingRatio),
      crossRegionCalls: extrap(raw.crossRegionCalls, samplingRatio),
      // distinctIdentities / distinctSourceIps / distinctAccounts stay raw —
      // countDistinct() can't be extrapolated.
    };
  }, [res.data, samplingRatio]);
  return {
    kpis: s.showExample ? DEMO_GOV_KPIS : real,
    isLoading: s.showExample ? false : res.isLoading,
  };
};

export const useGovApiActions = (s: GovScope) => {
  const bars = useScopedDql<ResultRecord>(buildApiActionsQuery(s), { ...OPTS, enabled: !s.showExample });
  const series = useScopedDql<ResultRecord>(buildApiActionsTimeseriesQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
    () => ({
      rows: parseApiActions(recs(bars.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
      timeseries: extrapTimeseries(foldGovTimeseries(recs(series.data), "calls", "eventName"), samplingRatio),
    }),
    [bars.data, series.data, samplingRatio],
  );
  return {
    rows: s.showExample ? DEMO_API_ACTIONS : real.rows,
    timeseries: s.showExample ? DEMO_API_ACTIONS_TIMESERIES : real.timeseries,
    isLoading: s.showExample ? false : bars.isLoading || series.isLoading,
  };
};

export const useGovIdentities = (s: GovScope) => {
  const top = useScopedDql<ResultRecord>(buildTopIdentitiesQuery(s), { ...OPTS, enabled: !s.showExample });
  const ips = useScopedDql<ResultRecord>(buildTopSourceIpsQuery(s), { ...OPTS, enabled: !s.showExample });
  const mfa = useScopedDql<ResultRecord>(buildIdentityMfaQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
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
    }),
    [top.data, ips.data, mfa.data, samplingRatio],
  );
  return {
    topIdentities: s.showExample ? DEMO_TOP_IDENTITIES : real.topIdentities,
    topSourceIps: s.showExample ? DEMO_TOP_SOURCE_IPS : real.topSourceIps,
    identityMfa: s.showExample ? DEMO_IDENTITY_MFA : real.identityMfa,
    isLoading: s.showExample ? false : top.isLoading || ips.isLoading || mfa.isLoading,
  };
};

export const useGovAccessDenied = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildAccessDeniedQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
    () =>
      parseAccessDenied(recs(res.data)).map((r) => ({
        ...r,
        deniedCalls: extrap(r.deniedCalls, samplingRatio),
      })),
    [res.data, samplingRatio],
  );
  return {
    rows: s.showExample ? DEMO_ACCESS_DENIED : real,
    isLoading: s.showExample ? false : res.isLoading,
  };
};

export const useGovThrottles = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildThrottleQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
    () =>
      parseThrottles(recs(res.data)).map((r) => ({
        ...r,
        throttledCalls: extrap(r.throttledCalls, samplingRatio),
      })),
    [res.data, samplingRatio],
  );
  return {
    rows: s.showExample ? DEMO_THROTTLES : real,
    isLoading: s.showExample ? false : res.isLoading,
  };
};

export const useGovErrorsSeries = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildErrorsTimeseriesQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
    () => extrapTimeseries(foldGovTimeseries(recs(res.data), "errors", "errorCode"), samplingRatio),
    [res.data, samplingRatio],
  );
  return {
    timeseries: s.showExample ? DEMO_ERRORS_TIMESERIES : real,
    isLoading: s.showExample ? false : res.isLoading,
  };
};

export const useGovCrossRegion = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildCrossRegionQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
    () => parseCrossRegion(recs(res.data)).map((r) => ({ ...r, calls: extrap(r.calls, samplingRatio) })),
    [res.data, samplingRatio],
  );
  return {
    rows: s.showExample ? DEMO_CROSS_REGION : real,
    isLoading: s.showExample ? false : res.isLoading,
  };
};

export const useGovControlPlane = (s: GovScope) => {
  // Raw event list (no aggregate) — nothing to extrapolate. Sampling can still
  // thin the row SET itself (inherent to sampling a raw event list, same as
  // any "recent events" table elsewhere in the app).
  const res = useScopedDql<ResultRecord>(buildControlPlaneQuery(s), { ...OPTS, enabled: !s.showExample });
  const real = useMemo(() => parseControlPlane(recs(res.data)), [res.data]);
  return {
    rows: s.showExample ? DEMO_CONTROL_PLANE : real,
    isLoading: s.showExample ? false : res.isLoading,
  };
};

/**
 * Cross-region / data-exfiltration deep-dive — the four datasets behind the
 * Cross-region tile modal: per-destination-country breakdown, the actors
 * driving out-of-country inference (with client classification), the
 * out-of-country-vs-same-country timeline, and the raw per-call detail list.
 */
export const useExfiltration = (s: GovScope) => {
  const dest = useScopedDql<ResultRecord>(buildExfilByDestinationQuery(s), { ...OPTS, enabled: !s.showExample });
  const actors = useScopedDql<ResultRecord>(buildExfilActorsQuery(s), { ...OPTS, enabled: !s.showExample });
  const series = useScopedDql<ResultRecord>(buildExfilTimeseriesQuery(s), { ...OPTS, enabled: !s.showExample });
  const detail = useScopedDql<ResultRecord>(buildExfilDetailQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
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
    }),
    [dest.data, actors.data, series.data, detail.data, samplingRatio],
  );
  return {
    destinations: s.showExample ? DEMO_EXFIL_DESTINATIONS : real.destinations,
    actors: s.showExample ? DEMO_EXFIL_ACTORS : real.actors,
    timeseries: s.showExample ? DEMO_EXFIL_TIMESERIES : real.timeseries,
    detail: s.showExample ? DEMO_EXFIL_DETAIL : real.detail,
    isLoading: s.showExample ? false : dest.isLoading || actors.isLoading || series.isLoading || detail.isLoading,
  };
};

/**
 * Logging-coverage reconciliation: CloudTrail invoke-event count vs
 * ModelInvocationLog metering count. Forces `samplingRatioOverride: 1` on the
 * comparison query — unlike the rest of this tab, these two numbers need to be
 * EXACT (not extrapolated) for the gap to mean anything, since extrapolating
 * two independently-sampled counts and subtracting them would compound error.
 * The account/region breakdown alongside it is an ordinary governance
 * breakdown, so it follows the toolbar's sampling like every other query here.
 *
 * Deliberately self-contained (does not import anything from
 * `ui/app/bedrock/*` top-level) — see the module's own doc comments.
 */
export const useGovReconciliation = (s: GovScope) => {
  const recon = useScopedDql<ResultRecord>(buildReconciliationQuery(s), {
    ...OPTS,
    samplingRatioOverride: 1,
    enabled: !s.showExample,
  });
  const acctRegion = useScopedDql<ResultRecord>(buildAccountRegionQuery(s), { ...OPTS, enabled: !s.showExample });
  const { samplingRatio } = useSampling();
  const real = useMemo(
    () => ({
      reconciliation: parseReconciliation(recs(recon.data)),
      accountRegion: parseAccountRegion(recs(acctRegion.data)).map((r) => ({
        ...r,
        calls: extrap(r.calls, samplingRatio),
      })),
    }),
    [recon.data, acctRegion.data, samplingRatio],
  );
  return {
    reconciliation: s.showExample ? DEMO_RECONCILIATION : real.reconciliation,
    accountRegion: s.showExample ? DEMO_ACCOUNT_REGION : real.accountRegion,
    isLoading: s.showExample ? false : recon.isLoading || acctRegion.isLoading,
  };
};

/**
 * Account facets for the toolbar Account picker (D6). Deliberately takes only
 * `timeframe` (not the full GovScope) and forces `ignoreSegments: true` +
 * `samplingRatioOverride: 1` — a discovery/option-list query should show the
 * full population (every account CloudTrail has EVER seen in scope),
 * unaffected by the active segment or by sampling dropping a low-volume
 * account's only rows.
 *
 * `showExample` is a separate second parameter (not read off a GovScope,
 * since the caller builds this BEFORE it has an account selection to put in
 * one) — when true, the real facets query never runs and a canned 3-account
 * list is returned instead, so the Account picker is still populated and
 * clickable in demo mode.
 */
export const useGovernanceFacets = (
  timeframe: Timeframe,
  showExample: boolean,
): { accounts: string[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildGovFacetsQuery(timeframe), {
    ignoreSegments: true,
    samplingRatioOverride: 1,
    staleTime: 60_000,
    enabled: !showExample,
  });
  const real = useMemo(() => {
    const row = (res.data?.records ?? [])[0] as Rec | undefined;
    const raw = row?.accounts;
    return Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
  }, [res.data]);
  return {
    accounts: showExample ? DEMO_ACCOUNTS : real,
    isLoading: showExample ? false : res.isLoading,
  };
};

/**
 * Cheap existence probe: any Bedrock CloudTrail event in the last 24h. Gates
 * the whole page — this tab is a fully independent route now (no longer a
 * sub-tab sharing the Runtime tab's logs-based gate), so it needs its own
 * events-based check. Forced exact (`samplingRatioOverride: 1`) so a heavily
 * sampled, low-volume tenant can't produce a false "no instrumentation".
 *
 * Scoped to the CALLER'S selected timeframe (not a hardcoded rolling window —
 * the Runtime tab's `useBedrockAvailable` probe had the identical bug: a
 * fixed lookback here would disagree with every other query on the page and
 * produce a false "no telemetry" banner over data that's actually populated).
 *
 * Deliberately reads the global "Show Demo Data" Tweak directly rather than
 * taking a `GovScope` — this probe is what `GovernancePage` uses to DECIDE
 * `scope.showExample` in the first place, so it can't read that field off a
 * scope object without a chicken-and-egg problem. When the Tweak is on, the
 * real query is skipped entirely and this reports "available" immediately
 * (the probe result is irrelevant once demo mode is forced on).
 */
export const useGovernanceAvailable = (
  timeframe: Timeframe,
): { available: boolean; isLoading: boolean } => {
  const { showDemoData } = useTweaks();
  const res = useScopedDql<ResultRecord>(buildGovernanceAvailableQuery(timeframe), {
    ignoreSegments: true,
    samplingRatioOverride: 1,
    staleTime: 60_000,
    enabled: !showDemoData,
  });
  if (showDemoData) return { available: true, isLoading: false };
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};
