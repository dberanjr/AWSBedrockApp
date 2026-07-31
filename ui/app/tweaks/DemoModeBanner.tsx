import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useTweaks } from "./TweaksContext";

/**
 * Persistent, unmissable strip shown at the very top of the app (inside the
 * header, so it never scrolls away) whenever the "Show Demo Data" Tweak is
 * on. Every tab except Telemetry is showing canned example data instead of
 * live Grail queries while this is visible — Telemetry always audits real
 * telemetry regardless of this setting, so it deliberately has no banner.
 */
export const DemoModeBanner = () => {
  const { showDemoData, setShowDemoData } = useTweaks();
  if (!showDemoData) return null;

  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      gap={8}
      style={{
        padding: "6px 16px",
        background: "color-mix(in oklab, var(--purple-2, var(--purple)) 16%, var(--surface))",
        borderBottom: "1px solid var(--purple-2, var(--purple))",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: 600, color: "var(--purple-2, var(--purple))" }}>
        <span aria-hidden>◆</span> You&apos;re viewing demo data, not live telemetry.
      </Text>
      <button
        type="button"
        onClick={() => setShowDemoData(false)}
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--purple-2, var(--purple))",
          textDecoration: "underline",
        }}
      >
        Turn off demo data?
      </button>
    </Flex>
  );
};
