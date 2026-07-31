import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InfoTooltip } from "../../components/InfoTooltip";
import { useGuardrails } from "../../guardrails/useGuardrails";
import { guardrailTone } from "../../guardrails/guardrailsLogic";
import { GUARDRAIL_TONE_COLOR } from "../../guardrails/GuardrailsSummaryCard";
import { fmtCount, fmtCountCompact, fmtPercent } from "../../data/format";

const STAT_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const StatCol = ({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) => (
  <Flex flexDirection="column" gap={2}>
    <Text style={STAT_LABEL}>{label}</Text>
    <Text
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: color ?? "var(--text)",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
      }}
    >
      {value}
    </Text>
    <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
  </Flex>
);

export interface BedrockGuardrailsSummaryProps {
  /** True to show canned example data instead of the real fleet-wide query —
   *  either the global "Show Demo Data" Tweak or the Runtime tab's own
   *  no-telemetry fallback (see BedrockScope.showExample's doc comment).
   *  This panel has no `scope` prop of its own (guardrail metrics are
   *  fleet-wide, not filterable by the page's Account/Model selectors), so
   *  RuntimePage passes this one flag straight through instead. */
  showExample?: boolean;
}

/**
 * Compact AI Guardrails summary for the Runtime tab. Reuses `useGuardrails()`
 * as-is — no new query, no Bedrock-scope wiring: guardrail metrics are
 * fleet-wide (AWS Bedrock Guardrails), not filterable by this page's
 * Account/Model scope selectors, which is why this panel ignores `scope`
 * entirely.
 *
 * Deviation from the source app: this standalone app has no "Summary"/"Pulse"
 * tab to drill into, so the source's "Open Guardrails →" link (which routed
 * there via `useTabNav`) is dropped — the full guardrails detail already
 * lives right here on this same tab.
 */
export const BedrockGuardrailsSummary = ({ showExample = false }: BedrockGuardrailsSummaryProps) => {
  const g = useGuardrails(showExample);
  const tone = guardrailTone(g.fleet.interventionRate, g.fleet.invocations);
  const textUnits = useMemo(() => g.rows.reduce((s, r) => s + r.textUnits, 0), [g.rows]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="center" gap={6}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            AI Guardrails
          </Heading>
          <InfoTooltip
            text="AWS Bedrock Guardrails, from cloud metrics — there are no span attributes for these. Intervention rate = total interventions ÷ total invocations across every guardrail in the window."
            size={12}
          />
        </Flex>

        {g.isLoading && !g.hasData ? (
          <Skeleton style={{ height: 56, borderRadius: 8 }} />
        ) : g.error ? (
          <ErrorState bare error={g.error} />
        ) : !g.hasData ? (
          <EmptyState
            bare
            title="No guardrails configured"
            description="No AWS Bedrock Guardrails reported any activity in this timeframe. Guardrail metrics are sparse — widen the timeframe to see activity."
          />
        ) : (
          <Flex gap={24} style={{ flexWrap: "wrap" }}>
            <StatCol
              label="Invocations"
              value={fmtCount(g.fleet.invocations)}
              sub={`${g.fleet.activeGuardrails}/${g.fleet.guardrails} active`}
            />
            <StatCol
              label="Intervention rate"
              value={fmtPercent(g.fleet.interventionRate)}
              sub={`${fmtCount(g.fleet.intervened)} blocked`}
              color={GUARDRAIL_TONE_COLOR[tone]}
            />
            <StatCol
              label="Text units"
              value={fmtCountCompact(textUnits)}
              sub="evaluated across guardrails"
            />
          </Flex>
        )}
      </Flex>
    </Surface>
  );
};
