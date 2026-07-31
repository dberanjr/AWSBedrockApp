// Field Notes — a concise, Bedrock-specific reference for this app: what it
// is, what AWS telemetry powers it, what every tab/card means, and which
// personas & use cases it serves. Plain React + Strato (no iframe, no custom
// HTML asset) so it stays easy to keep short and in sync with the app itself.

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { SimpleTable } from "@dynatrace/strato-components-preview/tables";
import type { SimpleTableColumnDef } from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";

// ─── Card shell (matches About.tsx conventions) ────────────────────────────
const cardStyle: React.CSSProperties = {
  background: Colors.Background.Surface.Default,
  border: `1px solid ${Colors.Border.Neutral.Default}`,
  borderRadius: Borders.Radius.Container.Default,
  padding: "22px 24px",
};

const tableWrap: React.CSSProperties = {
  marginTop: 12,
};

// ─── Section 2: Telemetry sources ──────────────────────────────────────────
interface TelemetryRow {
  source: string;
  captures: string;
  why: string;
}

const TELEMETRY_ROWS: TelemetryRow[] = [
  {
    source: "Model Invocation Logs (Bedrock ModelInvocationLog, via CloudWatch Logs)",
    captures:
      "Per-invocation detail: input/output/cache-read tokens, latency, time-to-first-token, model, region, account, caller identity, errors",
    why: "The only source with token-level detail — powers cost, performance, and per-agent/session attribution",
  },
  {
    source: "CloudWatch Runtime & Quota Metrics (cloud.aws.bedrock.*)",
    captures: "Invocation counts, latency, tokens-per-minute, throttling, independent of log parsing",
    why: "Confirms quota headroom and cross-checks log-delivery health",
  },
  {
    source: "CloudWatch Guardrails Metrics (cloud.aws.bedrock_guardrails.*)",
    captures: "Guardrail invocation counts and intervention counts",
    why: "Shows guardrail posture — but only meaningful if Guardrails is configured (an opt-in AWS feature)",
  },
  {
    source: "CloudTrail (bedrock.amazonaws.com events)",
    captures: "Every API call: identity, source IP, region, action, and outcome (allowed / denied / throttled)",
    why: "100% coverage of who called what from where, regardless of whether detailed model logging is enabled — the basis for access governance",
  },
];

const TELEMETRY_COLUMNS: SimpleTableColumnDef<TelemetryRow>[] = [
  { id: "source", header: "Source", accessor: "source", width: 260 },
  { id: "captures", header: "What it captures", accessor: "captures", width: 340 },
  { id: "why", header: "Why it matters", accessor: "why" },
];

// ─── Section 3: What each tab shows ────────────────────────────────────────
interface TabRow {
  section: string;
  shows: string;
  why: string;
}

const RUNTIME_ROWS: TabRow[] = [
  {
    section: "Hero",
    shows: "Total estimated spend, 30-day run-rate projection, spend sparkline, up to 3 computed insights",
    why: "One-glance answer to \"what am I spending and where is it headed\"",
  },
  {
    section: "KPI row",
    shows: "Invocations, tokens, estimated cost, latency, TTFT, error rate, peak TPM, sessions",
    why: "Fleet-wide health snapshot for the selected timeframe",
  },
  {
    section: "Cost zone",
    shows: "Cost-by-model-over-time (with prompt-cache savings overlay), cost-share donut, cost-by-account",
    why: "Shows where spend concentrates and how much prompt caching is actually saving",
  },
  {
    section: "Agent / session table",
    shows: "Up to 200 identities with invocations, tokens, cache-hit %, cost, P95 latency, error rate",
    why: "Attributes cost and performance to the caller (IAM/role), not just the fleet average",
  },
  {
    section: "Performance zone",
    shows: "Latency and TTFT by model (worst first), peak-TPM headroom, an honest error-rate caveat",
    why: "Pinpoints which model or configuration is slow before users complain",
  },
  {
    section: "Quota & delivery",
    shows: "Peak-TPM-by-model headroom, CloudWatch log-delivery health over time",
    why: "Early warning for throttling risk and telemetry gaps",
  },
  {
    section: "Latency trends",
    shows: "Min/avg/max band charts for invocation latency and TTFT over time",
    why: "Separates one-off spikes from sustained regressions",
  },
  {
    section: "Per-model summary table",
    shows: "Invocations, in/out/cache tokens, cache-hit %, latency, TTFT — one row per model",
    why: "Side-by-side comparison to inform model choice or routing changes",
  },
  {
    section: "Guardrails summary",
    shows: "Fleet-wide guardrail invocation count and intervention rate",
    why: "Guardrails adoption/effectiveness snapshot (only meaningful if Guardrails is configured)",
  },
  {
    section: "Findings",
    shows: "The same computed insights as the Hero, plus a coverage-gap card if model I/O logging isn't enabled",
    why: "Turns raw metrics into prioritized, actionable call-outs",
  },
];

