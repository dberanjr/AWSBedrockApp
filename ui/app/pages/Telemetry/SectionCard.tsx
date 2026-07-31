import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  LogsIcon,
  BarChartIcon,
  LockIcon,
  EventIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@dynatrace/strato-icons";
import { fmtCount } from "../../data/format";
import { ErrorBanner } from "../../components/ErrorState";
import type { SectionIconKey, Tier } from "./catalog";
import type {
  FieldResult,
  MetricFieldResult,
  PopulationFieldResult,
  SectionResult,
  TierStats,
} from "./useTelemetryAudit";
import {
  coverageRampColor,
  VERDICT_COLOR,
  metricVerdictColor,
  type Verdict,
} from "./coverage";

const ICONS: Record<SectionIconKey, typeof LogsIcon> = {
  logs: LogsIcon,
  metrics: BarChartIcon,
  guardrails: LockIcon,
  governance: EventIcon,
};

// ─── Tier chips ─────────────────────────────────────────────────────────────

export const TIER_META: Record<
  Tier,
  { label: string; longLabel: string; color: string; title: string }
> = {
  required: {
    label: "R",
    longLabel: "Required",
    color: "color-mix(in oklab, var(--amber) 85%, var(--red))",
    title: "Required — a core KPI or section breaks or is materially wrong without this",
  },
  optional: {
    label: "O",
    longLabel: "Optional",
    color: "var(--purple)",
    title: "Optional — only a secondary/nice-to-have card depends on this",
  },
};

export const TierBadge = ({
  tier,
  compact,
  decorative,
}: {
  tier: Tier;
  compact?: boolean;
  /** Mark the badge aria-hidden when an adjacent text label already names the
   *  tier, so screen readers don't announce it twice. */
  decorative?: boolean;
}) => {
  const meta = TIER_META[tier];
  const a11yProps = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": `${meta.longLabel} tier` } as const);
  return (
    <span
      {...a11yProps}
      title={meta.title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: compact ? 16 : 18,
        height: compact ? 16 : 18,
        borderRadius: 4,
        fontSize: compact ? 8.5 : 9.5,
        fontWeight: 800,
        letterSpacing: "0.02em",
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${meta.color} 35%, transparent)`,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
};

const TierStatsRow = ({ stats }: { stats: TierStats }) => (
  <Flex alignItems="center" gap={6} style={{ flexWrap: "wrap", marginTop: 4 }}>
    {(["required", "optional"] as const).map((t) => {
      const s = stats[t];
      if (s.total === 0) return null;
      const meta = TIER_META[t];
      return (
        <span
          key={t}
          title={`${meta.longLabel}: ${s.present}/${s.total}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 6px 1px 3px",
            borderRadius: 999,
            border: `1px dashed color-mix(in oklab, ${meta.color} 45%, transparent)`,
            background: "var(--surface-2)",
          }}
        >
          <TierBadge tier={t} compact />
          <Text
            style={{
              fontSize: 10.5,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-3)",
            }}
          >
            {`${s.present}/${s.total}`}
          </Text>
        </span>
      );
    })}
  </Flex>
);

// ─── Verdict pills ──────────────────────────────────────────────────────────

const VERDICT_LABEL: Record<Verdict, string> = {
  present: "PRESENT",
  sparse: "SPARSE",
  missing: "MISSING",
};

