(function () {
  "use strict";
  const rangeSelector = ":is(.reader-aa-controls, .tools-panel, .workbench-panel, .hand-camera-settings) input[type='range']";
  const scopeSelector = ".reader-aa-controls, .tools-panel, .workbench-panel, .hand-camera-settings";

  function updateRange(input) {
    const min = input.min === "" ? 0 : Number(input.min);
    const max = input.max === "" ? 100 : Number(input.max);
    const value = Number(input.value);
    const fraction = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
    const fill = `${Math.round(fraction * 10000) / 100}%`;
    if (input.style.getPropertyValue("--control-fill") !== fill) input.style.setProperty("--control-fill", fill);
  }
  function updateWithin(element) {
    if (element.matches?.(rangeSelector)) updateRange(element);
    element.querySelectorAll?.(rangeSelector).forEach(updateRange);
  }
  function initialize() {
    updateWithin(document);
    function onInput(event) { if (event.target.matches?.(rangeSelector)) updateRange(event.target); }
    document.addEventListener("input", onInput);
    document.addEventListener("change", onInput);
    // Panels render on demand. Their output text and open/hidden changes also
    // refresh fills after app code assigns .value without dispatching input.
    const observer = new MutationObserver((records) => {
      const scopes = new Set();
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        const scope = target?.closest(scopeSelector);
        if (scope) scopes.add(scope);
        if (record.type === "attributes") updateWithin(target);
        else for (const node of record.addedNodes) if (node instanceof Element) updateWithin(node);
      }
      scopes.forEach(updateWithin);
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "min", "max", "open", "hidden"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
