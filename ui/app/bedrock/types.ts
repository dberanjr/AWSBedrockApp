import type { Timeframe } from "../scope/types";

export interface BedrockScope {
  timeframe: Timeframe;
  /** Selected AWS account ids; empty = all. */
  accounts: string[];
  /** Selected raw Bedrock modelIds (as logged, NOT normalizeBedrockModelId-
   *  collapsed); empty = all. `ScopeSelectors` sources these from
   *  `useBedrockFacets`, and `bedrockLogBase` filters `b[modelId]` against
   *  them directly, so they must round-trip as the raw log field values. */
  models: string[];
  /**
   * True when this tab should show canned example data instead of running
   * (or trusting the result of) its real Grail queries — either the global
   * "Show Demo Data" Tweak is on, or this tab's own telemetry-availability
   * probe found nothing for the active timeframe. Every hook in
   * `ui/app/bedrock/*` reads this directly off the scope object and returns
   * its matching demo constant when true.
   */
  showExample: boolean;
}
