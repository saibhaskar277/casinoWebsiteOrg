/**
 * Opens host-site sections via global functions (e.g. window.openPanel).
 * Swap this adapter when the host site uses a different navigation API.
 */
export class DomOpenPanelNavigator {
  /**
   * @param {{
   *   openGlobal?: string,
   *   closeGlobal?: string,
   *   panelElementId?: string,
   *   panelIdDataset?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.openGlobal = options.openGlobal || "openPanel";
    this.closeGlobal = options.closeGlobal || "closePanel";
    this.panelElementId = options.panelElementId || "panel";
    this.panelIdDataset = options.panelIdDataset || "panel";
  }

  open(sectionId) {
    const id = Number(sectionId);
    if (!Number.isFinite(id)) {
      return { ok: false, error: "sectionId must be a number" };
    }
    const fn = typeof window !== "undefined" ? window[this.openGlobal] : null;
    if (typeof fn === "function") {
      fn(id);
      return { ok: true, sectionId: id };
    }
    return { ok: false, error: `${this.openGlobal} is not available on this page` };
  }

  close() {
    const fn = typeof window !== "undefined" ? window[this.closeGlobal] : null;
    if (typeof fn === "function") {
      fn();
      return { ok: true };
    }
    const panel =
      typeof document !== "undefined" ? document.getElementById(this.panelElementId) : null;
    if (panel) {
      panel.classList.remove("open");
      return { ok: true };
    }
    return { ok: false, error: `${this.closeGlobal} is not available` };
  }

  getCurrentSectionId() {
    if (typeof document === "undefined") return null;
    const panel = document.getElementById(this.panelElementId);
    if (!panel || !panel.classList.contains("open")) return null;
    const id = Number(panel.dataset[this.panelIdDataset]);
    return Number.isFinite(id) && id >= 1 ? id : null;
  }
}
