import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { StatTile, type StatTileTone } from "../../components/StatTile";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorState";
import { SectionCard, TierBadge } from "./SectionCard";
import { FieldDetailModal } from "./FieldDetailModal";
import { useTelemetryAudit, type FieldResult } from "./useTelemetryAudit";
import type { AuditSection } from "./catalog";

/**
 * Telemetry — the AWS Bedrock Observability App's audit tab (Audit nav
 * group). Reports which raw AWS telemetry (Bedrock ModelInvocationLog
 * fields, CloudWatch metrics, CloudTrail fields) the Runtime Observability &
 * Cost/Usage and Access & Governance tabs depend on, and whether this
 * tenant's telemetry actually carries it: a coverage audit, one DQL query per
 * catalog section, present/sparse/missing (logs & events) or
 * detected/not-detected (metrics) verdicts, mirroring the source app's
 * Attributes audit tab but for AWS telemetry instead of OTel span attributes
 * (this app has no spans).
 *
 * Deliberately tenant-wide: every query below ignores Segments/Filters and
 * there is no Account/Model picker on this page — only the global Timeframe
 * selector applies (see useTelemetryAudit.ts / queries.ts).
 */

const toneForPct = (pct: number): StatTileTone => {
  if (pct >= 80) return "good";
  if (pct >= 40) return "warn";
  return "bad";
};

const SectionAnchor = ({ section }: { section: AuditSection }) => (
  <a
    href={`#telemetry-section-${section.id}`}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11.5,
      color: "var(--text-2)",
      textDecoration: "none",
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      background: "var(--surface-2)",
    }}
  >
    {`${section.number}. ${section.short}`}
  </a>
);

export const TelemetryPage = () => {
  const { sections, overview, isLoading, isEmpty, error } = useTelemetryAudit();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<{ section: AuditSection; field: FieldResult } | null>(null);

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Flex flexDirection="column" gap={20} padding={24} style={{ maxWidth: 1400 }}>
      <Flex flexDirection="column" gap={6}>
        <Heading level={1}>Telemetry</Heading>
        <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5, maxWidth: 900 }}>
          A coverage audit of the raw AWS telemetry this app depends on — Bedrock's
          ModelInvocationLog fields, CloudWatch metrics, and CloudTrail fields — against what the
          Runtime Observability &amp; Cost/Usage and Access &amp; Governance tabs actually require.
          Tenant-wide by design: it always respects the global Timeframe selector, but ignores
          Segments, Filters, Account, and Model.
        </Text>
        <Flex alignItems="center" gap={8} style={{ marginTop: 2, flexWrap: "wrap" }}>
          <Flex alignItems="center" gap={6}>
            <TierBadge tier="required" compact />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Required — a core KPI/section breaks without it
            </Text>
          </Flex>
          <Flex alignItems="center" gap={6}>
            <TierBadge tier="optional" compact />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Optional — only a secondary card depends on it
            </Text>
          </Flex>
        </Flex>
      </Flex>

      {error && <ErrorBanner error={error} />}

      {isEmpty && !error && (
        <EmptyState
          cause="no-activity"
          title="No Bedrock telemetry detected"
          description="None of the Model Invocation Log rows, CloudWatch metrics, or CloudTrail events checked below returned any data for the selected timeframe."
          hint="Widen the timeframe, or confirm the Bedrock log group, CloudWatch metric streams, and CloudTrail delivery are wired up for this tenant."
        />
      )}

      {/* Hero KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <StatTile
          label="Required coverage"
          value={isLoading ? undefined : `${Math.round(overview.requiredCoveragePct)}%`}
          loading={isLoading}
          tone={toneForPct(overview.requiredCoveragePct)}
          cue
          sub={`${overview.requiredPresent}/${overview.requiredTotal} required fields present or detected`}
          info="Percentage of Required fields (across all 4 sections) that are present/detected in this tenant's telemetry for the selected timeframe."
        />
        <StatTile
          label="Fields tracked"
          value={isLoading ? undefined : `${overview.presentTotal}/${overview.total}`}
          loading={isLoading}
          sub="Present or detected across Required + Optional"
        />
        <StatTile
          label="Sections fully covered"
          value={isLoading ? undefined : `${overview.sectionsFullyCovered}/${overview.sectionCount}`}
          loading={isLoading}
          tone={overview.sectionsFullyCovered === overview.sectionCount ? "good" : "neutral"}
          sub="Every field in the section is present or detected"
        />
        <StatTile
          label="Sparse fields"
          value={isLoading ? undefined : String(overview.sparseTotal)}
          loading={isLoading}
          tone={overview.sparseTotal > 0 ? "warn" : "neutral"}
          sub="Present but on <1% of rows (Model Invocation Logs / Access & Governance)"
          info="Applies only to the two log/event-based sections — a field seen on a single row out of millions still counts as 'present' by raw count, so sparse flags that false confidence separately."
        />
      </div>

      {/* Table of contents */}
      <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
        {sections.map((s) => (
          <SectionAnchor key={s.section.id} section={s.section} />
        ))}
      </Flex>

      {/* Sections */}
      <Flex flexDirection="column" gap={12}>
        {sections.map((result) => (
          <SectionCard
            key={result.section.id}
            result={result}
            collapsed={!!collapsed[result.section.id]}
            onToggle={() => toggle(result.section.id)}
            onFieldClick={(field) => setActive({ section: result.section, field })}
          />
        ))}
      </Flex>

      <FieldDetailModal
        show={active != null}
        onClose={() => setActive(null)}
        section={active?.section ?? null}
        field={active?.field ?? null}
      />
    </Flex>
  );
};
