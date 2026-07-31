// Standard About / attribution page for the AWS Bedrock Observability App.
//
// Build metadata (version / commit hash / commit date) comes from the generated
// module written by scripts/build-info.mjs (regenerated on every build via the
// npm prebuild/predeploy/prestart hooks). Scopes mirror app.config.json exactly.

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import { APP_VERSION, COMMIT_HASH, COMMIT_DATE } from "../../generated/build-info";

// ─── CONFIG ─────────────────────────────────────────────────────────
const CONFIG = {
  appName: "AWS Bedrock Observability App",
  author: "David Beran",
  maintainers: "David Beran",
  email: "dberanjr@gmail.com",
  // eslint-disable-next-line noSecrets/no-secrets -- repo path, not a secret
  repoLabel: "github.com/dberanjr/AWSBedrockApp",
  repoUrl: "https://github.com/dberanjr/AWSBedrockApp",
  license: "MIT",
  environment: "Registered on your current Dynatrace tenant",
  description: "Runtime observability, cost & usage, and access governance for AWS Bedrock.",
  showDisclaimer: true,
};

// Scopes the app requests, mirroring app.config.json. `write` flags the
// scopes that persist the app's own settings/state (never tenant data).
const SCOPES: { name: string; desc: string; write?: boolean }[] = [
  { name: "storage:logs:read", desc: "Read the Bedrock ModelInvocationLog for token, cost, session, and error detail" },
  { name: "storage:metrics:read", desc: "Read CloudWatch metrics for latency, throughput, quota, and guardrails" },
  { name: "storage:events:read", desc: "Read CloudTrail events for access & governance auditing" },
  { name: "storage:buckets:read", desc: "Grail bucket-level access to logs/events/metrics" },
  { name: "storage:filter-segments:read", desc: "Read tenant-defined filter segments to apply as scope filters" },
  { name: "state:user-app-states:read", desc: "Read per-user persisted state (timeframe, sampling, scan limit, tweaks, filters)" },
  { name: "state:user-app-states:write", desc: "Persist per-user state changes", write: true },
  { name: "state:app-states:read", desc: "Read org-wide app state (shared Model Rates overrides)" },
  { name: "state:app-states:write", desc: "Persist org-wide app state (Model Rates edits)", write: true },
];

function formatBuildDate(iso: string): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const date = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
  return `${date} · ${time}`;
}

export const About = () => {
  const buildDate = formatBuildDate(COMMIT_DATE);
  const year = (COMMIT_DATE ? new Date(COMMIT_DATE) : new Date()).getFullYear();

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "App", value: CONFIG.appName },
    { label: "Version", value: <code>v{APP_VERSION}</code> },
    {
      label: "Build",
      value: (
        <span>
          {buildDate} · <code>{COMMIT_HASH}</code>
        </span>
      ),
    },
    { label: "Author", value: CONFIG.author },
    { label: "Maintainers", value: CONFIG.maintainers },
    {
      label: "Email",
      value: <a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a>,
    },
    {
      label: "Repository",
      value: (
        <a href={CONFIG.repoUrl} target="_blank" rel="noopener noreferrer">
          {CONFIG.repoLabel}
        </a>
      ),
    },
    {
      label: "Support",
      value: (
        <span>
          <a href={`${CONFIG.repoUrl}/issues/new`} target="_blank" rel="noopener noreferrer">
            Report an issue
          </a>
          {" · "}
          <a
            href={`${CONFIG.repoUrl}/issues/new?labels=enhancement`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Request a feature
          </a>
        </span>
      ),
    },
    { label: "License", value: CONFIG.license },
    { label: "Environment", value: CONFIG.environment },
    { label: "Description", value: CONFIG.description },
  ];

  const cardStyle: React.CSSProperties = {
    background: Colors.Background.Surface.Default,
    border: `1px solid ${Colors.Border.Neutral.Default}`,
    borderRadius: Borders.Radius.Container.Default,
    padding: "22px 24px",
  };

  return (
    <Flex flexDirection="column" gap={16} padding={24} style={{ maxWidth: 1000 }}>
      <Heading level={1}>About</Heading>

      {/* Attribution card */}
      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", rowGap: 12, columnGap: 16 }}>
          {rows.map((row) => (
            <React.Fragment key={row.label}>
              <Text
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "1.2px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: Colors.Text.Neutral.Subdued,
                }}
              >
                {row.label}
              </Text>
              <Text style={{ color: Colors.Text.Neutral.Default }}>{row.value}</Text>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Permissions card */}
      <div style={cardStyle}>
        <Heading level={2} style={{ marginBottom: 16 }}>
          Grail permissions required
        </Heading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {SCOPES.map((scope) => (
            <div
              key={scope.name}
              style={{
                padding: "14px 16px",
                borderRadius: Borders.Radius.Field.Default,
                background: Colors.Background.Container.Neutral.Default,
                border: `1px solid ${Colors.Border.Neutral.Default}`,
              }}
            >
              <code
                style={{
                  display: "block",
                  color: scope.write ? Colors.Text.Warning.Default : Colors.Text.Success.Default,
                  wordBreak: "break-word",
                }}
              >
                {scope.name}
              </code>
              <Text style={{ display: "block", marginTop: 6, color: Colors.Text.Neutral.Subdued }}>
                {scope.desc}
              </Text>
            </div>
          ))}
        </div>
        <Paragraph style={{ marginTop: 16, color: Colors.Text.Neutral.Subdued }}>
          All scopes are requested at install time via the platform token dialog.
          Every data scope is read-only; the two <code>:write</code> scopes
          persist only this app's own settings and state (timeframe, sampling,
          scan limit, tweaks, Model Rates overrides) — none grant write access
          to your observability data.
        </Paragraph>
      </div>

      {/* Disclaimer */}
      {CONFIG.showDisclaimer ? (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: Borders.Radius.Container.Default,
            color: Colors.Text.Warning.Default,
            background: Colors.Background.Container.Warning.Default,
            border: `1px solid ${Colors.Border.Warning.Default}`,
          }}
        >
          <Text style={{ color: Colors.Text.Warning.Default, fontWeight: 600 }}>
            Field developed, not supported by Dynatrace. Use at your own risk.
          </Text>
        </div>
      ) : null}

      {/* Footer */}
      <div style={cardStyle}>
        <Text style={{ color: Colors.Text.Neutral.Subdued }}>
          {CONFIG.appName}
          <br />
          Copyright {year} {CONFIG.author}. All rights reserved.
        </Text>
        <Paragraph style={{ marginTop: 8, color: Colors.Text.Neutral.Subdued }}>
          This app queries Dynatrace Grail data within your tenant. No data leaves
          Dynatrace.
        </Paragraph>
      </div>
    </Flex>
  );
};
