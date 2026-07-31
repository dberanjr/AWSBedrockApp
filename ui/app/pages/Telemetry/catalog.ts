/**
 * Telemetry audit — coverage catalog.
 *
 * The AWS Bedrock Observability App has no OpenTelemetry spans at all — every
 * KPI on the Runtime Observability & Cost/Usage tab and the Access &
 * Governance tab is derived from one of three raw AWS telemetry sources:
 *   - Bedrock's ModelInvocationLog (a JSON payload shipped as a Dynatrace log)
 *   - CloudWatch metrics under the cloud.aws.bedrock* namespaces
 *   - CloudTrail management events for the bedrock.amazonaws.com service
 *
 * This catalog lists every field/metric those two tabs depend on, whether it
 * is REQUIRED (a core KPI/section breaks or is materially wrong without it)
 * or OPTIONAL (only a secondary/nice-to-have card depends on it), and what it
 * feeds. Live DQL (see queries.ts, one query per section) checks whether the
 * tenant's telemetry actually carries each one, and useTelemetryAudit.ts
 * turns that into a present/sparse/missing (logs & events) or
 * detected/not-detected (metrics) verdict per field.
 *
 * Unlike the source app's 10-section / 4-tier OTel attribute audit, this
 * app's dependency set is small and clear-cut: 4 sections, 2 tiers.
 */

/** Tier classification for a field: does a core KPI break without it, or is
 *  it only feeding a secondary/nice-to-have card? */
export type Tier = "required" | "optional";

export interface SpecLink {
  label: string;
  url: string;
}

/** Which DQL shape a section's detection query uses — drives which query
 *  builder in queries.ts applies and which verdict model (population
 *  present/sparse/missing vs. binary metric detected/not-detected) applies. */
export type SectionKind = "logs" | "metrics" | "events";

/** Icon keys resolved to Strato icons in SectionCard.tsx. */
export type SectionIconKey = "logs" | "metrics" | "guardrails" | "governance";

export interface FieldSpec {
  /**
   * The literal field path or metric key this row checks, shown verbatim in
   * the UI so the audit is self-documenting:
   *   - "logs"/"events" sections: a DQL field-access expression evaluated
   *     with isNotNull(...) after the section's `parse` step, e.g.
   *     "b[accountId]" or "ct[userIdentity][arn]".
   *   - "metrics" sections: a bare CloudWatch metric key (no backticks — the
   *     query builder adds them), e.g. "cloud.aws.bedrock.Invocations.By.ModelId".
   */
  path: string;
  tier: Tier;
  /** One-line summary shown on the field cell. */
  what: string;
  /** A few sentences for the detail modal: what breaks without it, and how
   *  serious that is. */
  detail: string;
}

export interface AuditSection {
  id: string;
  /** 1..4, matching the catalog's "Section N" headers. */
  number: number;
  title: string;
  short: string;
  blurb: string;
  kind: SectionKind;
  iconKey: SectionIconKey;
  /**
   * "logs"/"events" sections only: the DQL boolean filter applied BEFORE the
   * `parse` step (cheap, top-level fields only — filter-early).
   */
  prefilter?: string;
  /** "logs"/"events" sections only: the `parse` command's arguments, e.g.
   *  `content, "JSON:b"`. */
  parse?: string;
  /**
   * "logs"/"events" sections only: an optional second DQL boolean filter
   * applied AFTER `parse`, for predicates that need a parsed field (only the
   * Access & Governance section needs this — eventSource lives inside the
   * parsed CloudTrail payload).
   */
  postfilter?: string;
  links: SpecLink[];
  fields: FieldSpec[];
}

