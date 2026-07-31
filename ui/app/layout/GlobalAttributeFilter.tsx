import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FilterIcon, PlusIcon, XmarkIcon } from "@dynatrace/strato-icons";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useScope } from "../scope/ScopeContext";
import { useScopedDql } from "../scope/useScopedDql";
import { dqlTimeArg, dqlEscape } from "../scope/queries";
import { FILTERABLE_ATTRIBUTES } from "../scope/filterableAttributes";
import type { Timeframe } from "../scope/types";

/**
 * Every filterable dimension is discovered from CloudTrail (governance
 * events) regardless of which data source(s) it applies to — a Bedrock
 * InvokeModel call is itself a CloudTrail event, so identities/error codes
 * observed there are the same ones the Runtime tab's logs carry. This keeps
 * discovery to one query shape instead of unioning two data sources.
 */
const GOV_FIELD_EXPR: Record<string, string> = {
  identity: 'arrayLast(splitString(ct[userIdentity][arn], "/"))',
  errorCode: "ct[errorCode]",
  eventName: "ct[eventName]",
  region: "ct[awsRegion]",
  sourceIp: "ct[sourceIPAddress]",
  mfa: "ct[userIdentity][sessionContext][attributes][mfaAuthenticated]",
  readOnly: "ct[readOnly]",
};

const buildValuesQuery = (
  key: string,
  timeframe: Timeframe,
  search?: string,
): string => {
  const expr = GOV_FIELD_EXPR[key];
  const to = timeframe.to ?? "now()";
  const term = (search ?? "").trim();
  const searchClause = term
    ? `| filter contains(toString(${expr}), "${dqlEscape(term)}")`
    : "";
  return `
fetch events, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to)}
| filter cloud.provider == "aws"
| parse data, "JSON:ct"
| filter ct[eventSource] == "bedrock.amazonaws.com"
| filter isNotNull(${expr})
${searchClause}
| summarize cnt = count(), by: { v = toString(${expr}) }
| sort cnt desc
| limit 200
`.trim();
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--blue-surface, color-mix(in oklab, var(--blue) 12%, transparent))",
  border: "1px solid color-mix(in oklab, var(--blue) 35%, transparent)",
  fontSize: 11.5,
  color: "var(--text)",
  whiteSpace: "nowrap",
  maxWidth: 360,
};

