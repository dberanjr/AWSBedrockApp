import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePersistedState } from "../state/usePersistedState";
import { pickAccentForeground } from "../theme/palette";

export type Theme = "light" | "dark";
export type Accent =
  | "blue"
  | "purple"
  | "cyan"
  | "green"
  | "pink"
  | "amber"
  | "red"
  | "indigo"
  | "lime"
  | "teal"
  | "purpleDeep"
  | "gray25"
  | "gray50"
  | "gray75"
  | "black"
  | "custom";
export type ChartStyle = "line" | "area" | "gradient";
/** Linear (straight segments) or smooth (cubic Bezier) line interpolation. */
export type ChartCurve = "linear" | "smooth";
/** Which data points get an inline value label drawn on the chart. */
export type ChartLabels = "none" | "peak" | "minmax" | "interesting" | "all";
/** Color-blindness simulation. Renders the whole app through an SVG color
 * matrix matching the named deficiency. */
export type ColorBlindFilter =
  | "none"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

/**
 * Per-tab custom configuration. Extensible: add a key here and a control in
 * the Tweaks panel's "Page configuration" section for any future per-tab knob.
 */
export interface PageConfig {
  /**
   * App-wide: show the RAW model string (e.g. us.anthropic.claude-…-v1:0)
   * instead of the normalized label. Off by default (normalized everywhere).
   */
  showRawModels: boolean;
  /**
   * App-wide: how much scan-cost telemetry to surface.
   *   "off"    — nothing.
   *   "totals" — the calm page-wide scanned / budget readout in the footer.
   *   "tiles"  — the totals PLUS per-tile scan pills and the verbose page pill.
   */
  scanStats: ScanStatsMode;
  /**
   * App-wide: show or hide the Sampling / Scan limit dropdowns in the main
   * toolbar. Both keep applying at their last-set value when hidden — this
   * only controls whether they're user-editable from the toolbar.
   */
  showSamplingScanLimit: boolean;
}

/** How much scan-cost telemetry the Tweaks panel surfaces (see PageConfig). */
export type ScanStatsMode = "off" | "totals" | "tiles";

export interface TweaksState {
  theme: Theme;
  accent: Accent;
  /** Hex color stored for the "custom" accent — preserved across toggles. */
  customAccent: string;
  chartStyle: ChartStyle;
  chartCurve: ChartCurve;
  chartLabels: ChartLabels;
  colorBlindFilter: ColorBlindFilter;
  /**
   * App-wide: show canned demo data instead of querying Grail at all, on
   * every tab (except Telemetry, which always audits real telemetry — see
   * TelemetryPage). A persistent banner reminds the user this isn't real
   * data. Distinct from the automatic per-tab "no telemetry detected, showing
   * example data" fallback (see RuntimePage/GovernancePage's `showExample`),
   * which kicks in on its own when a tab's own data genuinely comes back
   * empty — this toggle forces the SAME example data on unconditionally,
   * even when real telemetry exists (for demos/screenshots).
   */
  showDemoData: boolean;
  /** Per-tab custom configuration (see PageConfig). */
  pageConfig: PageConfig;
}

export const DEFAULT_TWEAKS: TweaksState = {
  theme: "light",
  accent: "blue",
  customAccent: "#1C5BE5",
  chartStyle: "area",
  chartCurve: "linear",
  chartLabels: "none",
  colorBlindFilter: "none",
  showDemoData: false,
  pageConfig: {
    showRawModels: false,
    scanStats: "totals",
    showSamplingScanLimit: true,
  },
};

export interface TweaksContextValue extends TweaksState {
  setTheme: (v: Theme) => void;
  setAccent: (v: Accent) => void;
  setCustomAccent: (v: string) => void;
  setChartStyle: (v: ChartStyle) => void;
  setChartCurve: (v: ChartCurve) => void;
  setChartLabels: (v: ChartLabels) => void;
  setColorBlindFilter: (v: ColorBlindFilter) => void;
  setShowDemoData: (v: boolean) => void;
  setShowRawModels: (v: boolean) => void;
  setScanStats: (v: ScanStatsMode) => void;
  setShowSamplingScanLimit: (v: boolean) => void;
  resetTweaks: () => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const TweaksContext = createContext<TweaksContextValue | null>(null);

export const TweaksProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [tweaks, setTweaks] = usePersistedState<TweaksState>(
    "bedrock-obs.tweaks",
    DEFAULT_TWEAKS,
  );
  const [isPanelOpen, setPanelOpen] = useState(false);

  // Mirror every tweak onto the document root as a data-attribute so plain
  // CSS rules can react without React having to touch every component.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-aiobs-theme", tweaks.theme);
    root.setAttribute("data-aiobs-accent", tweaks.accent);
    if (tweaks.accent === "custom") {
      root.style.setProperty("--blue", tweaks.customAccent);
      root.style.setProperty(
        "--accent-fg",
        pickAccentForeground(tweaks.customAccent),
      );
    } else {
      root.style.removeProperty("--blue");
      root.style.removeProperty("--accent-fg");
    }
    document.body.style.filter =
      tweaks.colorBlindFilter === "none"
        ? ""
        : `url(#aiobs-cb-${tweaks.colorBlindFilter})`;
    root.setAttribute("data-theme", tweaks.theme);
  }, [tweaks]);

  const value = useMemo<TweaksContextValue>(() => {
    const merge =
      <K extends keyof TweaksState>(key: K) =>
      (v: TweaksState[K]) =>
        setTweaks({ ...tweaks, [key]: v });
    // Old persisted snapshots predate pageConfig — backfill defaults so the
    // new controls always have a value to read/write.
    const pageConfig: PageConfig = {
      ...DEFAULT_TWEAKS.pageConfig,
      ...tweaks.pageConfig,
    };
    const mergePage =
      <K extends keyof PageConfig>(key: K) =>
      (v: PageConfig[K]) =>
        setTweaks({ ...tweaks, pageConfig: { ...pageConfig, [key]: v } });
    return {
      ...tweaks,
      pageConfig,
      setTheme: merge("theme"),
      setAccent: merge("accent"),
      setCustomAccent: merge("customAccent"),
      setChartStyle: merge("chartStyle"),
      setChartCurve: merge("chartCurve"),
      setChartLabels: merge("chartLabels"),
      setColorBlindFilter: merge("colorBlindFilter"),
      setShowDemoData: merge("showDemoData"),
      setShowRawModels: mergePage("showRawModels"),
      setScanStats: mergePage("scanStats"),
      setShowSamplingScanLimit: mergePage("showSamplingScanLimit"),
      resetTweaks: () => setTweaks(DEFAULT_TWEAKS),
      isPanelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      togglePanel: () => setPanelOpen((p) => !p),
    };
  }, [tweaks, isPanelOpen, setTweaks]);

  return (
    <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>
  );
};

export const useTweaks = (): TweaksContextValue => {
  const ctx = useContext(TweaksContext);
  if (!ctx) throw new Error("useTweaks must be used within a TweaksProvider");
  return ctx;
};