export const SECTIONS: AuditSection[] = [
  // ───────────────────────────────────────────────────────────────────────
  // Section A — Model Invocation Logs
  // ───────────────────────────────────────────────────────────────────────
  {
    id: "logs",
    number: 1,
    title: "Model Invocation Logs",
    short: "Model Invocation Logs",
    blurb:
      "Bedrock's per-invocation JSON log — the raw material for cost, token, error, and identity attribution on the Runtime Observability & Cost/Usage tab. Population: log lines from a Bedrock log group carrying a ModelInvocationLog payload.",
    kind: "logs",
    iconKey: "logs",
    prefilter: `contains(dt.da.aws.log_group, "bedrock") and contains(content, "ModelInvocationLog")`,
    parse: `content, "JSON:b"`,
    links: [
      {
        label: "Bedrock model invocation logging",
        url: "https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html",
      },
    ],
    fields: [
      {
        path: "b[accountId]",
        tier: "required",
        what: "AWS account attribution for every invocation.",
        detail:
          "Feeds per-account cost and usage breakdowns and the account column in the Runtime tab's session/agent attribution table. Without it, spend and usage can't be split out once Bedrock is invoked from more than one AWS account.",
      },
      {
        path: "b[modelId]",
        tier: "required",
        what: "The Bedrock model identifier used for the invocation.",
        detail:
          "Drives every model-level rollup: the cost-per-model math, the model KPI row, and any breakdown by model on the Runtime tab. Missing this field means invocation logs can't be priced or grouped by model at all.",
      },
      {
        path: "b[input][inputTokenCount]",
        tier: "required",
        what: "Input token count for the invocation.",
        detail:
          "The numerator for input-token cost and the input half of the token-throughput KPI. Without it, per-invocation cost can't be computed and token-based KPIs under-report.",
      },
      {
        path: "b[output][outputTokenCount]",
        tier: "required",
        what: "Output token count for the invocation.",
        detail:
          "The numerator for output-token cost (usually priced higher than input tokens) and the output half of the token-throughput KPI. Same blast radius as input token count if it's missing.",
      },
      {
        path: "b[errorCode]",
        tier: "required",
        what: "Provider/service error code for a failed invocation.",
        detail:
          "Backs the error-rate KPI on the Runtime tab. Without it, every invocation looks successful even when Bedrock returned a throttling or validation error — hiding real reliability problems.",
      },
      {
        path: "b[identity][arn]",
        tier: "required",
        what: "IAM principal ARN that made the invocation.",
        detail:
          "Feeds the session/agent attribution table — which role, user, or application is driving usage and cost. Without it, invocation volume can't be attributed back to a caller.",
      },
      {
        path: "b[input][cacheReadInputTokenCount]",
        tier: "optional",
        what: "Tokens served from Bedrock's prompt cache.",
        detail:
          "Powers the cache-hit-rate stat, a nice-to-have efficiency signal. Its absence only means that stat can't be shown — it does not affect cost or the core KPI row, since total cost already reflects whatever Bedrock billed.",
      },
      {
        path: "b[input][cacheWriteInputTokenCount]",
        tier: "optional",
        what: "Tokens written to Bedrock's prompt cache.",
        detail:
          "Pairs with cacheReadInputTokenCount to compute cache economics — write cost versus read savings. Optional: its absence only narrows the cache-hit stat, not the core cost/usage KPIs.",
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  // Section B — Runtime & Quota Metrics
  // ───────────────────────────────────────────────────────────────────────
  {
    id: "runtimeMetrics",
    number: 2,
    title: "Runtime & Quota Metrics",
    short: "Runtime & Quota Metrics",
    blurb:
      "CloudWatch metrics under cloud.aws.bedrock.* — latency, throughput, and quota signals that have no log-based equivalent. Detection is binary per metric (any non-null datapoint in the window, yes/no), not a population share.",
    kind: "metrics",
    iconKey: "metrics",
    links: [
      {
        label: "Bedrock CloudWatch metrics",
        url: "https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-cw.html",
      },
    ],
    fields: [
      {
        path: "cloud.aws.bedrock.Invocations.By.ModelId",
        tier: "required",
        what: "Per-model invocation count from CloudWatch.",
        detail:
          "The CloudWatch-side corroboration of request volume/traffic that the Runtime tab's throughput KPI leans on where available. Without it, throughput can only be derived from log-based counts.",
      },
      {
        path: "cloud.aws.bedrock.InvocationLatency.By.ModelId",
        tier: "required",
        what: "Per-model end-to-end invocation latency.",
        detail:
          "Backs the latency KPI and percentiles on the Runtime tab. Without this metric there is no CloudWatch-native latency signal — the invocation log alone doesn't carry a duration field.",
      },
      {
        path: "cloud.aws.bedrock.TimeToFirstToken.By.ModelId",
        tier: "required",
        what: "Per-model time-to-first-token for streaming invocations.",
        detail:
          "The core streaming-responsiveness KPI — how long a user waits before the first token arrives. This has no log-based equivalent, so its absence is a real, unrecoverable gap in the Runtime tab's latency story.",
      },
      {
        path: "cloud.aws.bedrock.InputTokenCount.By.ModelId",
        tier: "required",
        what: "Per-model input token throughput from CloudWatch.",
        detail:
          "Cross-checks the log-derived input token counts and feeds tokens-per-minute quota analysis. Without it, TPM saturation against Bedrock's quota can't be tracked in near-real-time.",
      },
      {
        path: "cloud.aws.bedrock.OutputTokenCount.By.ModelId",
        tier: "required",
        what: "Per-model output token throughput from CloudWatch.",
        detail:
          "Same role as the input-token metric for the output side — feeds output TPM/quota tracking. Its absence removes the near-real-time output-throughput view.",
      },
      {
        // eslint-disable-next-line noSecrets/no-secrets -- CloudWatch metric key, not a secret
        path: "cloud.aws.bedrock.EstimatedTPMQuotaUsage.By.ModelId",
        tier: "optional",
        what: "Estimated percentage of the account's tokens-per-minute quota consumed.",
        detail:
          "Powers a secondary quota-headroom card that warns before throttling starts. Optional: quota pressure can still be inferred, less precisely, from the token-count metrics above.",
      },
      {
        // eslint-disable-next-line noSecrets/no-secrets -- CloudWatch metric key, not a secret
        path: "cloud.aws.bedrock.ModelInvocationLogsCloudWatchDeliverySuccess",
        tier: "optional",
        what: "Whether Bedrock successfully delivered invocation logs to CloudWatch.",
        detail:
          "A meta-metric: it reports whether the log pipeline feeding Section A is itself healthy. Useful as a nice-to-have pipeline-health card; its absence doesn't affect any KPI directly, it just removes an early warning for log-delivery problems.",
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  // Section C — Guardrails Metrics
  // ───────────────────────────────────────────────────────────────────────
  {
    id: "guardrails",
    number: 3,
    title: "Guardrails Metrics",
    short: "Guardrails Metrics",
    blurb:
      "CloudWatch metrics under cloud.aws.bedrock_guardrails.* — all Optional. Guardrails is an opt-in AWS feature; a tenant that hasn't configured it will show every metric here as not-detected, and that is a normal, healthy state, not a gap.",
    kind: "metrics",
    iconKey: "guardrails",
    links: [
      {
        label: "Amazon Bedrock Guardrails",
        url: "https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html",
      },
    ],
    fields: [
      {
        path: "cloud.aws.bedrock_guardrails.Invocations.By.GuardrailArn.GuardrailVersion",
        tier: "optional",
        what: "Guardrail evaluation count, by guardrail and version.",
        detail:
          "Feeds an optional Guardrails-adoption card. Not-detected simply means Guardrails isn't configured on this tenant — Guardrails is opt-in, so this is expected on many accounts, not a gap.",
      },
      {
        path: "cloud.aws.bedrock_guardrails.InvocationsIntervened.By.GuardrailArn.GuardrailVersion",
        tier: "optional",
        what: "Count of guardrail evaluations that intervened (blocked or modified a response).",
        detail:
          "Backs a guardrail-intervention-rate card for tenants that use Guardrails. Not-detected just means Guardrails isn't in use, or nothing has triggered an intervention yet — never treated as a required-signal outage.",
      },
      {
        // eslint-disable-next-line noSecrets/no-secrets -- CloudWatch metric key, not a secret
        path: "cloud.aws.bedrock_guardrails.InvocationLatency.By.GuardrailArn.GuardrailVersion",
        tier: "optional",
        what: "Latency added by guardrail evaluation.",
        detail:
          "Lets a Guardrails user see the latency overhead their policies add on top of the base invocation latency. Absent on tenants without Guardrails configured, by design.",
      },
      {
        // eslint-disable-next-line noSecrets/no-secrets -- CloudWatch metric key, not a secret
        path: "cloud.aws.bedrock_guardrails.TextUnitCount.By.GuardrailArn.GuardrailVersion",
        tier: "optional",
        what: "Text units processed by Guardrails (its billing/usage unit).",
        detail:
          "Feeds a Guardrails usage card. Like the rest of this section, its absence is expected unless Guardrails is actively configured — it is never a required signal.",
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  // Section D — Access & Governance
  // ───────────────────────────────────────────────────────────────────────
  {
    id: "governance",
    number: 4,
    title: "Access & Governance",
    short: "Access & Governance",
    blurb:
      "CloudTrail management events for the bedrock.amazonaws.com service — the raw material for every table on the Access & Governance tab: who called what, from where, with what outcome. Population: AWS CloudTrail events whose parsed eventSource is bedrock.amazonaws.com.",
    kind: "events",
    iconKey: "governance",
    prefilter: `cloud.provider == "aws"`,
    parse: `data, "JSON:ct"`,
    postfilter: `ct[eventSource] == "bedrock.amazonaws.com"`,
    links: [
      {
        label: "Logging Bedrock API calls with CloudTrail",
        url: "https://docs.aws.amazon.com/bedrock/latest/userguide/logging-using-cloudtrail.html",
      },
    ],
    fields: [
      {
        path: "ct[eventName]",
        tier: "required",
        what: "The CloudTrail API action name (e.g. InvokeModel, CreateGuardrail).",
        detail:
          "The primary key the Governance tab groups every access event by — which API was called. Without it, CloudTrail events can't be classified into any governance view at all.",
      },
      {
        path: "ct[userIdentity][arn]",
        tier: "required",
        what: "IAM principal ARN that made the API call.",
        detail:
          "Feeds who-did-what identity attribution across every Governance tab table. Without it, actions can't be traced back to a role, user, or service.",
      },
      {
        path: "ct[recipientAccountId]",
        tier: "required",
        what: "AWS account the action was recorded against.",
        detail:
          "Backs per-account governance rollups, the same way accountId does for the Runtime & Cost tab. Required whenever more than one AWS account feeds this tenant's Bedrock telemetry.",
      },
      {
        path: "ct[awsRegion]",
        tier: "required",
        what: "AWS region the API call was made in.",
        detail:
          "Powers regional breakdowns and, paired with inferenceRegion below, cross-region residency checks. Without it, a multi-region deployment can't be broken out by region.",
      },
      {
        path: "ct[sourceIPAddress]",
        tier: "required",
        what: "Source IP address of the caller.",
        detail:
          "A core forensic/security field — where a call originated from. Without it, anomalous-access detection (calls from an unexpected network) has no signal to key off.",
      },
      {
        path: "ct[errorCode]",
        tier: "required",
        what: "CloudTrail error code for a failed API call (e.g. AccessDenied).",
        detail:
          "Backs the Governance tab's error/denied-access KPI. Without it, every API call looks successful even when IAM denied it — hiding real access-control problems.",
      },
      {
        path: "ct[userIdentity][sessionContext][attributes][mfaAuthenticated]",
        tier: "required",
        what: "Whether the calling session was MFA-authenticated.",
        detail:
          "The core compliance signal for privileged Bedrock actions (e.g. guardrail or model-access changes) — many governance frameworks require MFA on sensitive calls. Without it, MFA compliance can't be audited at all.",
      },
      {
        path: "ct[readOnly]",
        tier: "required",
        what: "Whether the API call was read-only (Describe/List/Get) vs. mutating.",
        detail:
          "Splits the Governance tab's read vs. write action breakdown — critical for scoping the blast radius of a compromised credential. Without it, every call reads as equally risky.",
      },
      {
        path: "ct[serviceEventDetails][AdditionalEventData][additionalEntries][inferenceRegion]",
        tier: "optional",
        what: "The AWS region that actually served a cross-region inference request.",
        detail:
          "Feeds an optional cross-region residency check — did an inference request execute in a different region than the API call landed in. It's a nested field that stays sparse even on tenants doing cross-region inference (only present on requests that used a cross-region inference profile), so its absence is not unusual.",
      },
    ],
  },
];

export const SECTION_BY_ID: Record<string, AuditSection> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
);

/** Total field count across all sections (denominator for the hero KPI). */
export const TOTAL_FIELDS = SECTIONS.reduce((sum, s) => sum + s.fields.length, 0);
