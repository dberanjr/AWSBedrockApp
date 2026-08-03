import React, { useRef, useState } from "react";
import { useTweaks } from "../../tweaks/TweaksContext";
import { pickLabelIndices } from "./AreaChart";

export interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  /** When true, fills the area below the line. */
  filled?: boolean;
  /**
   * Optional per-bucket labels (e.g. "14:00", "Jan 2"). If absent the
   * tooltip falls back to "Bucket N / M".
   */
  labels?: string[];
  /** Format the value shown in the hover tooltip. Default = number.toString(). */
  valueFormatter?: (n: number) => string;
  /** "line" (default) for rates/values, "bars" for count-like series. */
  variant?: "line" | "bars";
  /**
   * Optional horizontal reference line (e.g. the series average or an SLO
   * target). Drawn dashed; the y-domain always expands to include it so it
   * never clips off-chart.
   */
  reference?: number;
  /** Short label rendered at the right end of the reference line. */
  referenceLabel?: string;
  /**
   * Accessible name for the sparkline — typically the metric it trends (e.g.
   * "P95 latency"). The component appends a spoken latest/min/max summary so a
   * screen reader gets the values, not an empty aria-hidden graphic (UX report
   * Chart-5).
   */
  ariaLabel?: string;
  /**
   * Render a handful of small x-axis date/time tick labels below the chart
   * (requires `labels`). Off by default — only the Total Spend hero chart
   * opts in today; the compact KPI-tile sparklines stay bare to avoid
   * clutter at that size.
   */
  showAxis?: boolean;
  /**
   * Honor the Tweaks "value labels" setting (`chartLabels`) and draw inline
   * labels on the picked data points, via the same `pickLabelIndices` rule
   * AreaChart uses. Off by default for the same reason as `showAxis`.
   */
  showValueLabels?: boolean;
}

const VIEW_W = 100;

