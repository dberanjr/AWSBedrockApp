import React, { useEffect, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { PageScanReadout, PageScanTotal } from "../components/ScanDebug";
import { SamplingBadge } from "../components/SamplingBadge";
import { useScanTotal } from "../scope/ScanReportContext";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../scope/ScanLimitContext";
import { fmtSecs1 } from "../data/format";

// A refresh older than this reads as stale — the status timestamp turns amber
// so cached, aging data doesn't masquerade as fresh.
const STALE_MS = 5 * 60_000;
// A slowest-query time at/above this is called out in amber so a heavy
// refresh is visible rather than silently slow.
const SLOW_QUERY_MS = 5000;

const formatRelative = (ms: number): string => {
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

// Shared amber "partial data" chip styling.
const TRUNC_CHIP_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10.5,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid var(--amber)",
  color: "var(--amber)",
  background: "color-mix(in oklab, var(--amber) 12%, transparent)",
  whiteSpace: "nowrap",
};

/**
 * Thin status strip under the toolbar: scanned-data readout, sampling
 * disclosure, truncation warning, and refresh freshness. Unlike the app this
 * was split from, there is no fleet-wide "N services / N agents / N tools"
 * segment here — this app has no span-based fleet population to count, and
 * each Analyze tab already carries its own scope summary line (invocations /
 * accounts / models, or API calls / identities).
 */
export const ResolutionStatusLine = () => {
  const scan = useScanTotal();
  const { scanLimitGb, setScanLimit } = useScanLimit();
  const scanLimitIdx = SCAN_LIMITS_GB.indexOf(scanLimitGb);
  const nextScanGb =
    scanLimitIdx >= 0 && scanLimitIdx < SCAN_LIMITS_GB.length - 1
      ? SCAN_LIMITS_GB[scanLimitIdx + 1]
      : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const oldestQueryTs = scan?.oldestRefreshedAt ?? null;
  const refreshing = scan == null;
  const refreshAge = oldestQueryTs == null ? null : now - oldestQueryTs;
  const refreshedLabel = refreshing
    ? "refreshing..."
    : formatRelative(refreshAge ?? 0);
  const oldestBreakdown =
    refreshAge == null
      ? ""
      : ` Oldest ${scan?.oldestGroup ? `tile "${scan.oldestGroup}"` : "query"}: ${formatRelative(refreshAge)}.`;
  const stale = !refreshing && refreshAge != null && refreshAge > STALE_MS;
  const slowestMs = scan?.executionMs ?? 0;
  const slow = slowestMs >= SLOW_QUERY_MS;

  return (
    <Flex
      alignItems="center"
      gap={12}
      style={{
        padding: "4px 20px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-2)",
        flexWrap: "wrap",
      }}
    >
      {/* Prominent, always-visible disclosure that the page's numbers are
          extrapolated from a sample (renders nothing when sampling is off). */}
      <SamplingBadge variant="full" />
      <Flex flexGrow={1} />
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Scope further with Segments or Filters in the toolbar above.
      </Text>
      {scan?.limitHit &&
        (nextScanGb != null ? (
          <button
            type="button"
            onClick={() => setScanLimit(nextScanGb)}
            aria-label={`Partial data — a query hit its ${SCAN_LIMIT_LABELS[scanLimitGb]} scan-limit budget. Raise the scan limit to ${SCAN_LIMIT_LABELS[nextScanGb]} to load complete data.`}
            title={`At least one query on this page reached its ${SCAN_LIMIT_LABELS[scanLimitGb]} scan-limit budget, so some results are truncated and may undercount. Click to raise the scan limit to ${SCAN_LIMIT_LABELS[nextScanGb]} (or narrow the timeframe / add a segment).`}
            style={{ all: "unset", ...TRUNC_CHIP_STYLE, cursor: "pointer" }}
          >
            <span aria-hidden>⚠</span> Partial data — scan limit hit
            <span aria-hidden style={{ textDecoration: "underline" }}>
              {" · "}Raise to {SCAN_LIMIT_LABELS[nextScanGb]}
            </span>
          </button>
        ) : (
          <span
            role="status"
            title={`At least one query on this page reached its ${SCAN_LIMIT_LABELS[scanLimitGb]} scan-limit budget (already the maximum), so some results are truncated. Narrow the timeframe or add a segment to see complete data.`}
            style={TRUNC_CHIP_STYLE}
          >
            <span aria-hidden>⚠</span> Partial data — scan limit hit
          </span>
        ))}
      <PageScanReadout />
      <PageScanTotal />
      <Text
        style={{
          fontSize: 11,
          color: stale ? "var(--amber)" : "var(--text-3)",
          fontWeight: stale ? 600 : undefined,
          whiteSpace: "nowrap",
        }}
        title={
          (stale
            ? "This page hasn't refreshed in over 5 minutes — some tiles may be serving cached data. Change the timeframe or narrow scope to refresh."
            : "When the page last refreshed, aged to the oldest tile on the page. The slowest query on this page is shown alongside.") +
          oldestBreakdown
        }
      >
        Last refreshed {refreshedLabel}
        {slowestMs > 0 && (
          <>
            {" · "}
            <span style={{ color: slow ? "var(--amber)" : "inherit" }}>
              slowest query {fmtSecs1(slowestMs)}
            </span>
          </>
        )}
      </Text>
    </Flex>
  );
};
