import { DomOpenPanelNavigator } from "./DomOpenPanelNavigator.js";
import { NullSiteNavigator } from "./NullSiteNavigator.js";

/**
 * Factory — pick navigator from site.profile.json.
 * Add new types here (e.g. "hashRoute", "spaRouter") without changing AgentApp.
 */
export function createSiteNavigator(siteProfile) {
  const type = siteProfile?.navigator?.type || "null";
  const options = siteProfile?.navigator?.options || {};

  switch (type) {
    case "domOpenPanel":
      return new DomOpenPanelNavigator(options);
    case "null":
    case "none":
    default:
      return new NullSiteNavigator();
  }
}
