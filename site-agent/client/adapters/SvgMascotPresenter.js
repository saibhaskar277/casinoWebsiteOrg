export class SvgMascotPresenter {
  constructor(rootNode) {
    this.rootNode = rootNode;
  }

  setState(state) {
    // Query lazily so presenter works even if called before view renders.
    const toggleMascot = this.rootNode?.querySelector?.('[data-role="toggle-mascot"]');
    const headerMascot = this.rootNode?.querySelector?.('[data-role="header-mascot"]');
    const cls = "netty-agent-bob";
    [toggleMascot, headerMascot].forEach((el) => {
      if (!el) return;
      el.classList.remove("idle", "listening", "thinking", "talking");
      // We re-use the same base animation, and tweak duration via classes.
      el.classList.remove("listening", "talking");

      if (state === "listening") el.classList.add("listening");
      else if (state === "talking") el.classList.add("talking");
      else el.classList.add("idle");

      // Ensure base bob animation class exists.
      el.classList.add(cls);
    });
  }
}

