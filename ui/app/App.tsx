import { Page } from "@dynatrace/strato-components-preview/layouts";
import { SegmentsProvider } from "@dynatrace/strato-components/filters";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { AppFooter } from "./components/AppFooter";
import { Header } from "./components/Header";
import { RedirectKeepingSearch } from "./lib/nav";
import { RuntimePage } from "./pages/Runtime/RuntimePage";
import { GovernancePage } from "./pages/Governance/GovernancePage";
import { TelemetryPage } from "./pages/Telemetry/TelemetryPage";
import { About } from "./pages/About/About";
import { FieldNotesPage } from "./pages/FieldNotes/FieldNotesPage";
import { GlobalFilterStrip } from "./layout/GlobalFilterStrip";
import { SamplingProvider } from "./scope/SamplingContext";
import { ScanLimitProvider } from "./scope/ScanLimitContext";
import { ScopeProvider } from "./scope/ScopeContext";
import { GlobalFilterProvider } from "./scope/GlobalFilterContext";
import { ScanReportProvider } from "./scope/ScanReportContext";
import { AccountNamesProvider } from "./scope/AccountNamesContext";
import { ThemeStyles } from "./theme/ThemeStyles";
import { TweaksProvider } from "./tweaks/TweaksContext";
import { TweaksPanel } from "./tweaks/TweaksPanel";
import { DemoModeBanner } from "./tweaks/DemoModeBanner";
import { ColorBlindFilters } from "./tweaks/ColorBlindFilters";
import { ModelPricingProvider } from "./pricing/ModelPricingContext";
import { ModelPricingPanel } from "./pricing/ModelPricingPanel";

export const App = () => {
  return (
    <TweaksProvider>
    <ModelPricingProvider>
    <AccountNamesProvider>
    <SegmentsProvider>
    <SamplingProvider>
    <ScanLimitProvider>
    <ScopeProvider>
    <GlobalFilterProvider>
    <ScanReportProvider>
      <ThemeStyles />
      <Page>
        <Page.Header>
          <DemoModeBanner />
          <Header />
          <GlobalFilterStrip />
        </Page.Header>
        <Page.Main>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
            }}
          >
            <div style={{ flex: 1 }}>
              <Routes>
                <Route path="/" element={<RedirectKeepingSearch to="/runtime" />} />
                <Route path="/runtime" element={<RuntimePage />} />
                <Route path="/governance" element={<GovernancePage />} />
                <Route path="/telemetry" element={<TelemetryPage />} />
                <Route path="/about" element={<About />} />
                <Route path="/field-notes" element={<FieldNotesPage />} />
              </Routes>
            </div>
            <AppFooter />
          </div>
        </Page.Main>
      </Page>
      <TweaksPanel />
      <ModelPricingPanel />
      <ColorBlindFilters />
    </ScanReportProvider>
    </GlobalFilterProvider>
    </ScopeProvider>
    </ScanLimitProvider>
    </SamplingProvider>
    </SegmentsProvider>
    </AccountNamesProvider>
    </ModelPricingProvider>
    </TweaksProvider>
  );
};