// Cubic Bezier with symmetric tangent control points, smoothing factor 0.2 —
// identical construction to AreaChart's `linePathFromPts` so every chart in
// the app curves the same way when the Tweaks "Smooth" chart curve is on.
const SMOOTHING = 0.2;
const linePathFromPts = (
  pts: Array<{ x: number; y: number }>,
  smooth: boolean,
): string => {
  if (pts.length === 0) return "";
  if (!smooth || pts.length < 3) {
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  }
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] ?? pts[i - 1];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[i + 1] ?? pts[i];
    const cx1 = p1.x + (p2.x - p0.x) * SMOOTHING;
    const cy1 = p1.y + (p2.y - p0.y) * SMOOTHING;
    const cx2 = p2.x - (p3.x - p1.x) * SMOOTHING;
    const cy2 = p2.y - (p3.y - p1.y) * SMOOTHING;
    d += ` C${cx1.toFixed(2)},${cy1.toFixed(2)} ${cx2.toFixed(2)},${cy2.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
};

/** Cap on rendered value-label pills — `pickLabelIndices`'s own "all" cap
 *  (12) is tuned for AreaChart's much wider canvas; a compact sparkline
 *  needs a tighter cap of its own so labels don't overlap into mush. */
const MAX_SPARKLINE_VALUE_LABELS = 6;

/**
 * Responsive single-series sparkline with cursor-tracking hover tooltip.
 * Uses preserveAspectRatio="none" + non-scaling-stroke so it fills any tile
 * width without distorting stroke thickness. The line/area geometry is drawn
 * in an abstract 100-unit-wide viewBox that gets non-uniformly stretched to
 * the real container size — fine for shapes, but text drawn the same way
 * would get squashed/stretched — so the optional axis + value-label text is
 * rendered as plain absolutely-positioned HTML instead of SVG `<text>`,
 * placed via percentage offsets (exact regardless of the real pixel size,
 * since both axes are stretched uniformly to 100%).
 */
export const Sparkline = ({
  values,
  color = "var(--blue)",
  height = 28,
  filled = true,
  labels,
  valueFormatter = (n) => String(Math.round(n)),
  variant = "line",
  reference,
  referenceLabel,
  ariaLabel,
  showAxis = false,
  showValueLabels = false,
}: SparklineProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipX, setTipX] = useState<number>(0);
  const { chartCurve, chartLabels } = useTweaks();
  const smooth = chartCurve === "smooth";

  if (values.length < 2) {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      />
    );
  }

  const refVal =
    typeof reference === "number" && Number.isFinite(reference) ? reference : null;
  const hasRef = refVal !== null;
  // Bars sit on a zero baseline; lines float in their own range. The domain
  // always widens to include the reference line so it can't clip off-chart.
  const domainVals = refVal !== null ? [...values, refVal] : values;
  const max = Math.max(...domainVals, 1);
  const min = variant === "bars" ? 0 : Math.min(...domainVals, 0);
  const range = max - min || 1;
  const yOf = (v: number) => height - ((v - min) / range) * height;
  const step = VIEW_W / (values.length - 1);
  const pts = values.map((v, i) => ({ x: i * step, y: yOf(v) }));
  const linePath = variant === "bars" ? "" : linePathFromPts(pts, smooth);
  const areaPath =
    variant === "bars" || linePath === ""
      ? ""
      : `${linePath} L${pts[pts.length - 1].x.toFixed(2)},${height} L${pts[0].x.toFixed(2)},${height} Z`;
  const refY = refVal !== null ? yOf(refVal) : 0;
  const barSlot = VIEW_W / values.length;
  const barW = Math.max(0.5, barSlot * 0.72);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    const cursorX = e.clientX - rect.left;
    const clamped = Math.max(0, Math.min(rect.width, cursorX));
    const idx = Math.round((clamped / rect.width) * (values.length - 1));
    setHoverIdx(idx);
    setTipX(clamped);
  };
  const handleLeave = () => setHoverIdx(null);

  const cursorFracX = hoverIdx != null ? (hoverIdx * step) / VIEW_W : null;
  const hoverValue = hoverIdx != null ? values[hoverIdx] : null;
  const hoverLabel =
    hoverIdx != null
      ? (labels?.[hoverIdx] ?? `Point ${hoverIdx + 1} / ${values.length}`)
      : null;

  // Accessible name: the metric plus a spoken latest/min/max so the trend's
  // values aren't locked behind the (pointer-only) tooltip. Summarised from the
  // raw series (not the reference-expanded domain).
  const lastVal = values[values.length - 1];
  const loVal = Math.min(...values);
  const hiVal = Math.max(...values);
  const summary = `latest ${valueFormatter(lastVal)}, range ${valueFormatter(
    loVal,
  )} to ${valueFormatter(hiVal)}`;
  const accessibleLabel = ariaLabel ? `${ariaLabel}: ${summary}` : `Trend: ${summary}`;

  const rawValueLabelIndices = showValueLabels ? pickLabelIndices(values, chartLabels) : [];
  const valueLabelIndices =
    rawValueLabelIndices.length > MAX_SPARKLINE_VALUE_LABELS
      ? rawValueLabelIndices.filter(
          (_, i) =>
            i % Math.ceil(rawValueLabelIndices.length / MAX_SPARKLINE_VALUE_LABELS) === 0,
        )
      : rawValueLabelIndices;

  const axisTickIndices = (() => {
    if (!showAxis || !labels || labels.length === 0) return [];
    const count = Math.min(4, labels.length);
    if (count <= 1) return [0];
    return Array.from({ length: count }, (_, k) =>
      Math.round((k / (count - 1)) * (labels.length - 1)),
    );
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div
        ref={wrapRef}
        role="img"
        aria-label={accessibleLabel}
        style={{ position: "relative", width: "100%", flex: "1 1 auto", minHeight: height }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {variant === "bars" ? (
            values.map((v, i) => {
              const y = yOf(v);
              const x = i * barSlot + (barSlot - barW) / 2;
              return (
                <rect
                  key={i}
                  x={x}
                  y={Math.min(y, height - 0.5)}
                  width={barW}
                  height={Math.max(0.5, height - y)}
                  fill={color}
                  opacity={hoverIdx === i ? 1 : 0.8}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })
          ) : (
            <>
              {filled && (
                <path
                  d={areaPath}
                  fill={color}
                  opacity={0.15}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {hasRef && (
            <line
              x1={0}
              x2={VIEW_W}
              y1={refY}
              y2={refY}
              stroke="var(--text-3)"
              strokeWidth={1}
              strokeDasharray="3 2"
              opacity={0.7}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {cursorFracX != null && hoverIdx != null && (
            <>
              <line
                x1={cursorFracX * VIEW_W}
                x2={cursorFracX * VIEW_W}
                y1={0}
                y2={height}
                stroke="var(--text-3)"
                strokeWidth={1}
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorFracX * VIEW_W}
                cy={yOf(values[hoverIdx])}
                r={2.5}
                fill={color}
                stroke="var(--surface)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        {hasRef && referenceLabel && (
          <span
            style={{
              position: "absolute",
              right: 1,
              top: Math.max(0, Math.min(height - 9, refY - 5)),
              fontSize: 8,
              lineHeight: 1,
              color: "var(--text-3)",
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
              background: "var(--surface)",
              padding: "0 1px",
            }}
          >
            {referenceLabel}
          </span>
        )}
        {showValueLabels &&
          valueLabelIndices.map((idx) => {
            const v = values[idx];
            if (v == null) return null;
            const p = pts[idx];
            const xPct = (p.x / VIEW_W) * 100;
            const yPct = (p.y / height) * 100;
            // Prefer the label above the point; flip below when the point
            // sits too close to the top edge for an above-anchored pill.
            const above = yPct > 22;
            return (
              <span
                key={`vl-${idx}`}
                style={{
                  position: "absolute",
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: above
                    ? "translate(-50%, calc(-100% - 4px))"
                    : "translate(-50%, 4px)",
                  fontSize: 8.5,
                  lineHeight: 1,
                  color: "var(--text-2)",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--mono, monospace)",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  padding: "1px 3px",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                {valueFormatter(v)}
              </span>
            );
          })}
        {hoverValue != null && hoverLabel && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              left: tipX,
              bottom: "100%",
              transform: "translate(-50%, -4px)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 6px",
              fontSize: 10.5,
              color: "var(--text)",
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
              zIndex: 2,
            }}
          >
            <span style={{ color: "var(--text-3)" }}>{hoverLabel}</span>
            {" · "}
            <span style={{ fontWeight: 600 }}>{valueFormatter(hoverValue)}</span>
          </div>
        )}
      </div>
      {showAxis && axisTickIndices.length > 0 && (
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            justifyContent: "space-between",
            marginTop: 3,
            padding: "0 1px",
          }}
        >
          {axisTickIndices.map((idx) => (
            <span
              key={`axis-${idx}`}
              style={{
                fontSize: 9,
                color: "var(--text-3)",
                fontFamily: "var(--mono, monospace)",
                whiteSpace: "nowrap",
              }}
            >
              {labels?.[idx]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
