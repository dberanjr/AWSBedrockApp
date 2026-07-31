import type { GovScope } from "./types";
import type { Timeframe } from "../../scope/types";
import { pickChartIntervalSec } from "../../scope/chartInterval";
import { applyFilterConditions, dqlIdArray, dqlTimeArg } from "../../scope/queries";

/**
 * Access & Governance query builders — 100% CloudTrail (`fetch events`,
 * eventSource `bedrock.amazonaws.com`). Every builder shares {@link govBase},
 * which parses the CloudTrail `data` payload as `JSON:ct`, flattens the
 * governance-relevant fields, applies the toolbar's Filters conditions (via
 * `applyFilterConditions`), and finally the Account scope.
 *
 * These are `fetch events` queries. Unlike the source app this was split from,
 * they do NOT force `samplingRatioOverride: 1` — the toolbar's live Sampling
 * selection applies like everywhere else (see useGovernance.ts for how the
 * resulting count()/countDistinct() aggregates are handled downstream).
 */

// The four Bedrock data-plane invoke event names — extracted to a const so the
// long CloudTrail identifier doesn't trip the no-secrets entropy lint inside a
// template literal. Not a secret; a public AWS API action name list.
// eslint-disable-next-line noSecrets/no-secrets
const INVOKE_EVENTS = '"InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream"';

const tf = (s: GovScope): string =>
  `from: ${dqlTimeArg(s.timeframe.from)}, to: ${dqlTimeArg(s.timeframe.to ?? "now()")}`;

/** Maps the closed-vocabulary Filters keys (FILTERABLE_ATTRIBUTES) to the
 *  field aliases `govBase`'s `fieldsAdd` step produces. All seven keys apply
 *  to this CloudTrail-backed tab. */
const GOV_FILTER_FIELDS: Record<string, string> = {
  identity: "identity_name",
  errorCode: "errorCode",
  eventName: "eventName",
  region: "region",
  sourceIp: "sourceIp",
  mfa: "mfa",
  readOnly: "readOnly",
};

/** Base pipeline: bedrock CloudTrail events → parsed `ct` → flattened fields →
 *  toolbar Filters conditions → optional account scope. `identity_name` is the
 *  last ARN path segment (role session / user name), matching the source
 *  dashboard. */
export const govBase = (s: GovScope): string => {
  const parts = [
    `fetch events, ${tf(s)}`,
    `| filter cloud.provider == "aws"`,
    `| parse data, "JSON:ct"`,
    `| filter ct[eventSource] == "bedrock.amazonaws.com"`,
    `| fieldsAdd
    eventName       = ct[eventName],
    arn             = ct[userIdentity][arn],
    accountId       = ct[recipientAccountId],
    region          = ct[awsRegion],
    sourceIp        = ct[sourceIPAddress],
    errorCode       = ct[errorCode],
    mfa             = ct[userIdentity][sessionContext][attributes][mfaAuthenticated],
    inferenceRegion = ct[serviceEventDetails][AdditionalEventData][additionalEntries][inferenceRegion],
    readOnly        = ct[readOnly]`,
    `| fieldsAdd identity_name = arrayLast(splitString(arn, "/"))`,
  ];
  const filterPipes = applyFilterConditions(s.conditions, GOV_FILTER_FIELDS);
  if (filterPipes) parts.push(filterPipes);
  if (s.accounts.length) {
    parts.push(`| filter in(accountId, array(${dqlIdArray(s.accounts)}))`);
  }
  return parts.join("\n");
};

const interval = (s: GovScope): number => pickChartIntervalSec(s.timeframe.from);

/** Six headline counters in one summarize (matches the KPI band). */
export const buildGovKpisQuery = (s: GovScope): string =>
  `${govBase(s)}
| summarize {
    totalCalls = count(),
    distinctIdentities = countDistinct(identity_name),
    distinctSourceIps = countDistinct(sourceIp),
    distinctAccounts = countDistinct(accountId),
    erroredCalls = countIf(isNotNull(errorCode)),
    nonMfaCalls = countIf(mfa == "false"),
    crossRegionCalls = countIf(isNotNull(inferenceRegion) and inferenceRegion != region)
  }`;

export const buildApiActionsQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(eventName)
| summarize calls = count(), by: { eventName }
| sort calls desc`;

export const buildApiActionsTimeseriesQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(eventName)
| makeTimeseries calls = count(), interval: ${interval(s)}s, by: { eventName }`;

