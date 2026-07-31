import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { ExternalLinkIcon } from "@dynatrace/strato-icons";
import { fmtCount, fmtPercent } from "../../data/format";
import { DetailModalShell, Section } from "../../components/DetailModal";
import type { AuditSection, Tier } from "./catalog";
import type { FieldResult } from "./useTelemetryAudit";
import { VERDICT_COLOR, metricVerdictColor } from "./coverage";
import { Pill, TierBadge, TIER_META } from "./SectionCard";

/**
 * Lighter-weight detail modal for a single field/metric — reuses the shared
 * DetailModalShell/Section scaffold (components/DetailModal.tsx) instead of
 * the source app's bespoke 625-line details.ts essay generator. Copy is a
 * few concise sentences per field (see catalog.ts's `what` / `detail`), not
 * an essay.
 */

export interface FieldDetailModalProps {
  show: boolean;
  onClose: () => void;
  section: AuditSection | null;
  field: FieldResult | null;
}

const TIER_EXPLAIN: Record<Tier, string> = {
  required:
    "A core KPI or section on the Runtime Observability & Cost/Usage or Access & Governance tab breaks, or is materially wrong, without this field.",
  optional:
    "Only a secondary/nice-to-have card depends on this field — its absence doesn't affect a core KPI.",
};

export const FieldDetailModal = ({ show, onClose, section, field }: FieldDetailModalProps) => {
  if (!show || !section || !field) return null;

  const tier = field.spec.tier;
  const tierMeta = TIER_META[tier];
  const isPopulation = field.kind === "population";

  const color = isPopulation
    ? VERDICT_COLOR[field.verdict]
    : metricVerdictColor(tier, field.verdict);

  const statusLabel = isPopulation
    ? ({ present: "PRESENT — emitting", sparse: "SPARSE — rarely emitting", missing: "MISSING — not emitting" } as const)[
        field.verdict
      ]
    : field.detected
      ? "DETECTED — emitting"
      : "NOT DETECTED — no datapoints in window";

  const statusDetail = isPopulation
    ? field.present
      ? `${fmtCount(field.rows)} rows · ${fmtPercent(field.share * 100, 1)} of the ${section.short} population${
          field.verdict === "sparse" ? " — under-sampled, treat with caution" : ""
        }`
      : `Not seen on any ${section.short} row in the selected window.`
    : field.detected
      ? "At least one CloudWatch datapoint landed for this metric in the selected window."
      : tier === "optional"
        ? "No datapoints in the selected window — expected when the underlying feature isn't configured."
        : "No datapoints in the selected window — this metric is not currently emitting.";

  return (
    <DetailModalShell
      title={field.spec.path}
      subtitle={`Section ${section.number} · ${section.short}`}
      monoTitle
      onClose={onClose}
    >
      <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
        {/* Status strip */}
        <Flex flexDirection="column" gap={6}>
          <Flex alignItems="center" gap={12} style={{ flexWrap: "wrap" }}>
            <Pill color={color} label={statusLabel} />
          </Flex>
          <Text style={{ fontSize: 12, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
            {statusDetail}
          </Text>
        </Flex>

        {/* What it is */}
        <Section title="What it is">
          <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
            {field.spec.what}
          </Text>
        </Section>

        {/* Why it matters */}
        <Section title="Why it matters">
          <Text style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
            {field.spec.detail}
          </Text>
        </Section>

        {/* Tier */}
        <Section title="Tier">
          <Flex alignItems="center" gap={8}>
            <TierBadge tier={tier} />
            <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
              <strong>{tierMeta.longLabel}.</strong> {TIER_EXPLAIN[tier]}
            </Text>
          </Flex>
        </Section>

        {/* Learn more */}
        {section.links.length > 0 && (
          <Section title="Learn more">
            <Flex flexDirection="column" gap={6}>
              {section.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: "var(--blue)",
                    textDecoration: "none",
                  }}
                >
                  <ExternalLinkIcon size={13} />
                  {l.label}
                </a>
              ))}
            </Flex>
          </Section>
        )}
      </Flex>
    </DetailModalShell>
  );
};