/** Popover body: pick a dimension from the closed list, then its values. */
const AddFilterPopover = ({
  timeframe,
  onClose,
}: {
  timeframe: Timeframe;
  onClose: () => void;
}) => {
  const { filters, setConditionValues } = useGlobalFilters();
  const [attribute, setAttribute] = useState<string | null>(null);
  const [keySearch, setKeySearch] = useState("");
  const [valueSearch, setValueSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!attribute) return;
    const existing = filters.conditions.find((c) => c.attribute === attribute);
    setSelected(existing?.values ?? []);
  }, [attribute, filters.conditions]);

  // Debounce the value search by 1s so typing doesn't fire a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(valueSearch), 1000);
    return () => window.clearTimeout(t);
  }, [valueSearch]);

  const valuesQuery = attribute
    ? buildValuesQuery(attribute, timeframe, debouncedSearch)
    : "";
  const { data, isLoading } = useScopedDql<{ v?: string }>(valuesQuery, {
    enabled: !!valuesQuery,
    staleTime: 60_000,
    // Discovery should show the full value list, unaffected by the active
    // segment — narrowing it there would hide values the user might want to
    // add TO the segment's scope.
    ignoreSegments: true,
  });
  const showLoading = isLoading && !!attribute && debouncedSearch === valueSearch;

  const allValues = useMemo(
    () =>
      (data?.records ?? [])
        .map((r) => r.v)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    [data],
  );

  const typed = valueSearch.trim();
  const extraSelected = selected.filter((v) => !allValues.includes(v));
  const canAddTyped =
    typed.length > 0 && !allValues.includes(typed) && !selected.includes(typed);

  const keyOptions = keySearch
    ? FILTERABLE_ATTRIBUTES.filter((a) =>
        a.label.toLowerCase().includes(keySearch.toLowerCase()),
      )
    : FILTERABLE_ATTRIBUTES;

  const toggleValue = (v: string) =>
    setSelected((cur) =>
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v],
    );

  const apply = () => {
    if (attribute) setConditionValues(attribute, selected);
    onClose();
  };

  const attrLabel = FILTERABLE_ATTRIBUTES.find((a) => a.key === attribute)?.label;

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 6,
        width: 320,
        maxHeight: 420,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {!attribute ? (
        <>
          <input
            autoFocus
            type="text"
            placeholder="Filter on…"
            value={keySearch}
            onChange={(e) => setKeySearch(e.target.value)}
            style={{
              all: "unset",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--text)",
            }}
          />
          <div style={{ overflow: "auto" }}>
            {keyOptions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAttribute(a.key)}
                style={rowBtnStyle}
              >
                {a.label}
              </button>
            ))}
            {keyOptions.length === 0 && (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: 12 }}>
                No matches
              </Text>
            )}
          </div>
        </>
      ) : (
        <>
          <Flex
            alignItems="center"
            gap={6}
            style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}
          >
            <button
              type="button"
              onClick={() => setAttribute(null)}
              style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "var(--blue)" }}
            >
              ‹ back
            </button>
            <Text
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attrLabel}
            </Text>
          </Flex>
          <input
            autoFocus
            type="text"
            placeholder="Filter values…"
            value={valueSearch}
            onChange={(e) => setValueSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAddTyped) {
                toggleValue(typed);
                setValueSearch("");
              }
            }}
            style={{
              all: "unset",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--text)",
            }}
          />
          <div style={{ overflow: "auto", flex: 1 }}>
            {canAddTyped && (
              <button
                type="button"
                onClick={() => {
                  toggleValue(typed);
                  setValueSearch("");
                }}
                style={{ ...rowBtnStyle, color: "var(--blue)", fontWeight: 600 }}
              >
                ＋ Use “{typed}”
              </button>
            )}
            {extraSelected.map((v) => (
              <label key={`sel-${v}`} style={valueRowStyle}>
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggleValue(v)}
                  style={{ cursor: "pointer", width: 14, height: 14 }}
                />
                <span style={valueTextStyle}>{v}</span>
              </label>
            ))}
            {showLoading ? (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: 12 }}>
                Loading values…
              </Text>
            ) : allValues.length === 0 ? (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: 12 }}>
                {valueSearch
                  ? "No matches — use the option above to apply it anyway."
                  : "No values found in this timeframe"}
              </Text>
            ) : (
              allValues.map((v) => (
                <label key={v} style={valueRowStyle}>
                  <input
                    type="checkbox"
                    checked={selected.includes(v)}
                    onChange={() => toggleValue(v)}
                    style={{ cursor: "pointer", width: 14, height: 14 }}
                  />
                  <span style={valueTextStyle}>{v}</span>
                </label>
              ))
            )}
          </div>
          <Flex
            justifyContent="space-between"
            alignItems="center"
            style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}
          >
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              {selected.length} selected
            </Text>
            <button
              type="button"
              onClick={apply}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "5px 14px",
                borderRadius: 6,
                background: "var(--blue)",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Apply
            </button>
          </Flex>
        </>
      )}
    </div>
  );
};

const rowBtnStyle: React.CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  cursor: "pointer",
  padding: "7px 12px",
  fontSize: 12,
  color: "var(--text)",
};

const valueRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  cursor: "pointer",
  borderBottom: "1px solid var(--border-subtle)",
};

const valueTextStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const GlobalAttributeFilter = () => {
  const { scope } = useScope();
  const { filters, removeCondition } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const labelFor = (key: string) =>
    FILTERABLE_ATTRIBUTES.find((a) => a.key === key)?.label ?? key;

  return (
    <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap", minWidth: 0 }}>
      <div ref={rootRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 12,
            color: "var(--text)",
            fontWeight: 500,
          }}
        >
          <FilterIcon size={14} />
          Filter
          <PlusIcon size={12} />
        </button>
        {open && (
          <AddFilterPopover
            timeframe={scope.timeframe}
            onClose={() => setOpen(false)}
          />
        )}
      </div>

      {filters.conditions.map((c) => (
        <span key={c.attribute} style={chipStyle}>
          <span style={{ fontWeight: 600 }}>{labelFor(c.attribute)}</span>
          <span style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.values.length <= 2
              ? c.values.join(", ")
              : `${c.values.slice(0, 2).join(", ")} +${c.values.length - 2}`}
          </span>
          <button
            type="button"
            aria-label={`Remove ${labelFor(c.attribute)} filter`}
            onClick={() => removeCondition(c.attribute)}
            style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: "var(--text-3)" }}
          >
            <XmarkIcon size={12} />
          </button>
        </span>
      ))}
    </Flex>
  );
};
