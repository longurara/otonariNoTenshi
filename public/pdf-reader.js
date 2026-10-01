(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PdfReader = api;
})(globalThis, function () {
  "use strict";
  const MAX_PAGES = 500, MAX_PIXELS = 2200000, MAX_BYTES = 150 * 1024 * 1024;
  const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let runtime = null, mode = "width", handlers = null;
  function pageScale(width, height) {
    if (!(width > 0 && height > 0) || !Number.isFinite(width * height)) throw new Error("Kích thước trang PDF không hợp lệ.");
    return Math.min(2, 1500 / width, Math.sqrt(MAX_PIXELS / (width * height)));
  }
  function pageParagraphs(items) {
    const lines = []; let line = "", previousY = null;
    for (const item of items) {
      if (typeof item.str !== "string") continue;
      const y = item.transform?.[5];
      if (line && Number.isFinite(y) && previousY !== null && Math.abs(y - previousY) > Math.max(3, Number(item.height) * 0.6)) { lines.push(line.trim()); line = ""; }
      const part = item.str.replace(/\s+/g, " ");
      line += (line && part && !line.endsWith(" ") && !part.startsWith(" ") ? " " : "") + part;
      if (Number.isFinite(y)) previousY = y;
      if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ""; previousY = null; }
    }
    if (line.trim()) lines.push(line.trim()); return lines.filter(Boolean);
  }
  async function parse(bytes, report = () => {}) {
    report("Đang mở PDF…");
    runtime ||= import("./vendor/pdfjs/pdf.mjs").catch(() => { runtime = null; throw new Error("Không tải được bộ đọc PDF. Kết nối mạng rồi thử lại hoặc cập nhật trình duyệt."); });
    const pdfjs = await runtime; pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.mjs", document.baseURI).href;
    const base = new URL("vendor/pdfjs/", document.baseURI).href;
    const task = pdfjs.getDocument({ data: bytes, cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, isEvalSupported: false, maxImageSize: 40000000 });
    task.onPassword = () => task.destroy();
    try {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGES) throw new Error(`PDF tối đa ${MAX_PAGES} trang. Hãy chia tệp lớn thành nhiều phần.`);
      const metadata = await pdf.getMetadata().catch(() => null), labels = await pdf.getPageLabels().catch(() => null);
      const chapters = [], assets = []; let size = 0, textless = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        report(`Đang nhập PDF… trang ${i}/${pdf.numPages}`);
        const page = await pdf.getPage(i), original = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: pageScale(original.width, original.height) });
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
        try {
          await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "rgb(255,255,255)" }).promise;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
          if (!blob) throw new Error("Không tạo được ảnh trang PDF.");
          const paragraphs = pageParagraphs((await page.getTextContent()).items);
          size += blob.size + new TextEncoder().encode(paragraphs.join("\n\n")).length;
          if (size > MAX_BYTES) throw new Error("Nội dung PDF sau khi nhập vượt 150 MB. Hãy chia thành nhiều tệp.");
          if (!paragraphs.length) textless++;
          const key = `pdf-page-${i}`; assets.push({ key, blob, w: canvas.width, h: canvas.height });
          chapters.push({ title: `Trang ${i}${labels?.[i - 1] && labels[i - 1] !== String(i) ? ` (${labels[i - 1]})` : ""}`, content: paragraphs.join("\n\n"), paragraphs, words: paragraphs.join(" ").split(/\s+/).filter(Boolean).length, isIllustration: false, images: [{ asset: key, w: canvas.width, h: canvas.height }] });
        } finally { canvas.width = canvas.height = 1; page.cleanup(); }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return { title: typeof metadata?.info?.Title === "string" ? metadata.info.Title.trim().slice(0, 250) : "", author: typeof metadata?.info?.Author === "string" ? metadata.info.Author.slice(0, 150) : "", chapters, assets, coverAsset: assets[0]?.key,
        warnings: `${textless ? `${textless} trang không có văn bản trích xuất; chưa hỗ trợ OCR. ` : ""}Trang gốc được lưu dạng ảnh để đọc offline. Văn bản nhiều cột có thể cần đọc bằng chế độ trang gốc.` };
    } catch (error) {
      if (/password|destroyed/i.test(error.message || "")) throw new Error("PDF có mật khẩu chưa được hỗ trợ. Hãy mở khóa tệp trước khi nhập.");
      if (error.name === "InvalidPDFException") throw new Error("Tệp PDF bị hỏng hoặc không đúng định dạng.");
      throw error;
    } finally { await task.destroy(); }
  }
  function renderChapter(chapter, next, renderText) {
    const paragraphs = chapter.paragraphs || [], image = chapter.images?.[0], following = next?.images?.[0];
    const controls = `<div class="pdf-controls" aria-label="Hiển thị PDF">${[["width", "Vừa chiều rộng"], ["two", "Hai trang"], ["text", "Văn bản co giãn"]].map(([value, label]) => `<button type="button" class="btn-secondary" data-pdf-mode="${value}" aria-pressed="${mode === value}">${label}</button>`).join("")}<button type="button" class="btn-secondary" data-pdf-region aria-pressed="false"${mode === "text" ? " disabled" : ""}>Phóng vùng</button><button type="button" class="btn-secondary" data-pdf-reset${mode === "text" ? " disabled" : ""}>Đặt lại zoom</button></div>`;
    if (mode === "text") return controls + (paragraphs.length ? renderText(paragraphs) : '<p class="tools-empty">Trang này không có văn bản trích xuất. Chuyển về trang gốc để đọc ảnh; chưa hỗ trợ OCR.</p>');
    const markup = (img, title) => img ? `<figure class="illustration pdf-page"><div class="pdf-viewport"><img class="pdf-page-image" src="${escape(img.src)}" width="${img.w}" height="${img.h}" alt="${escape(title)}" draggable="false"><span class="pdf-region-box" hidden></span></div><figcaption>${escape(title)}</figcaption></figure>` : "";
    return controls + `<div class="pdf-pages${mode === "two" ? " pdf-two-pages" : ""}">${markup(image, chapter.title)}${mode === "two" ? markup(following, next?.title || "") : ""}</div>${mode === "two" && following ? '<p class="tools-hint">Trang bên phải là xem trước. Bấm chương sau để ghi nhận tiến độ của trang đó.</p>' : ""}`;
  }
  function create(options) {
    handlers = options; try { const saved = localStorage.getItem("tenshi-pdf-view-v1"); if (["width", "two", "text"].includes(saved)) mode = saved; } catch (_) {}
    document.addEventListener("click", (ev) => {
      const button = ev.target.closest("[data-pdf-mode]"); if (!button) return;
      try { localStorage.setItem("tenshi-pdf-view-v1", button.dataset.pdfMode); mode = button.dataset.pdfMode; options.preservePosition(options.refresh); }
      catch (_) { options.message("Không lưu được chế độ PDF."); }
    });
  }
  function attachSection(section) {
    const toggle = section.querySelector("[data-pdf-region]"), reset = section.querySelector("[data-pdf-reset]"); let enabled = false;
    if (!toggle || !reset || toggle.disabled) return;
    const views = [...section.querySelectorAll(".pdf-viewport")];
    toggle.onclick = () => { enabled = !enabled; toggle.setAttribute("aria-pressed", String(enabled)); views.forEach((v) => v.classList.toggle("is-selecting-region", enabled)); if (enabled) handlers.message("Kéo một hình chữ nhật trên trang để phóng vùng đó."); };
    reset.onclick = () => views.forEach((v) => { v.classList.remove("is-zoomed"); v.querySelector("img").style.width = "100%"; v.scrollTo(0, 0); });
    views.forEach((view) => {
      const img = view.querySelector("img"), box = view.querySelector(".pdf-region-box"); let drag = null;
      view.onpointerdown = (ev) => {
        if (!enabled || ev.button !== 0) return; ev.preventDefault();
        const rect = view.getBoundingClientRect(); drag = { x: ev.clientX - rect.left, y: ev.clientY - rect.top, rect, pointer: ev.pointerId, oldWidth: img.getBoundingClientRect().width, scrollX: view.scrollLeft, scrollY: view.scrollTop };
        view.setPointerCapture(ev.pointerId); box.hidden = false; box.style.cssText = `left:${drag.x + drag.scrollX}px;top:${drag.y + drag.scrollY}px;width:0;height:0`;
      };
      view.onpointermove = (ev) => {
        if (!drag || drag.pointer !== ev.pointerId) return;
        const x = Math.max(0, Math.min(view.clientWidth, ev.clientX - drag.rect.left)), y = Math.max(0, Math.min(view.clientHeight, ev.clientY - drag.rect.top));
        box.style.left = `${Math.min(drag.x, x) + drag.scrollX}px`; box.style.top = `${Math.min(drag.y, y) + drag.scrollY}px`; box.style.width = `${Math.abs(x - drag.x)}px`; box.style.height = `${Math.abs(y - drag.y)}px`;
      };
      view.onpointerup = (ev) => {
        if (!drag || drag.pointer !== ev.pointerId) return;
        const width = parseFloat(box.style.width), height = parseFloat(box.style.height), left = parseFloat(box.style.left), top = parseFloat(box.style.top);
        if (width > 15 && height > 15) {
          view.classList.add("is-zoomed");
          const factor = Math.min(view.clientWidth / width, view.clientHeight / height, view.clientWidth * 6 / drag.oldWidth);
          img.style.width = `${drag.oldWidth * factor}px`; view.scrollTo(left * factor, top * factor);
        }
        drag = null; box.hidden = true; enabled = false; toggle.setAttribute("aria-pressed", "false"); views.forEach((v) => v.classList.remove("is-selecting-region"));
      };
      view.onpointercancel = () => { drag = null; box.hidden = true; };
    });
  }
  return { parse, create, renderChapter, attachSection, pageScale, pageParagraphs, MAX_PAGES };
});
