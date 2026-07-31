import React from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * <Navigate> that keeps the current query string (timeframe ?from/?to, etc.)
 * — used for the "/" → default-tab redirect so a deep-link with scope intact
 * lands on the right tab.
 */
export const RedirectKeepingSearch = ({ to }: { to: string }): React.ReactElement => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
};