const GOVERNANCE_ROWS: TabRow[] = [
  {
    section: "KPI band",
    shows: "API calls, distinct identities, distinct source IPs, errored/denied calls, non-MFA calls, cross-region calls",
    why: "Fleet-wide access posture in one row",
  },
  {
    section: "Anomalous access",
    shows: "Identities calling from 3+ source IPs; IPs shared by 2+ identities",
    why: "Shadow-AI / credential-abuse heuristic",
  },
  {
    section: "Access denied",
    shows: "Top identities and actions ranked by AccessDenied count",
    why: "Surfaces broken permissions or probing before it escalates",
  },
  {
    section: "Data residency",
    shows: "Cross-region inference routing, with residency exceptions flagged",
    why: "Compliance check — did inference run outside the request's own region",
  },
  {
    section: "Throttling",
    shows: "ThrottlingException / TooManyRequestsException table (green empty state when none)",
    why: "Reliability check that doubles as a quota pressure signal",
  },
  {
    section: "Activity detail",
    shows: "API-action bar list, calls-over-time by action, top identities, top source IPs, identity×MFA table",
    why: "Drill-down for investigating a specific identity, IP, or spike",
  },
  {
    section: "Security detail",
    shows: "Errors/denials over time by error code, plus a control-plane write-event audit table",
    why: "Separates invocation errors from configuration-changing calls",
  },
  {
    section: "Reconciliation",
    shows: "CloudTrail invoke-event count vs. ModelInvocationLog metering count",
    why: "Finds logging blind spots — accounts/regions where CloudTrail sees Bedrock calls but detailed logging isn't enabled",
  },
];

const TAB_COLUMNS: SimpleTableColumnDef<TabRow>[] = [
  { id: "section", header: "Section / card", accessor: "section", width: 200 },
  { id: "shows", header: "What it shows", accessor: "shows", width: 360 },
  { id: "why", header: "Why it matters", accessor: "why" },
];

// ─── Section 4: Personas & use cases ───────────────────────────────────────
interface Persona {
  name: string;
  cares: string;
}

const PERSONAS: Persona[] = [
  { name: "AI/ML Engineer building on Bedrock", cares: "Model choice, latency/TTFT, cache-hit rate, per-model performance" },
  { name: "FinOps / Platform Lead", cares: "Total spend, cost attribution by model/account/agent, forecasting, rate accuracy" },
  { name: "Security / Compliance", cares: "Access governance, shadow-AI detection, data residency, MFA posture" },
  { name: "SRE / Reliability", cares: "Throttling, error rates, quota headroom, log-delivery health" },
  { name: "Engineering Leadership", cares: "Spend trend, adoption, guardrails posture, high-level KPIs" },
  {
    name: "Platform/Observability Engineer",
    cares: "Owns the AWS↔Dynatrace integration — whether required telemetry is actually detected",
  },
];