export const buildTopIdentitiesQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(identity_name)
| summarize calls = count(), by: { identity_name }
| sort calls desc
| limit 15`;

export const buildTopSourceIpsQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(sourceIp)
| summarize calls = count(), identities = countDistinct(identity_name), by: { sourceIp }
| sort calls desc
| limit 20`;

export const buildIdentityMfaQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(identity_name)
| summarize calls = count(), source_ips = countDistinct(sourceIp), by: { identity_name, mfa }
| sort calls desc
| limit 25`;

export const buildAccessDeniedQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(errorCode) and contains(errorCode, "AccessDenied")
| summarize deniedCalls = count(), lastSeen = takeMax(timestamp), by: { identity_name, sourceIp, eventName }
| sort deniedCalls desc
| limit 50`;

export const buildThrottleQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(errorCode) and (contains(errorCode, "Throttling") or contains(errorCode, "TooManyRequests"))
| summarize throttledCalls = count(), lastSeen = takeMax(timestamp), by: { identity_name, eventName, sourceIp, region }
| sort throttledCalls desc
| limit 50`;

export const buildErrorsTimeseriesQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(errorCode)
| makeTimeseries errors = count(), interval: ${interval(s)}s, by: { errorCode }`;

export const buildCrossRegionQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(inferenceRegion)
| summarize calls = count(), by: { region, inferenceRegion }
| sort calls desc`;

export const buildControlPlaneQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter readOnly == false
| sort timestamp desc
| fields timestamp, eventName, identity_name, region, sourceIp
| limit 50`;

export const buildAccountRegionQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(accountId)
| summarize calls = count(), identities = countDistinct(identity_name), by: { accountId, region }
| sort calls desc`;

/**
 * Account facets for the toolbar Account picker (D6) — derived from CloudTrail
 * (not the Bedrock ModelInvocationLog), and deliberately unscoped by the
 * CURRENTLY selected account (reuses `govBase` with `accounts: []`) so
 * selecting one account doesn't prune the others out of the picker's own
 * option list. This is why the picker can offer an account that shows up in
 * CloudTrail before ModelInvocationLog logging is even enabled for it — the
 * exact blind spot the Reconciliation card exists to catch.
 */
export const buildGovFacetsQuery = (timeframe: Timeframe): string =>
  `${govBase({ timeframe, accounts: [], conditions: [] })}
| filter isNotNull(accountId)
| summarize accounts = collectDistinct(accountId)`;

/**
 * Reconciliation: ModelInvocationLog metering count vs CloudTrail invoke-event
 * count. A gap flags a logging blind spot — calls Bedrock accepted that never
 * made it into the metering log. Counts only — deliberately NOT additive with
 * cost. The log leg uses the indexed `dt.da.aws.log_group` prefilter (the
 * app's convention) rather than an unindexed `contains(content…)` alone.
 *
 * Deliberately self-contained (does NOT reuse `govBase`, and does NOT apply
 * the toolbar's generic Filters conditions) — this card exists purely to
 * compare two RAW counts across data sources, so both legs stay a minimal,
 * directly-comparable pipeline. The hook that consumes this forces
 * `samplingRatioOverride: 1` on it (see useGovReconciliation) so the
 * comparison is always exact, independent of the toolbar's Sampling setting.
 */
export const buildReconciliationQuery = (s: GovScope): string => {
  const acct = s.accounts.length
    ? `\n| filter in(b[accountId], array(${dqlIdArray(s.accounts)}))`
    : "";
  const acctCt = s.accounts.length
    ? `\n    | filter in(accountId, array(${dqlIdArray(s.accounts)}))`
    : "";
  return `fetch logs, samplingRatio: 1, ${tf(s)}
| filter contains(dt.da.aws.log_group, "bedrock")
| filter contains(content, "ModelInvocationLog")
| parse content, "JSON:b"${acct}
| summarize invocations = count()
| fieldsAdd source = "ModelInvocationLog (metering)"
| append [
    fetch events, samplingRatio: 1, ${tf(s)}
    | filter cloud.provider == "aws"
    | parse data, "JSON:ct"
    | filter ct[eventSource] == "bedrock.amazonaws.com"
    | fieldsAdd eventName = ct[eventName], accountId = ct[recipientAccountId]
    | filter in(eventName, ${INVOKE_EVENTS})${acctCt}
    | summarize invocations = count()
    | fieldsAdd source = "CloudTrail (invoke events)"
  ]
| sort source asc`;
};
