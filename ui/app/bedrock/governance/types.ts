import type { Timeframe } from "../../scope/types";
import type { FilterCondition } from "../../scope/queries";

/**
 * Scope for the Access & Governance tab. CloudTrail (`fetch events`) has no
 * per-model dimension, so governance is scoped by account + timeframe +
 * the toolbar's Filters conditions only — there is no Model selector on this
 * tab.
 */
export interface GovScope {
  timeframe: Timeframe;
  /** Selected AWS account ids (ct[recipientAccountId]); empty = all. */
  accounts: string[];
  /**
   * The toolbar's Filters conditions (identity / errorCode / eventName /
   * region / sourceIp / mfa / readOnly — see filterableAttributes.ts).
   * Applied by `govBase` via `applyFilterConditions` right after its
   * `parse` + `fieldsAdd` aliasing step.
   */
  conditions: FilterCondition[];
  /**
   * True when this tab should show canned example data instead of running
   * (or trusting the result of) its real Grail queries — either the global
   * "Show Demo Data" Tweak is on, or this tab's own telemetry-availability
   * probe found nothing for the active timeframe. Every hook in
   * `ui/app/bedrock/governance/*` reads this directly off the scope object
   * and returns its matching demo constant when true.
   */
  showExample: boolean;
}

/** Six headline governance counters (one summarize row). */
export interface GovKpis {
  totalCalls: number;
  distinctIdentities: number;
  distinctSourceIps: number;
  distinctAccounts: number;
  erroredCalls: number;
  nonMfaCalls: number;
  crossRegionCalls: number;
}

export interface ApiActionRow {
  eventName: string;
  calls: number;
}

export interface IdentityCallRow {
  identity: string;
  calls: number;
}

export interface SourceIpRow {
  sourceIp: string;
  calls: number;
  identities: number;
}

export interface IdentityMfaRow {
  identity: string;
  mfa: string;
  calls: number;
  sourceIps: number;
}

export interface AccessDeniedRow {
  identity: string;
  sourceIp: string;
  eventName: string;
  deniedCalls: number;
  lastSeen: string;
}

export interface ThrottleRow {
  identity: string;
  eventName: string;
  sourceIp: string;
  region: string;
  throttledCalls: number;
  lastSeen: string;
}

export interface CrossRegionRow {
  region: string;
  inferenceRegion: string;
  calls: number;
}

export interface ControlPlaneRow {
  timestamp: string;
  eventName: string;
  identity: string;
  region: string;
  sourceIp: string;
}

export interface ReconciliationRow {
  source: string;
  invocations: number;
}

export interface AccountRegionRow {
  accountId: string;
  region: string;
  calls: number;
  identities: number;
}

/** A folded makeTimeseries result ready for AreaChart: parallel value arrays
 *  keyed by group (eventName / errorCode) plus per-bucket time labels. */
export interface GovTimeseries {
  labels: string[];
  series: { key: string; values: number[] }[];
}