interface UseCaseRow {
  question: string;
  tab: string;
  personas: string;
}

const USE_CASE_ROWS: UseCaseRow[] = [
  {
    question: "What are we spending on Bedrock, and where is it headed?",
    tab: "Runtime — Hero, Cost zone",
    personas: "FinOps/Platform Lead, Engineering Leadership",
  },
  {
    question: "Which model or session is slow, and why?",
    tab: "Runtime — Performance zone, Latency trends",
    personas: "AI/ML Engineer, SRE/Reliability",
  },
  {
    question: "Which agent or session is driving cost?",
    tab: "Runtime — Agent/session table",
    personas: "FinOps/Platform Lead, AI/ML Engineer",
  },
  {
    question: "Are our guardrails actually catching anything?",
    tab: "Runtime — Guardrails summary",
    personas: "Security/Compliance, Engineering Leadership",
  },
  {
    question: "Who's calling Bedrock, from where, and is any of it shadow AI?",
    tab: "Governance — Anomalous access, Activity detail",
    personas: "Security/Compliance",
  },
  {
    question: "Did inference run outside its approved region?",
    tab: "Governance — Data residency",
    personas: "Security/Compliance",
  },
  {
    question: "Are we getting throttled, and are calls failing?",
    tab: "Governance — Throttling; Runtime — KPI row",
    personas: "SRE/Reliability",
  },
  {
    question: "Is our AWS→Dynatrace telemetry actually flowing?",
    tab: "Telemetry",
    personas: "Platform/Observability Engineer",
  },
];

const USE_CASE_COLUMNS: SimpleTableColumnDef<UseCaseRow>[] = [
  { id: "question", header: "Question it answers", accessor: "question", width: 320 },
  { id: "tab", header: "Tab it lives on", accessor: "tab", width: 260 },
  { id: "personas", header: "Persona(s) it informs", accessor: "personas" },
];

