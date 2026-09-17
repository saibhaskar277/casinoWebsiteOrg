/**
 * @typedef {object} SiteNavigator
 * @property {(sectionId: number|string) => { ok: boolean, error?: string, sectionId?: number }} open
 * @property {() => { ok: boolean, error?: string }} close
 * @property {() => number|string|null} getCurrentSectionId
 */

/** Marker module — implement SiteNavigator for your host site. */
export const SiteNavigatorPort = "SiteNavigator";
