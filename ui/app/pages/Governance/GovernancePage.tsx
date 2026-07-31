import React, { useEffect, useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { ExampleDataNotice } from "../../components/ExampleDataNotice";
import { ScopeSelectors, type PickerOption } from "../../components/ScopeSelectors";
import type { GovScope } from "../../bedrock/governance/types";
import { useGovKpis, useGovernanceAvailable, useGovernanceFacets } from "../../bedrock/governance/useGovernance";
import { fmtCount } from "../../data/format";
import { GovKpiBand } from "./GovKpiBand";
import { GovAccessDeniedCard } from "./GovAccessDeniedCard";
import { GovAnomalousAccessCard } from "./GovAnomalousAccessCard";
import { GovDataResidencyCard } from "./GovDataResidencyCard";
import { GovThrottlingCard } from "./GovThrottlingCard";
import { GovActivityDetail } from "./GovActivityDetail";
import { GovSecurityDetail } from "./GovSecurityDetail";
import { GovReconciliation } from "./GovReconciliation";

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const SectionHeader = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <Flex flexDirection="column" gap={4} style={{ marginTop: 4 }}>
    <Text style={SECTION_LABEL}>{eyebrow}</Text>
    <Heading level={2} style={{ fontSize: 15, fontWeight: 600 }}>
      {title}
    </Heading>
  </Flex>
);

/**
 * Access & Governance — a top-level tab, 100% CloudTrail
 * (`cloud.provider == "aws"` then, after `parse data, "JSON:ct"`,
 * `ct[eventSource] == "bedrock.amazonaws.com"`). No spans anywhere in this
 * tab; the one exception is the Reconciliation card, which cross-checks
 * against the Bedrock ModelInvocationLog (`fetch logs`) count to surface
 * logging blind spots.
 *
 * Gated on its own cheap existence probe (`useGovernanceAvailable`) since this
 * is now a fully independent route rather than a sub-tab sharing the Runtime
 * tab's logs-based gate. Account scope is local to this page (its own
 * CloudTrail-derived facets, deliberately NOT shared with the Runtime tab's
 * ModelInvocationLog-derived account list — see useGovernanceFacets) and is
 * cleared by the toolbar's global Reset via `registerResetHandler`.
 *
 * Reorganised from the source dashboard's tile grid into a problem-solving
 * narrative: headline counters -> purpose-built insight cards (the four
 * themes: security, reliability, residency) -> activity/identity detail ->
 * security-over-time -> a reconciliation bridge that proves the CloudTrail and
 * ModelInvocationLog sources agree.
 */
export const GovernancePage = () => {
  const { scope: appScope } = useScope();
  const { filters, registerResetHandler } = useGlobalFilters();
  const { showDemoData } = useTweaks();
  const [accounts, setAccounts] = useState<string[]>([]);

  useEffect(() => {
    const unregister = registerResetHandler(() => setAccounts([]));
    return unregister;
  }, [registerResetHandler]);

  // The availability probe always runs for real (unless demo mode is already
  // forced on, in which case its result is irrelevant) — see
  // useGovernanceAvailable's own doc comment. Only treat "no telemetry" as
  // true once the probe has actually resolved, so the page doesn't flash
  // example data for a moment on load.
  const { available, isLoading: probing } = useGovernanceAvailable();
  const showExample = showDemoData || (!probing && !available);

  const scope: GovScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts, conditions: filters.conditions, showExample }),
    [appScope.timeframe, accounts, filters.conditions, showExample],
  );

  const { accounts: accountFacets, isLoading: facetsLoading } = useGovernanceFacets(
    appScope.timeframe,
    showExample,
  );
  const accountOptions = useMemo<PickerOption[]>(
    () => accountFacets.map((a) => ({ value: a, label: a })),
    [accountFacets],
  );

  const { kpis } = useGovKpis(scope);

  return (
    <Flex flexDirection="column" gap={16} style={{ padding: "18px 20px 80px" }}>
      {showExample && !showDemoData && <ExampleDataNotice tabLabel="Access & Governance" />}
      <Flex justifyContent="space-between" alignItems="flex-start" gap={16} style={{ flexWrap: "wrap" }}>
        <Flex flexDirection="column" gap={6}>
          <Flex flexDirection="column" gap={2}>
            <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
              Access & Governance
            </Heading>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
              Identity, access, data-residency and audit — from Bedrock CloudTrail events.
            </Text>
          </Flex>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
            {fmtCount(kpis.totalCalls)} API calls · {fmtCount(kpis.distinctIdentities)} identities ·{" "}
            {fmtCount(kpis.distinctSourceIps)} source IPs · {fmtCount(kpis.distinctAccounts)} accounts ·
            source: CloudTrail (bedrock.amazonaws.com)
          </Text>
        </Flex>
        <ScopeSelectors
          accountOptions={accountOptions}
          accounts={accounts}
          setAccounts={setAccounts}
          isLoadingAccounts={facetsLoading}
          showModel={false}
        />
      </Flex>

      <GovKpiBand scope={scope} />

      <SectionHeader eyebrow="Problem patterns" title="Security, quota & residency signals" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "var(--d-gap, 16px)",
        }}
      >
        <GovAnomalousAccessCard scope={scope} />
        <GovAccessDeniedCard scope={scope} />
        <GovDataResidencyCard scope={scope} />
        <GovThrottlingCard scope={scope} />
      </div>

      <SectionHeader eyebrow="Activity & identity" title="Who is calling Bedrock, and how" />
      <GovActivityDetail scope={scope} />

      <SectionHeader eyebrow="Security & compliance" title="Errors, denials & control-plane changes" />
      <GovSecurityDetail scope={scope} />

      <SectionHeader eyebrow="Reconciliation" title="CloudTrail vs metering — logging coverage" />
      <GovReconciliation scope={scope} />
    </Flex>
  );
};