export const Pill = ({ color, label, title }: { color: string; label: string; title?: string }) => (
  <span
    title={title}
    style={{
      display: "inline-block",
      padding: "1px 7px",
      borderRadius: 999,
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: "0.04em",
      whiteSpace: "nowrap",
      color,
      background: `color-mix(in oklab, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
    }}
  >
    {label}
  </span>
);

// ─── Field cells ────────────────────────────────────────────────────────────

const CellShell = ({
  color,
  dimmed,
  onClick,
  children,
}: {
  color: string;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="telemetry-field-cell"
    style={{
      appearance: "none",
      font: "inherit",
      textAlign: "left",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: `color-mix(in oklab, ${color} 5%, var(--surface))`,
      borderLeft: `3px solid ${color}`,
      minWidth: 0,
      opacity: dimmed ? 0.75 : 1,
    }}
  >
    {children}
  </button>
);

const FieldName = ({ tier, path }: { tier: Tier; path: string }) => (
  <Flex alignItems="center" gap={6} style={{ minWidth: 0, flex: 1 }}>
    <TierBadge tier={tier} compact />
    <Text
      title={path}
      style={{
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
        minWidth: 0,
      }}
    >
      {path}
    </Text>
  </Flex>
);

const PopulationFieldCell = ({
  f,
  onClick,
}: {
  f: PopulationFieldResult;
  onClick: () => void;
}) => {
  const color = VERDICT_COLOR[f.verdict];
  return (
    <CellShell color={color} onClick={onClick}>
      <Flex alignItems="center" gap={6} justifyContent="space-between" style={{ minWidth: 0 }}>
        <FieldName tier={f.spec.tier} path={f.spec.path} />
        <Pill
          color={color}
          label={VERDICT_LABEL[f.verdict]}
          title={
            f.verdict === "sparse"
              ? "Present, but on under 1% of the section population — likely under-sampled or edge-case"
              : undefined
          }
        />
      </Flex>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.35 }}>
        {f.spec.what}
      </Text>
      <Flex alignItems="center" gap={6} style={{ minWidth: 0 }}>
        <div
          style={{
            flex: 1,
            height: 3,
            borderRadius: 999,
            background: "var(--surface-3)",
            overflow: "hidden",
            minWidth: 24,
          }}
        >
          <div
            style={{
              width: `${Math.max(f.present ? 3 : 0, f.share * 100)}%`,
              height: "100%",
              background: color,
            }}
          />
        </div>
        <Text
          style={{
            fontSize: 10,
            fontVariantNumeric: "tabular-nums",
            color: f.present ? "var(--text-2)" : "var(--text-4)",
            whiteSpace: "nowrap",
          }}
        >
          {f.present ? `${fmtCount(f.rows)} rows` : "0 rows"}
        </Text>
      </Flex>
    </CellShell>
  );
};

const MetricFieldCell = ({
  f,
  onClick,
}: {
  f: MetricFieldResult;
  onClick: () => void;
}) => {
  const color = metricVerdictColor(f.spec.tier, f.verdict);
  const label = f.detected ? "DETECTED" : "NOT DETECTED";
  return (
    <CellShell color={color} onClick={onClick} dimmed={!f.detected && f.spec.tier === "optional"}>
      <Flex alignItems="center" gap={6} justifyContent="space-between" style={{ minWidth: 0 }}>
        <FieldName tier={f.spec.tier} path={f.spec.path} />
        <Pill
          color={color}
          label={label}
          title={
            !f.detected && f.spec.tier === "optional"
              ? "Not detected is expected when this optional feature (e.g. Guardrails) isn't configured — not a gap"
              : undefined
          }
        />
      </Flex>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.35 }}>
        {f.spec.what}
      </Text>
    </CellShell>
  );
};

const SpecLinks = ({ links }: { links: { label: string; url: string }[] }) => (
  <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
    {links.map((l) => (
      <a
        key={l.url}
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10.5,
          color: "var(--blue)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        <ExternalLinkIcon size={11} />
        {l.label}
      </a>
    ))}
  </Flex>
);

export interface SectionCardProps {
  result: SectionResult;
  collapsed: boolean;
  onToggle: () => void;
  onFieldClick: (field: FieldResult) => void;
}

export const SectionCard = ({ result, collapsed, onToggle, onFieldClick }: SectionCardProps) => {
  const { section, fields, presentCount, sparseCount, totalCount, sectionRows, noData, isLoading, error, refetch, tierStats } =
    result;
  const Icon = ICONS[section.iconKey];
  const isMetrics = section.kind === "metrics";
  const hasError = !!error;
  const accent = hasError ? "var(--red)" : coverageRampColor(presentCount, totalCount);
  const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;
  const verb = isMetrics ? "detected" : "present";

  return (
    <Surface elevation="raised" padding={0}>
      <div id={`telemetry-section-${section.id}`} style={{ scrollMarginTop: 16 }} />
      <Flex flexDirection="column">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
          style={{
            padding: "12px 16px",
            borderBottom: collapsed ? "none" : "1px solid var(--border)",
            borderTop: `3px solid ${accent}`,
            borderTopLeftRadius: "var(--radius-card)",
            borderTopRightRadius: "var(--radius-card)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <Flex justifyContent="space-between" alignItems="flex-start" gap={12} style={{ flexWrap: "wrap" }}>
            <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
              <Chevron size={16} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
              <div
                style={{
                  flex: "0 0 auto",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--blue)",
                  background: "color-mix(in oklab, var(--blue) 12%, var(--surface))",
                }}
              >
                <Icon size={18} />
              </div>
              <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--text-4)",
                  }}
                >
                  {`SECTION ${section.number}`}
                </Text>
                <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                  {section.short}
                </Heading>
              </Flex>
            </Flex>

            <Text
              style={{
                flex: 1,
                minWidth: 220,
                fontSize: 11,
                color: "var(--text-3)",
                lineHeight: 1.4,
                alignSelf: "center",
              }}
            >
              {section.blurb}
            </Text>

            <Flex flexDirection="column" alignItems="flex-end" gap={4}>
              <Flex alignItems="center" gap={8}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: accent,
                  }}
                >
                  {hasError ? "—" : `${presentCount}/${totalCount} ${verb}`}
                </Text>
                <span
                  style={{
                    fontSize: 10.5,
                    color: hasError ? "var(--red)" : "var(--text-3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {hasError
                    ? "couldn't evaluate"
                    : isMetrics
                      ? "checked over window"
                      : noData
                        ? "no rows"
                        : `${fmtCount(sectionRows ?? 0)} rows scanned`}
                </span>
              </Flex>
              {!hasError && sparseCount > 0 && (
                <Text
                  style={{
                    fontSize: 10.5,
                    color: "var(--amber)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {`${sparseCount} sparse (<1% of rows)`}
                </Text>
              )}
              <div
                style={{
                  width: 160,
                  maxWidth: "40vw",
                  height: 5,
                  borderRadius: 999,
                  background: "var(--surface-3)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${hasError || totalCount === 0 ? 0 : (presentCount / totalCount) * 100}%`,
                    height: "100%",
                    background: accent,
                  }}
                />
              </div>
              <TierStatsRow stats={tierStats} />
            </Flex>
          </Flex>

          <div
            style={{ marginTop: 8 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <SpecLinks links={section.links} />
          </div>
        </div>

        {!collapsed && (
          <div style={{ padding: 12 }}>
            {isLoading ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 8,
                }}
              >
                {Array.from({ length: Math.min(6, totalCount) }).map((_, i) => (
                  <Skeleton key={i} style={{ height: 58 }} />
                ))}
              </div>
            ) : error ? (
              <ErrorBanner error={error} onRetry={refetch} />
            ) : !isMetrics && noData ? (
              <Text
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  padding: "8px 4px",
                  display: "block",
                }}
              >
                No rows in this section's population for the selected timeframe —
                verdicts cannot be evaluated. Widen the timeframe.
              </Text>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 8,
                }}
              >
                {fields.map((f) =>
                  f.kind === "population" ? (
                    <PopulationFieldCell key={f.spec.path} f={f} onClick={() => onFieldClick(f)} />
                  ) : (
                    <MetricFieldCell key={f.spec.path} f={f} onClick={() => onFieldClick(f)} />
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </Flex>
    </Surface>
  );
};
