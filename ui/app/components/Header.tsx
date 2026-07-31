import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { SettingIcon } from "@dynatrace/strato-icons";
import { HeaderTimeframe } from "./HeaderTimeframe";
import { useTweaks } from "../tweaks/TweaksContext";
import { ModelPricingButton } from "../pricing/ModelPricingButton";

/**
 * Primary navigation, grouped into labeled clusters and rendered as a
 * dedicated tab strip beneath the app bar:
 *   ANALYZE — Runtime Observability & Cost & Usage, Access & Governance
 *   AUDIT   — Telemetry (AWS telemetry coverage — what's required vs detected)
 * Field Notes + About are trailing utility items — right-aligned, outside any
 * group label.
 *
 * Every tab is a real <Link>, so routing + keyboard nav are native and the
 * active tab reuses the .aiobs-nav-active pill (accent fill + var(--accent-fg)
 * text). The strip stays visible on every route so every tab is reachable.
 */
type NavItem = { to: string; label: string };
type NavGroup = { id: string; label?: string; utility?: boolean; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "analyze",
    label: "Analyze",
    items: [
      { to: "/runtime", label: "Runtime Observability & Cost & Usage" },
      { to: "/governance", label: "Access & Governance" },
    ],
  },
  {
    id: "audit",
    label: "Audit",
    items: [{ to: "/telemetry", label: "Telemetry" }],
  },
  {
    id: "utility",
    utility: true,
    items: [
      { to: "/field-notes", label: "Field Notes" },
      { to: "/about", label: "About" },
    ],
  },
];

export const Header = () => {
  const { isPanelOpen, togglePanel } = useTweaks();
  // Carry the current query string (timeframe ?from/?to, filters, etc.)
  // across tab navigation so the selected scope doesn't reset when switching
  // pages.
  const { search, pathname } = useLocation();

  const isActive = (to: string): boolean =>
    pathname === to || pathname.startsWith(`${to}/`);

  return (
    <>
      <AppHeader>
        <AppHeader.Navigation>
          <AppHeader.Logo as={Link} to={{ pathname: "/", search }} />
        </AppHeader.Navigation>
        <AppHeader.ActionItems>
          <HeaderTimeframe />
          <ModelPricingButton />
          <AppHeader.ActionButton
            prefixIcon={<SettingIcon />}
            isSelected={isPanelOpen}
            onClick={togglePanel}
            aria-label="Tweaks"
            aria-pressed={isPanelOpen}
            data-aiobs-tweaks-trigger=""
          >
            Tweaks
          </AppHeader.ActionButton>
        </AppHeader.ActionItems>
      </AppHeader>

      <nav className="aiobs-tabnav" aria-label="Primary">
        <div className="aiobs-tabnav-scroll">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div
              key={group.id}
              className={
                "aiobs-tabnav-group" +
                (group.utility ? " aiobs-tabnav-group--utility" : "") +
                (!group.utility && groupIndex > 0 ? " aiobs-tabnav-group--divided" : "")
              }
            >
              {group.label && <span className="aiobs-tabnav-label">{group.label}</span>}
              {group.items.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={{ pathname: item.to, search }}
                    aria-current={active ? "page" : undefined}
                    className={"aiobs-tabnav-pill" + (active ? " aiobs-nav-active" : "")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
};
