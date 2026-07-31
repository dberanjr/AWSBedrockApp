/**
 * Closed vocabulary of dimensions the toolbar's Filters control can filter
 * on, deliberately NOT free-text (unlike a span-attribute picker, this app's
 * two data sources — the Bedrock ModelInvocationLog and CloudTrail — expose a
 * small, well-known set of fields). Account and Model are intentionally
 * excluded here — they have their own dedicated dropdowns next to Filters.
 *
 * Each query builder maps the subset of these keys that exist on its data
 * source to its own field alias and applies them via `applyFilterConditions`
 * (see `./queries`) — a key with no mapping simply has no effect on that
 * query, e.g. a "region" filter doesn't touch the Runtime tab's logs-only
 * queries.
 */
export interface FilterableAttribute {
  key: string;
  label: string;
  /** Which data source(s) this dimension exists on. */
  appliesTo: Array<"logs" | "events">;
}

export const FILTERABLE_ATTRIBUTES: FilterableAttribute[] = [
  { key: "identity", label: "Identity / session (ARN)", appliesTo: ["logs", "events"] },
  { key: "errorCode", label: "Error code", appliesTo: ["logs", "events"] },
  { key: "eventName", label: "API action (event name)", appliesTo: ["events"] },
  { key: "region", label: "AWS region", appliesTo: ["events"] },
  { key: "sourceIp", label: "Source IP", appliesTo: ["events"] },
  { key: "mfa", label: "MFA authenticated", appliesTo: ["events"] },
  { key: "readOnly", label: "Read-only call", appliesTo: ["events"] },
];
