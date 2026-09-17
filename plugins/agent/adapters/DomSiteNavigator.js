/**
 * Opens/closes the island site panels via the page’s global openPanel / closePanel.
 */
export class DomSiteNavigator {
  open(panelId) {
    const id = Number(panelId);
    if (!Number.isFinite(id) || id < 1 || id > 5) {
      return { ok: false, error: "panelId must be 1–5" };
    }
    if (typeof window.openPanel === "function") {
      window.openPanel(id);
      return { ok: true, panelId: id };
    }
    return { ok: false, error: "openPanel is not available on this page" };
  }

  close() {
    if (typeof window.closePanel === "function") {
      window.closePanel();
      return { ok: true };
    }
    const panel = document.getElementById("panel");
    if (panel) {
      panel.classList.remove("open");
      return { ok: true };
    }
    return { ok: false, error: "closePanel is not available" };
  }

  getCurrentPanelId() {
    const panel = document.getElementById("panel");
    if (!panel || !panel.classList.contains("open")) return null;
    const id = Number(panel.dataset.panel);
    return Number.isFinite(id) && id >= 1 ? id : null;
  }
}
