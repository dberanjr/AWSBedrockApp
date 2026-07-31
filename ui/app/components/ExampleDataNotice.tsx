import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Link } from "react-router-dom";

/**
 * Shown at the top of a tab's body when that tab's own telemetry-availability
 * probe found nothing for the active timeframe/scope — the tab still renders
 * every section (populated with the same canned data the "Show Demo Data"
 * Tweak uses), rather than blocking on a full-page empty state, so a first-
 * time viewer can see what the tab looks like once real telemetry is
 * flowing. Deliberately NOT shown when the global "Show Demo Data" Tweak is
 * on — that case already has its own always-on banner (DemoModeBanner) and
 * showing both would be redundant.
 */
export const ExampleDataNotice = ({ tabLabel }: { tabLabel: string }) => (
  <Flex
    alignItems="center"
    gap={8}
    style={{
      padding: "9px 14px",
      borderRadius: 8,
      background: "color-mix(in oklab, var(--amber) 12%, var(--surface))",
      border: "1px solid var(--amber)",
      flexWrap: "wrap",
    }}
  >
    <Text style={{ fontSize: 12, color: "var(--amber-strong, var(--amber))" }}>
      <strong>No {tabLabel} telemetry detected</strong> for the selected timeframe — showing
      example data so you can see what this tab looks like once it's flowing.
    </Text>
    <Link to="/telemetry" style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      Check Telemetry →
    </Link>
  </Flex>
);
