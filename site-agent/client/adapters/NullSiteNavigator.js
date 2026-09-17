/** No-op navigator for sites without panels / SPA routes to open. */
export class NullSiteNavigator {
  open() {
    return { ok: false, error: "navigation not configured" };
  }

  close() {
    return { ok: true };
  }

  getCurrentSectionId() {
    return null;
  }
}
