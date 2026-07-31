/**
 * DQL string helpers shared by every Bedrock/Governance/Telemetry query
 * builder and the toolbar's Filters control.
 */

/** Escape a value for safe interpolation inside a DQL double-quoted string. */
export const dqlEscape = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Format a timeframe `from` / `to` value for safe interpolation into a DQL
 * `fetch` statement. Relative expressions (`now()-24h`, `@d`, `-30m`, etc.)
 * pass through unquoted; ISO 8601 timestamps (which the timeframe selector
 * can emit) are wrapped in double quotes.
 */
export const dqlTimeArg = (s: string): string => {
  if (!s) return s;
  if (s.startsWith('"')) return s;
  if (/\d{4}-\d{2}-\d{2}T/.test(s)) return `"${dqlEscape(s)}"`;
  return s;
};

/** Format a list of values as a DQL array literal: `"v1", "v2", ...` */
export const dqlIdArray = (ids: string[]): string =>
  ids.map((id) => `"${dqlEscape(id)}"`).join(", ");

export interface FilterCondition {
  attribute: string;
  /**
   * For the default `"in"` op these are the literal values to match. For
   * `"exists"` the condition is a presence check and `values` just needs to
   * be non-empty (the semantic key itself is a fine placeholder value).
   */
  values: string[];
  op?: "in" | "exists";
}

export interface GlobalFilters {
  conditions: FilterCondition[];
}

/** Only allow well-formed semantic keys to be used as filter conditions. */
const SAFE_ATTR_RE = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * Filter conditions that are well-formed and carry at least one value.
 */
export const validConditions = (f?: GlobalFilters): FilterCondition[] =>
  (f?.conditions ?? []).filter((c) => {
    if (
      !c ||
      !SAFE_ATTR_RE.test(c.attribute) ||
      !Array.isArray(c.values) ||
      c.values.length === 0
    ) {
      return false;
    }
    if (c.op === "exists") {
      return c.values.every(
        (v) => typeof v === "string" && SAFE_ATTR_RE.test(v),
      );
    }
    return true;
  });

/** True when the global filter has at least one valid condition. */
export const hasActiveFilter = (f?: GlobalFilters): boolean =>
  validConditions(f).length > 0;

/**
 * Emit the filter pipe(s) for every active condition whose semantic key has a
 * mapping in `fieldsByKey` for THIS query's data source. Conditions for
 * dimensions that don't exist on this data source (e.g. a "region" filter on
 * a Runtime logs query — CloudTrail-only) are silently skipped.
 *
 * MUST be interpolated AFTER the query's `parse` + `fieldsAdd` aliasing step —
 * Bedrock ModelInvocationLog / CloudTrail fields don't exist as queryable
 * columns until the JSON payload has been parsed, so (unlike the flat OTel
 * span attributes this pattern was originally designed for) these conditions
 * cannot be injected immediately after `fetch`.
 */
export const applyFilterConditions = (
  conditions: FilterCondition[] | undefined,
  fieldsByKey: Record<string, string>,
): string =>
  validConditions({ conditions: conditions ?? [] })
    .map((c) => {
      const field = fieldsByKey[c.attribute];
      if (!field) return null;
      return c.op === "exists"
        ? `| filter isNotNull(${field})`
        : `| filter in(toString(${field}), array(${dqlIdArray(c.values)}))`;
    })
    .filter((p): p is string => p != null)
    .join("\n");
