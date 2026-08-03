import React, { useEffect, useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useAccountNames } from "../../scope/AccountNamesContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { ExampleDataNotice } from "../../components/ExampleDataNotice";
import { ScopeSelectors, type PickerOption } from "../../components/ScopeSelectors";
import { fmtAccount, fmtCount } from "../../data/format";
import type { BedrockScope } from "../../bedrock/types";
import { useBedrockAvailable, useBedrockFacets, useBedrockOverview } from "../../bedrock/useBedrock";
import { BedrockHero } from "./BedrockHero";
import { BedrockKpiRow } from "./BedrockKpiRow";
import { BedrockCostZone } from "./BedrockCostZone";
import { AgentSessionTable } from "./AgentSessionTable";
import { BedrockPerfZone } from "./BedrockPerfZone";
import { BedrockQuotaDelivery } from "./BedrockQuotaDelivery";
import { BedrockLatencyTrends } from "./BedrockLatencyTrends";
import { BedrockPerModelSummary } from "./BedrockPerModelSummary";
import { BedrockGuardrailsSummary } from "./BedrockGuardrailsSummary";
import { BedrockFindings } from "./BedrockFindings";

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/**
 * Runtime Observability & Cost & Usage — the whole tab (banner, scope
 * selectors, and every section) in one page component. This app has no more
 * "Bedrock" tab wrapping two sub-tabs (the source app's BedrockPage /
 * BedrockSubTabs), so this page IS the tab: it owns the Account/Model scope
 * state directly and renders every section inline.
 */
export const RuntimePage = () => {
  const { scope } = useScope();
  const { registerResetHandler } = useGlobalFilters();
  const { showDemoData } = useTweaks();
  // The availability probe always runs for real (unless demo mode is already
  // forced on, in which case its result is irrelevant) — see
  // useBedrockAvailable's own doc comment. Scoped to the SAME timeframe as
  // every other query on this page, so it can't disagree with them.
  const { available, isLoading: availLoading } = useBedrockAvailable(scope.timeframe);
  // Only treat "no telemetry" as true once the probe has actually resolved —
  // otherwise every page would flash example data for a moment on load.
  const showExample = showDemoData || (!availLoading && !available);

  const [accounts, setAccounts] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  // Clear this page's local Account/Model scope when the toolbar's global
  // Reset is invoked — mirrors how other pages in this app register their own
  // reset handler for page-local state the shared toolbar doesn't know about.
  useEffect(() => {
    const unregister = registerResetHandler(() => {
      setAccounts([]);
      setModels([]);
    });
    return unregister;
  }, [registerResetHandler]);

  const bedrockScope: BedrockScope = useMemo(
    () => ({ timeframe: scope.timeframe, accounts, models, showExample }),
    [scope.timeframe, accounts, models, showExample],
  );

  // Facet options for the Account/Model pickers — deliberately unscoped by the
  // CURRENT account/model selection (see useBedrockFacets' doc comment): if it
  // weren't, picking one model would prune every other model out of its own
  // picker's option list. In example mode, returns a canned demo account/model
  // list so the pickers stay populated and usable.
  const { accounts: accountOpts, modelGroups, isLoading: facetsLoading } = useBedrockFacets(
    scope.timeframe,
    showExample,
  );

  const { names: accountNames } = useAccountNames();
  const accountOptions = useMemo<PickerOption[]>(
    () => accountOpts.map((a) => ({ value: a, label: fmtAccount(a, accountNames[a]) || a })),
    [accountOpts, accountNames],
  );

  // Model options are deduped by FRIENDLY label (several raw modelIds — an
  // on-demand inference-profile id plus its account-specific ARN forms — can
  // all render the same shortModelName). Each option is one GROUP; picking it
  // scopes ALL of that group's raw ids. `bedrockScope.models` stays a raw-id
  // list so it round-trips into `bedrockLogBase`'s `b[modelId]` filter
  // unchanged — the grouping/expansion only lives here.
  const modelOptions = useMemo<PickerOption[]>(
    () => modelGroups.map((g) => ({ value: g.label, label: g.label, title: g.ids.join(", ") })),
    [modelGroups],
  );

  // A group reads as "selected" only when ALL of its raw ids are in scope —
  // avoids a false-positive check mark from a partial/stale overlap.
  const selectedModelLabels = useMemo(
    () => modelGroups.filter((g) => g.ids.every((id) => models.includes(id))).map((g) => g.label),
    [modelGroups, models],
  );

  const handleModelChange = (labels: string[]) => {
    const labelSet = new Set(labels);
    setModels(modelGroups.filter((g) => labelSet.has(g.label)).flatMap((g) => g.ids));
  };

  const { totals } = useBedrockOverview(bedrockScope);

  return (
    <Flex flexDirection="column" gap={16} padding={24}>
      {showExample && !showDemoData && <ExampleDataNotice tabLabel="AWS Bedrock" />}
      <Flex justifyContent="space-between" alignItems="flex-start" gap={16} style={{ flexWrap: "wrap" }}>
        <Flex flexDirection="column" gap={4} style={{ minWidth: 0 }}>
          <Heading level={1} style={{ fontSize: 20, fontWeight: 700 }}>
            AWS Bedrock
          </Heading>
          <Text style={{ fontSize: 13, color: "var(--text-3)" }}>
            Model usage, cost, agent sessions, throughput and latency.
          </Text>
        </Flex>
        <ScopeSelectors
          accountOptions={accountOptions}
          accounts={accounts}
          setAccounts={setAccounts}
          isLoadingAccounts={facetsLoading}
          showModel
          modelOptions={modelOptions}
          models={selectedModelLabels}
          setModels={handleModelChange}
          isLoadingModels={facetsLoading}
        />
      </Flex>

      <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
        {fmtCount(totals.invocations)} invocations ·{" "}
        {fmtCount(totals.accounts)} accounts · {fmtCount(totals.models)} models ·{" "}
        {fmtCount(totals.sessions)} sessions · source: Logs + Metrics
      </Text>

      {availLoading && !showDemoData ? (
        <Skeleton style={{ height: 120, borderRadius: 8 }} />
      ) : (
        <BedrockHero scope={bedrockScope} />
      )}
      <BedrockKpiRow scope={bedrockScope} />
      <BedrockCostZone scope={bedrockScope} />
      <AgentSessionTable scope={bedrockScope} />
      <BedrockPerfZone scope={bedrockScope} />

      <Flex flexDirection="column" gap={4} style={{ marginTop: 4 }}>
        <Text style={SECTION_LABEL}>Quota, delivery & latency (Runtime 2.0)</Text>
        <Heading level={2} style={{ fontSize: 15, fontWeight: 600 }}>
          Throughput headroom & response health
        </Heading>
      </Flex>
      <BedrockQuotaDelivery scope={bedrockScope} />
      <BedrockLatencyTrends scope={bedrockScope} />
      <BedrockPerModelSummary scope={bedrockScope} />

      <BedrockGuardrailsSummary showExample={showExample} />
      <BedrockFindings scope={bedrockScope} />
    </Flex>
  );
};
