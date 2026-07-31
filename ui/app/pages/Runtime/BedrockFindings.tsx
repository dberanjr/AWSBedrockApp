import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { useBedrockCost, useBedrockPerf } from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";
import { computeInsights, buildInsightsInput, type Insight } from "./insights";

export interface BedrockFindingsProps {
  scope: BedrockScope;
}

/**
 * Local, trimmed finding shape + card. The source app's `FindingCard` (and its
 * `Finding`/`FindingSeverity` types) depend on `../data/ai-layer-patterns` (an
 * architecture-layer classifier) and a `PromptsFilter` drill-down type that
 * don't exist in this standalone app — neither is relevant to a Bedrock-only
 * tab, so this is a small local re-implementation that keeps just what this
 * strip actually renders: an icon-free severity dot, category eyebrow, mono
 * entity, severity-colored metric, and a context sentence. No click-through:
 * none of these findings map to an entity-type drill-down the way
 * Explorer/Models findings do in the source app.
 */
type FindingSeverity = "info" | "warning" | "critical";

interface Finding {
  id: string;
  severity: FindingSeverity;
  category: string;
  entity: string;
  metric: string;
  context: string;
}

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  info: "var(--blue)",
  warning: "var(--amber)",
  critical: "var(--red)",
};

const FindingCard = ({ finding }: { finding: Finding }) => (
  <Surface
    elevation="raised"
    padding={12}
    className={finding.severity === "warning" || finding.severity === "critical" ? "aiobs-alert-tile" : undefined}
    style={{ height: "100%", boxSizing: "border-box" }}
  >
    <Flex flexDirection="column" gap={6} style={{ minWidth: 0 }}>
      <Flex alignItems="center" gap={6}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: SEVERITY_COLOR[finding.severity],
            flex: "0 0 auto",
          }}
        />
        <Text
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {finding.category}
        </Text>
      </Flex>

      <Text
        style={{
          fontFamily: "var(--mono, monospace)",
          fontSize: 12.5,
          color: "var(--text-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {finding.entity}
      </Text>

      <Text
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: SEVERITY_COLOR[finding.severity],
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {finding.metric}
      </Text>

      <Text style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.35 }}>
        {finding.context}
      </Text>
    </Flex>
  </Surface>
);

/** FindingSeverity has no positive tier — a savings win (tone "good") reads
 *  as "info" here, not a "warning"/"critical" problem to fix. */
const TONE_SEVERITY: Record<Insight["tone"], FindingSeverity> = {
  warn: "warning",
  info: "info",
  good: "info",
};

/**
 * Always-present, non-computed finding: an honest statement of what this
 * tenant's Bedrock logs DON'T carry, so the coverage gap reads as a fixed
 * fact rather than something that could silently disappear once traffic
 * picks up (unlike the threshold-guarded insight cards, which come and go).
 */
const COVERAGE_GAP: Finding = {
  id: "bedrock-coverage-gap",
  severity: "info",
  category: "Coverage gap",
  entity: "Model I/O logging",
  metric: "Not enabled",
  context:
    "No prompt/response content or tool/agent topology in these logs — enable Bedrock model input/output data logging (and Bedrock error/throttle metrics) to unlock richer prompt-level and agent-tool views.",
};

/**
 * Findings strip: renders the same `computeInsights` sentences BedrockHero
 * shows inline (cost concentration, latency outlier, cache savings — via the
 * shared `buildInsightsInput` helper, see insights.ts) as finding cards, plus
 * the always-present coverage-gap card.
 */
export const BedrockFindings = ({ scope }: BedrockFindingsProps) => {
  const { daily, summary, isLoading: costLoading } = useBedrockCost(scope);
  const { rows: perfRows, isLoading: perfLoading } = useBedrockPerf(scope);

  const findings = useMemo<Finding[]>(() => {
    const insights = computeInsights(buildInsightsInput({ daily, summary, perfRows }));
    const insightFindings: Finding[] = insights.map((insight) => ({
      id: `bedrock-insight-${insight.category}`,
      severity: TONE_SEVERITY[insight.tone],
      category: insight.category,
      entity: insight.entity,
      metric: insight.metric,
      context: insight.text,
    }));
    return [...insightFindings, COVERAGE_GAP];
  }, [daily, summary, perfRows]);

  // Skeletons only before either source hook's FIRST successful load (not on
  // every scope refetch) — mirrors BedrockHero/BedrockKpiRow's guard. The
  // coverage-gap card doesn't depend on either hook, so it's fine to delay it
  // behind the same loading gate rather than flash it in alone.
  const initialLoading = (costLoading && daily.length === 0) || (perfLoading && perfRows.length === 0);

  if (initialLoading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 120, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(findings.length, 4)}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </div>
  );
};