// ─── Page ───────────────────────────────────────────────────────────────
export const FieldNotesPage = () => {
  return (
    <Flex flexDirection="column" gap={16} padding={24} style={{ maxWidth: 1100 }}>
      <Heading level={1}>Field Notes</Heading>
      <Text style={{ color: Colors.Text.Neutral.Subdued }}>
        A concise reference for what this app measures, why it matters, and who it's built for.
      </Text>

      {/* 1. What this app is */}
      <div style={cardStyle}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          What this app is
        </Heading>
        <Paragraph>
          The AWS Bedrock Observability App is a single-purpose window into Amazon Bedrock: what it
          costs, how it performs, and who is using it — nothing broader. It has two Analyze tabs,{" "}
          <Text style={{ fontWeight: 600 }}>Runtime Observability &amp; Cost &amp; Usage</Text> and{" "}
          <Text style={{ fontWeight: 600 }}>Access &amp; Governance</Text>, plus a Telemetry tab that
          audits whether the underlying AWS data those tabs depend on is actually arriving. Without it,
          the same questions get answered by hand — pulling ModelInvocationLog entries from CloudWatch
          Logs, cross-checking CloudWatch metrics for throttling, and combing CloudTrail for a specific
          identity or region, separately, per account, every time they come up. This app instead gives
          all three sources one shared timeframe, one filter model, and one editable cost sheet (Model
          Rates), so a cost trend, a latency regression, and an access anomaly can be looked at side by
          side instead of reconstructed from three different tools. It also runs the one cross-check
          native AWS consoles don't: comparing what CloudTrail saw against what the ModelInvocationLog
          actually recorded, to catch accounts or regions where detailed Bedrock logging silently isn't
          enabled.
        </Paragraph>
      </div>

      {/* 2. Telemetry sources */}
      <div style={cardStyle}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Telemetry sources
        </Heading>
        <div style={tableWrap}>
          <SimpleTable data={TELEMETRY_ROWS} columns={TELEMETRY_COLUMNS} />
        </div>
        <Paragraph style={{ marginTop: 12, color: Colors.Text.Neutral.Subdued }}>
          Check the <Text style={{ fontWeight: 600 }}>Telemetry</Text> tab for a live, per-tenant view
          of whether each of these sources is actually flowing right now.
        </Paragraph>
      </div>

      {/* 3. What each tab shows */}
      <div style={cardStyle}>
        <Heading level={2} style={{ marginBottom: 4 }}>
          What each tab shows
        </Heading>
        <Paragraph style={{ color: Colors.Text.Neutral.Subdued, marginBottom: 4 }}>
          Each Analyze tab is a stack of cards. Here's what each one shows and why it's worth a look.
        </Paragraph>

        <Heading level={3} style={{ marginTop: 16, marginBottom: 4 }}>
          Runtime Observability &amp; Cost &amp; Usage
        </Heading>
        <Text style={{ color: Colors.Text.Neutral.Subdued }}>
          Data source: Bedrock ModelInvocationLog (via CloudWatch Logs) plus CloudWatch runtime,
          quota, and guardrails metrics.
        </Text>
        <div style={tableWrap}>
          <SimpleTable data={RUNTIME_ROWS} columns={TAB_COLUMNS} />
        </div>

        <Heading level={3} style={{ marginTop: 24, marginBottom: 4 }}>
          Access &amp; Governance
        </Heading>
        <Text style={{ color: Colors.Text.Neutral.Subdued }}>
          Data source: 100% CloudTrail events for bedrock.amazonaws.com, cross-referenced against the
          ModelInvocationLog only in Reconciliation below.
        </Text>
        <div style={tableWrap}>
          <SimpleTable data={GOVERNANCE_ROWS} columns={TAB_COLUMNS} />
        </div>

        <Heading level={3} style={{ marginTop: 24, marginBottom: 4 }}>
          Telemetry (Audit)
        </Heading>
        <Paragraph>
          Not a dashboard — a pre-flight check. It lists every field this app depends on
          (ModelInvocationLog fields, CloudWatch metrics, CloudTrail fields), tiers each as Required
          or Optional, and reports whether it's been detected in this tenant during the current
          window. If a card elsewhere looks empty or a KPI reads zero, this is where to check whether
          that's a real signal or a missing pipe.
        </Paragraph>
      </div>

      {/* Frame features */}
      <div style={cardStyle}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Also on every tab
        </Heading>
        <Paragraph>
          A Timeframe selector; a Model Rates panel to edit the $/1M-token rates behind every cost
          figure; Segments and Filters scoped to this app's own dimensions (identity, error code,
          region, source IP, and more — not generic span attributes); sampling and scan-limit controls
          under Tweaks; and a status bar showing scan volume and refresh freshness. The Runtime tab
          additionally adds Account and Model dropdowns for narrowing to a single deployment.
        </Paragraph>
      </div>

      {/* 4. Personas & use cases */}
      <div style={cardStyle}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Personas &amp; use cases
        </Heading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {PERSONAS.map((p) => (
            <div
              key={p.name}
              style={{
                padding: "14px 16px",
                borderRadius: Borders.Radius.Field.Default,
                background: Colors.Background.Container.Neutral.Default,
                border: `1px solid ${Colors.Border.Neutral.Default}`,
              }}
            >
              <Text style={{ display: "block", fontWeight: 600, color: Colors.Text.Neutral.Default }}>
                {p.name}
              </Text>
              <Text style={{ display: "block", marginTop: 4, color: Colors.Text.Neutral.Subdued }}>
                {p.cares}
              </Text>
            </div>
          ))}
        </div>

        <Heading level={3} style={{ marginTop: 20, marginBottom: 4 }}>
          Use cases
        </Heading>
        <div style={tableWrap}>
          <SimpleTable data={USE_CASE_ROWS} columns={USE_CASE_COLUMNS} />
        </div>
      </div>
    </Flex>
  );
};
