/**
 * @typedef {object} KnowledgeProvider
 * @property {(viewContext?: object|null) => object|string} getFacts
 */

/** Static JSON knowledge — swap for a RagKnowledgeProvider later. */
class StaticKnowledgeProvider {
  constructor(knowledge) {
    this.knowledge = knowledge && typeof knowledge === "object" ? knowledge : {};
  }

  getFacts(viewContext) {
    const k = this.knowledge;
    const key = String(viewContext?.panelKey || "home");
    const base = { co: k.co };
    if (key === "casino" || key === "portfolio") {
      return { ...base, svc: k.svc, math: k.math, titles: { casino: k.titles?.casino } };
    }
    if (key === "casual") {
      return {
        ...base,
        svc: k.svc,
        titles: { casual: k.titles?.casual, eInstant: k.titles?.eInstant }
      };
    }
    if (key === "team") return { ...base, team: k.team };
    if (key === "tech") return { ...base, stack: k.stack, svc: k.svc };
    return {
      co: k.co,
      svc: k.svc,
      math: k.math,
      stack: k.stack,
      team: k.team,
      titles: k.titles
    };
  }
}

/**
 * Hook point for RAG: implement getFacts(viewContext) that retrieves chunks
 * and returns a compact object/string for the system prompt.
 */
class PassthroughKnowledgeProvider {
  constructor(getFactsFn) {
    this._getFacts = getFactsFn;
  }

  getFacts(viewContext) {
    return this._getFacts(viewContext);
  }
}

module.exports = {
  StaticKnowledgeProvider,
  PassthroughKnowledgeProvider
};
