(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EbookImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_FILE = 50 * 1024 * 1024;
  const MAX_EXPANDED = 150 * 1024 * 1024;
  const MAX_ENTRIES = 5000;
  const MAX_CHAPTERS = 3000;
  const DB_NAME = "tenshi-ebooks-v1";
  const words = (text) => text.trim() ? text.trim().split(/\s+/u).length : 0;
  const clean = (text) => String(text || "").replace(/\u0000/g, "").trim();

  // Resolve references inside the archive only. No imported URL is fetched.
  function archivePath(base, href) {
    let value = String(href || "").split(/[?#]/)[0];
    if (!value) return base;
    try { value = decodeURIComponent(value); } catch (_) { throw new Error("Đường dẫn trong EPUB không hợp lệ."); }
    if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//") || /[\\\u0000]/.test(value)) return null;
    const parts = value.startsWith("/") ? [] : base.split("/").slice(0, -1);
    for (const part of value.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") { if (!parts.length) return null; parts.pop(); }
      else parts.push(part);
    }
    return parts.join("/");
  }

  function decodeText(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let encoding = "utf-8";
    if (data[0] === 0xff && data[1] === 0xfe) encoding = "utf-16le";
    if (data[0] === 0xfe && data[1] === 0xff) encoding = "utf-16be";
    try { return clean(new TextDecoder(encoding, { fatal: true }).decode(data)).replace(/\r\n?/g, "\n"); }
    catch (_) { throw new Error("Không đọc được mã hóa văn bản. Hãy lưu TXT bằng UTF-8 hoặc UTF-16."); }
  }

  function textChapters(text, title) {
    const chapters = [];
    let name = title, lines = [];
    const finish = () => {
      const content = clean(lines.join("\n"));
      if (content) chapters.push(makeChapter(name, content.split(/\n\s*\n/).map(clean).filter(Boolean)));
      lines = [];
    };
    for (const line of text.split("\n")) {
      const heading = clean(line);
      if (heading.length < 160 && /^(?:(?:chương|chapter|phần|part)\s+(?:\d+[a-z]?|[ivxlcdm]+)(?=$|[\s.:：–—-])|(?:lời mở đầu|lời kết|prologue|epilogue)$)/iu.test(heading)) {
        finish(); name = heading;
      } else lines.push(line);
    }
    finish();
    if (!chapters.length) throw new Error("Tệp TXT không có nội dung để đọc.");
    if (chapters.length > MAX_CHAPTERS) throw new Error("Ebook có quá nhiều chương (tối đa 3.000).");
    return chapters;
  }

  function makeChapter(title, paragraphs, images = [], blocks) {
    return { title: clean(title) || "Chương", content: paragraphs.join("\n\n"), paragraphs,
      words: words(paragraphs.join(" ")), isIllustration: !paragraphs.length && images.length > 0,
      images, ...(blocks ? { blocks } : {}) };
  }

  // Read dimensions before decoding to reject small files with huge canvases.
  function rasterDimensions(data, type) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === "image/png" && data.length >= 24) return [view.getUint32(16), view.getUint32(20)];
    if (type === "image/gif" && data.length >= 10) return [view.getUint16(6, true), view.getUint16(8, true)];
    if (type === "image/webp" && data.length >= 30) {
      const kind = String.fromCharCode(...data.slice(12, 16));
      const uint24 = (offset) => data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
      if (kind === "VP8X") return [1 + uint24(24), 1 + uint24(27)];
      if (kind === "VP8 ") return [view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383];
      if (kind === "VP8L") return [1 + (data[21] | ((data[22] & 63) << 8)), 1 + ((data[22] >> 6) | (data[23] << 2) | ((data[24] & 15) << 10))];
    }
    if (type === "image/jpeg") {
      let offset = 2;
      while (offset + 4 < data.length && data[offset] === 255) {
        while (data[offset] === 255) offset++;
        const marker = data[offset++];
        if (offset + 7 > data.length) break;
        const length = view.getUint16(offset);
        if (length < 2) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
        }
        offset += length;
      }
    }
    return null;
  }

  // Check declared expansion before inflating; entry streams also enforce real sizes.
  function inspectArchive(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let end = -1;
    for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === data.length) { end = i; break; }
    }
    if (end < 0) throw new Error("Tệp EPUB bị hỏng hoặc không phải EPUB.");
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || count > MAX_ENTRIES || start + size > end) {
      throw new Error("EPUB quá lớn hoặc dùng cấu trúc ZIP không hỗ trợ.");
    }
    let offset = start, expanded = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Cấu trúc EPUB bị hỏng.");
      if (view.getUint16(offset + 8, true) & 1) throw new Error("EPUB có mật khẩu/mã hóa không được hỗ trợ.");
      expanded += view.getUint32(offset + 24, true);
      if (expanded > MAX_EXPANDED) throw new Error("Nội dung EPUB sau giải nén vượt quá 150 MB.");
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
      if (offset > start + size) throw new Error("Cấu trúc EPUB bị hỏng.");
    }
    return { entries: count, expanded };
  }

  function xml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Thông tin EPUB bị hỏng.");
    return doc;
  }
  const elements = (node, name) => [...node.getElementsByTagNameNS("*", name)];
  const firstText = (node, name) => clean(elements(node, name)[0]?.textContent);

  async function parseEpub(bytes, report) {
    inspectArchive(bytes);
    if (!globalThis.JSZip) throw new Error("Chưa tải được bộ đọc EPUB. Hãy mở lại trang rồi thử lại.");
    const zip = await globalThis.JSZip.loadAsync(bytes);
    const reads = new Map();
    let totalRead = 0;
    const read = (path, limit = 8 * 1024 * 1024) => {
      if (!zip.file(path)) throw new Error(`EPUB thiếu tệp: ${path}`);
      if (!reads.has(path)) reads.set(path, new Promise((resolve, reject) => {
        const chunks = []; let size = 0, failed = false;
        const stream = zip.file(path).internalStream("uint8array");
        stream.on("data", (chunk) => {
          size += chunk.length; totalRead += chunk.length;
          if (size > limit || totalRead > MAX_EXPANDED) {
            failed = true; stream.pause(); reject(new Error("Nội dung EPUB quá lớn để nhập."));
          } else chunks.push(chunk);
        }).on("error", reject).on("end", () => {
          if (failed) return;
          const out = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
          resolve(out);
        }).resume();
      }));
      return reads.get(path);
    };
    const readText = async (path) => decodeText(await read(path));
    const container = xml(await readText("META-INF/container.xml"));
    const packagePath = archivePath("", elements(container, "rootfile")[0]?.getAttribute("full-path"));
    if (!packagePath) throw new Error("Không tìm thấy nội dung chính của EPUB.");
    const opf = xml(await readText(packagePath));
    const metadata = elements(opf, "metadata")[0] || opf;
    const manifest = new Map(elements(opf, "item").map((item) => [item.getAttribute("id"), {
      path: archivePath(packagePath, item.getAttribute("href")),
      type: item.getAttribute("media-type"), props: (item.getAttribute("properties") || "").split(/\s+/)
    }]));
    const spine = elements(opf, "itemref").filter((item) => item.getAttribute("linear") !== "no")
      .map((item) => manifest.get(item.getAttribute("idref")));
    if (!spine.length || spine.length > MAX_CHAPTERS || spine.some((item) => !item?.path || !/^(application\/xhtml\+xml|text\/html)$/.test(item.type))) {
      throw new Error("EPUB không có mục lục nội dung hợp lệ hoặc dùng định dạng không hỗ trợ.");
    }
    if (zip.file("META-INF/encryption.xml")) {
      const encryption = xml(await readText("META-INF/encryption.xml"));
      if (elements(encryption, "EncryptionMethod").some((item) => !["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"].includes(item.getAttribute("Algorithm")))) {
        throw new Error("EPUB có DRM/mã hóa không được hỗ trợ.");
      }
    }
    const labels = new Map();
    const nav = [...manifest.values()].find((item) => item.props.includes("nav"));
    const ncx = manifest.get(elements(opf, "spine")[0]?.getAttribute("toc"));
    if (nav?.path && zip.file(nav.path)) {
      const template = document.createElement("template"); template.innerHTML = await readText(nav.path);
      for (const a of template.content.querySelectorAll("nav a[href]")) {
        const path = archivePath(nav.path, a.getAttribute("href"));
        if (path && !labels.has(path)) labels.set(path, clean(a.textContent));
      }
    } else if (ncx?.path && zip.file(ncx.path)) {
      for (const point of elements(xml(await readText(ncx.path)), "navPoint")) {
        const path = archivePath(ncx.path, elements(point, "content")[0]?.getAttribute("src"));
        if (path && !labels.has(path)) labels.set(path, firstText(point, "text"));
      }
    }
    const assets = [], assetMap = new Map();
    let skippedImages = 0;
    async function image(path) {
      if (!path || !zip.file(path)) { skippedImages++; return null; }
      if (assetMap.has(path)) return assetMap.get(path);
      const data = await read(path, 20 * 1024 * 1024);
      let type = "";
      if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) type = "image/png";
      else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) type = "image/jpeg";
      else if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) type = "image/gif";
      else if (String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") type = "image/webp";
      if (!type) { skippedImages++; assetMap.set(path, null); return null; }
      const dimensions = rasterDimensions(data, type);
      if (!dimensions || dimensions.some((value) => !value)) { skippedImages++; assetMap.set(path, null); return null; }
      if (dimensions[0] * dimensions[1] > 40000000) throw new Error("Ảnh minh họa trong EPUB có kích thước quá lớn.");
      const blob = new Blob([data], { type });
      let bitmap;
      try { bitmap = await createImageBitmap(blob); } catch (_) { skippedImages++; assetMap.set(path, null); return null; }
      const w = bitmap.width, h = bitmap.height; bitmap.close();
      if (w * h > 40000000) throw new Error("Ảnh minh họa trong EPUB có kích thước quá lớn.");
      const asset = { key: `image-${assets.length}`, blob, w, h };
      assets.push(asset); assetMap.set(path, asset);
      return asset;
    }
    const coverId = elements(opf, "meta").find((item) => item.getAttribute("name") === "cover")?.getAttribute("content");
    const coverItem = [...manifest.values()].find((item) => item.props.includes("cover-image")) || manifest.get(coverId);
    let cover = coverItem ? await image(coverItem.path) : null;
    const chapters = [];
    for (let i = 0; i < spine.length; i++) {
      report(`Đang đọc EPUB… ${i + 1}/${spine.length}`);
      const item = spine[i], template = document.createElement("template");
      // Keep all untrusted markup in an inert template. Only escaped plain text
      // and locally decoded image blobs enter the reader.
      template.innerHTML = await readText(item.path);
      const body = template.content.querySelector("body") || template.content;
      const firstHeading = body.querySelector("h1, h2, h3");
      const title = clean(firstHeading?.textContent) || labels.get(item.path) || `Chương ${i + 1}`;
      const paragraphs = [], images = [], blocks = [];
      let buffer = "";
      const flush = () => { const text = clean(buffer.replace(/[ \t\f]+/g, " ")); buffer = "";
        if (text) { blocks.push({ p: paragraphs.length }); paragraphs.push(text); } };
      const skip = new Set(["script", "style", "head", "title", "link", "meta", "base", "iframe", "object", "embed", "form", "audio", "video", "noscript"]);
      const blockTags = new Set(["p", "div", "section", "article", "li", "blockquote", "table", "tr", "figure", "figcaption", "pre"]);
      async function walk(node) {
        if (node.nodeType === 3) { buffer += node.textContent; return; }
        if (node.nodeType !== 1 && node.nodeType !== 11) return;
        const tag = node.localName?.toLowerCase();
        if (skip.has(tag) || node.getAttribute?.("aria-hidden") === "true" || node.hasAttribute?.("hidden")) return;
        if (/^h[1-6]$/.test(tag)) {
          flush(); if (node !== firstHeading) { buffer = `--- ${clean(node.textContent)} ---`; flush(); } return;
        }
        if (tag === "img" || tag === "image") {
          flush(); const src = node.getAttribute("src") || node.getAttribute("href") || node.getAttribute("xlink:href");
          const asset = await image(archivePath(item.path, src));
          if (asset) { blocks.push({ image: images.length }); images.push({ asset: asset.key, w: asset.w, h: asset.h }); }
          return;
        }
        if (tag === "br") { buffer += "\n"; return; }
        if (tag === "hr") { flush(); buffer = "------"; flush(); return; }
        if (blockTags.has(tag)) flush();
        for (const child of node.childNodes) await walk(child);
        if (blockTags.has(tag)) flush();
      }
      await walk(body); flush();
      if (paragraphs.length || images.length) chapters.push(makeChapter(title, paragraphs, images, blocks));
    }
    if (!chapters.length) throw new Error("EPUB không có văn bản hoặc ảnh có thể đọc.");
    if (!cover && assets.length) cover = assets[0];
    return { title: firstText(metadata, "title"), author: firstText(metadata, "creator"),
      description: firstText(metadata, "description").replace(/<[^>]*>/g, ""), chapters, assets,
      coverAsset: cover?.key, warnings: skippedImages ? "Một số ảnh SVG, ảnh lỗi hoặc ảnh ngoài tệp không được nhập." : "" };
  }

  function fallbackCover(title) {
    const canvas = document.createElement("canvas"); canvas.width = 520; canvas.height = 736;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#283d41"; ctx.fillRect(0, 0, 520, 736);
    ctx.strokeStyle = "#92b1a3"; ctx.strokeRect(28, 28, 464, 680);
    ctx.fillStyle = "#e9ede4"; ctx.font = "bold 36px Georgia";
    const lines = []; let line = "";
    for (const word of title.split(/\s+/)) {
      if (ctx.measureText(`${line} ${word}`).width > 410 && line) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
    lines.slice(0, 10).forEach((value, i) => ctx.fillText(value, 55, 170 + i * 48, 410));
    ctx.font = "20px sans-serif"; ctx.fillText("EBOOK CÁ NHÂN", 55, 660);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function parseFile(file, report = () => {}) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["epub", "txt"].includes(extension)) throw new Error("Chỉ hỗ trợ tệp EPUB và TXT.");
    if (!file.size || file.size > MAX_FILE) throw new Error("Chọn ebook có dung lượng từ 1 byte đến 50 MB.");
    report("Đang đọc tệp…");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((n) => n.toString(16).padStart(2, "0")).join("");
    const defaultTitle = clean(file.name.replace(/\.[^.]+$/, "").replace(/[_]/g, " ")) || "Ebook";
    const parsed = extension === "epub" ? await parseEpub(bytes, report) : {
      title: defaultTitle, author: "", chapters: textChapters(decodeText(bytes), defaultTitle), assets: []
    };
    const title = parsed.title || defaultTitle;
    if (!parsed.coverAsset) {
      const blob = await fallbackCover(title);
      if (blob) { parsed.assets.push({ key: "fallback-cover", blob, w: 520, h: 736 }); parsed.coverAsset = "fallback-cover"; }
    }
    const count = parsed.chapters.length;
    return { slug: `ebook-${digest.slice(0, 24)}`, digest, personal: true, titleVi: title, titleJp: "",
      author: parsed.author || "", illustrator: "", status: "Lưu trên thiết bị", tags: [extension.toUpperCase(), "Ebook cá nhân"],
      description: parsed.description || "Ebook do bạn nhập, được lưu riêng trong trình duyệt này.",
      sourceFilename: file.name, sourceFormat: extension.toUpperCase(), importedAt: Date.now(),
      sourceBytes: file.size, volumes: 1, chapters: count, assets: parsed.assets, coverAsset: parsed.coverAsset,
      warnings: parsed.warnings || "", volumesData: [{ name: title, title, dirName: "ebook", bytes: file.size,
        words: parsed.chapters.reduce((sum, chapter) => sum + chapter.words, 0), chapters: parsed.chapters }] };
  }

  async function openDB() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error("Trình duyệt không hỗ trợ lưu ebook.")); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("books", { keyPath: "slug" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Hãy đóng các tab đọc truyện khác rồi thử lại."));
    });
  }
  async function transaction(mode, operation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("books", mode); let result;
      const request = operation(tx.objectStore("books"));
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error("Không lưu được ebook.")); };
    });
  }
  const list = () => transaction("readonly", (store) => store.getAll());
  const save = (book) => transaction("readwrite", (store) => store.put(book));
  const remove = (slug) => transaction("readwrite", (store) => store.delete(slug));
  const urls = new Set();
  function hydrate(book) {
    const assets = new Map(book.assets.map((asset) => {
      const url = URL.createObjectURL(asset.blob); urls.add(url); return [asset.key, url];
    }));
    book.cover = assets.get(book.coverAsset) || "";
    for (const volume of book.volumesData) {
      volume.cover = book.cover;
      for (const chapter of volume.chapters) for (const image of chapter.images) image.src = assets.get(image.asset) || "";
    }
    return book;
  }
  if (globalThis.addEventListener) globalThis.addEventListener("pagehide", (event) => {
    if (!event.persisted) { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
  });

  function attachUI({ onSaved, message }) {
    const dialog = document.querySelector("#ebook-import-dialog");
    const input = document.querySelector("#ebook-file"), submit = document.querySelector("#ebook-save");
    const preview = document.querySelector("#ebook-preview"), status = document.querySelector("#ebook-status");
    const title = document.querySelector("#ebook-title"), author = document.querySelector("#ebook-author");
    let draft = null, token = 0, busy = false;
    document.querySelector("#btn-import-ebook").addEventListener("click", () => dialog.showModal());
    document.querySelector("#ebook-close").addEventListener("click", () => { if (!busy) dialog.close(); });
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", () => { token++; draft = null; preview.hidden = true; input.value = ""; status.textContent = ""; submit.disabled = true; });
    const setBusy = (value) => { busy = value; input.disabled = value; submit.disabled = value || !draft;
      document.querySelector("#ebook-close").disabled = value; dialog.setAttribute("aria-busy", String(value)); };
    input.addEventListener("change", async () => {
      const file = input.files[0]; if (!file) return;
      const ownToken = ++token; draft = null; preview.hidden = true; setBusy(true);
      try {
        const parsed = await parseFile(file, (text) => { status.textContent = text; });
        if (ownToken !== token) return;
        const existing = (await list()).find((book) => book.digest === parsed.digest);
        if (existing) { status.textContent = "Ebook này đã có trên kệ. Đang mở…"; onSaved(existing.slug); return; }
        draft = parsed; title.value = parsed.titleVi; author.value = parsed.author; preview.hidden = false;
        document.querySelector("#ebook-summary").textContent = `${parsed.chapters} chương · ${parsed.volumesData[0].words.toLocaleString("vi")} từ`;
        status.textContent = parsed.warnings || "Đã đọc xong tệp. Bạn có thể sửa tên sách và tác giả trước khi thêm.";
      } catch (error) { status.textContent = error.message || "Không đọc được ebook. Hãy thử tệp khác."; }
      finally { if (ownToken === token) setBusy(false); }
    });
    document.querySelector("#ebook-import-form").addEventListener("submit", async (event) => {
      event.preventDefault(); if (!draft || busy) return;
      draft.titleVi = clean(title.value) || draft.titleVi; draft.author = clean(author.value);
      draft.volumesData[0].name = draft.titleVi; draft.volumesData[0].title = draft.titleVi;
      setBusy(true); status.textContent = "Đang lưu ebook…";
      try {
        if (draft.coverAsset === "fallback-cover") {
          const asset = draft.assets.find((item) => item.key === "fallback-cover");
          asset.blob = await fallbackCover(draft.titleVi);
        }
        await save(draft);
        if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
        onSaved(draft.slug);
      } catch (error) {
        status.textContent = error.name === "QuotaExceededError" ? "Bộ nhớ trình duyệt đã đầy. Xóa bớt ebook rồi thử lại." : "Không lưu được ebook. Kiểm tra quyền lưu trữ của trình duyệt rồi thử lại.";
        setBusy(false);
      }
    });
    return { async deleteBook(book) {
      if (!confirm(`Xóa “${book.titleVi}” khỏi thiết bị này? Ghi chú và tiến độ đọc vẫn được giữ để bạn nhập lại sau.`)) return;
      try { await remove(book.slug); location.hash = ""; location.reload(); }
      catch (_) { message("Không xóa được ebook. Hãy thử lại."); }
    } };
  }

  return { archivePath, decodeText, textChapters, inspectArchive, rasterDimensions, parseFile, list, save, remove, hydrate, attachUI };
});
