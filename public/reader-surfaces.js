(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderSurfaces = api;
})(globalThis, function () {
  "use strict";
  function dragResult(delta, height) { return delta > Math.min(100, height * 0.22) ? "close" : delta < -35 ? "expand" : "stay"; }
  function create(options) {
    const records = new Map(); let snapshot = null, savedStyle = null, external = false;
    function lock() {
      if (savedStyle) return;
      snapshot = options.capture();
      savedStyle = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow, scrollY: window.scrollY };
      document.body.classList.add("has-reader-surface");
      Object.assign(document.body.style, { position: "fixed", top: `${-window.scrollY}px`, width: "100%", overflow: "hidden" });
    }
    function unlock() {
      if (external || [...records.keys()].some((dialog) => dialog.open) || !savedStyle) return;
      const saved = savedStyle, position = snapshot; savedStyle = null; snapshot = null;
      Object.assign(document.body.style, { position: saved.position, top: saved.top, width: saved.width, overflow: saved.overflow });
      document.body.classList.remove("has-reader-surface");
      window.scrollTo({ top: saved.scrollY, behavior: "instant" }); if (position && !options.restore(position)) window.scrollTo({ top: 0, behavior: "instant" });
    }
    // Navigation can happen in the same click as dismissing a panel. Release
    // the body before it runs, rather than waiting for the async close event.
    function close(dialog) { dialog.close(); unlock(); }
    function attach(dialog, config = {}) {
      if (records.has(dialog)) return;
      records.set(dialog, config); dialog.classList.add("reader-sheet");
      const handle = document.createElement("button"); handle.type = "button"; handle.className = "reader-sheet-handle"; handle.setAttribute("aria-label", "Mở rộng hoặc thu gọn bảng tiện ích"); handle.innerHTML = '<span aria-hidden="true"></span>';
      dialog.prepend(handle); let drag = null, moved = false;
      handle.onclick = () => { if (moved) { moved = false; return; } dialog.classList.toggle("is-sheet-expanded"); };
      handle.onpointerdown = (ev) => {
        if (ev.button !== 0 || !matchMedia("(max-width: 1080px)").matches) return;
        drag = { y: ev.clientY, height: dialog.getBoundingClientRect().height, id: ev.pointerId }; moved = false; handle.setPointerCapture(ev.pointerId);
      };
      handle.onpointermove = (ev) => {
        if (!drag || drag.id !== ev.pointerId) return;
        const delta = ev.clientY - drag.y; if (Math.abs(delta) > 8) moved = true;
        dialog.style.setProperty("--sheet-drag", `${Math.max(0, delta)}px`);
      };
      handle.onpointerup = (ev) => {
        if (!drag || drag.id !== ev.pointerId) return;
        const result = dragResult(ev.clientY - drag.y, drag.height); drag = null; dialog.style.removeProperty("--sheet-drag");
        if (result === "close" && config.canClose?.() !== false) close(dialog);
        if (result === "expand") dialog.classList.add("is-sheet-expanded");
      };
      handle.onpointercancel = () => { drag = null; moved = true; dialog.style.removeProperty("--sheet-drag"); };
      dialog.addEventListener("cancel", (ev) => { if (config.canClose?.() === false) ev.preventDefault(); });
      dialog.addEventListener("close", () => { dialog.classList.remove("is-sheet-expanded"); dialog.style.removeProperty("--sheet-drag"); unlock(); });
      dialog.addEventListener("click", (ev) => { if (ev.target !== dialog || config.canClose?.() === false) return; const rect = dialog.getBoundingClientRect(); if (ev.clientY < rect.top || ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY > rect.bottom) close(dialog); });
    }
    function viewport() {
      const visible = window.visualViewport;
      document.documentElement.style.setProperty("--reader-viewport-height", `${visible?.height || window.innerHeight}px`);
      document.documentElement.style.setProperty("--reader-viewport-inset", `${Math.max(0, window.innerHeight - (visible ? visible.height + visible.offsetTop : window.innerHeight))}px`);
    }
    window.visualViewport?.addEventListener("resize", viewport); window.visualViewport?.addEventListener("scroll", viewport); window.addEventListener("resize", viewport); viewport();
    return { attach, close, open(dialog) { attach(dialog); if (dialog.open) return; lock(); try { dialog.showModal(); } catch (error) { unlock(); throw error; } },
      lockExternal() { external = true; lock(); }, unlockExternal() { external = false; unlock(); },
      isLocked: () => Boolean(savedStyle), snapshot: () => snapshot,
      updateAnchor(value) { if (snapshot && value && value.slug === snapshot.slug && value.volIdx === snapshot.volIdx && value.chapIdx === snapshot.chapIdx) snapshot = { ...snapshot, anchor: value.anchor }; } };
  }
  return { create, dragResult };
});
