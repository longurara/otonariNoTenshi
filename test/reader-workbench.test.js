const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeState, profileSettings, bookPosition, positionTarget, termMatches } = require("../public/reader-workbench.js");
const { pageScale, pageParagraphs } = require("../public/pdf-reader.js");
const { validateBook } = require("../public/library-backup.js");

test("book position and skim target agree across chapters of unequal lengths and image pages", () => {
  const entries = [0, 500, 2000, 30].map((words) => ({ chapter: { words } }));
  for (let i = 0; i < entries.length; i++) for (const fraction of [0, 0.1, 0.5, 0.99]) {
    const result = positionTarget(entries, bookPosition(entries, i, fraction));
    assert.equal(result.index, i); assert.ok(Math.abs(result.fraction - fraction) < 1e-10);
  }
  assert.deepEqual(positionTarget(entries, 1), { index: 3, fraction: 1 });
  assert.deepEqual(positionTarget([], 0.5), { index: 0, fraction: 0 });
});
test("glossary matches whole Unicode words, longer names first, and literal regex characters", () => {
  const text = "An Anh. Kakeru Sorano và Sorano. C++! sách.";
  const hits = termMatches(text, ["An", "Sorano", "Kakeru Sorano", "C++", "sách"]);
  assert.deepEqual(hits.map((h) => text.slice(h.start, h.end)), ["An", "Kakeru Sorano", "Sorano", "C++", "sách"]);
  assert.deepEqual(termMatches("bán sáchvé", ["sách"]), []);
});
test("restored workbench state bounds imported data and rejects unknown quick actions", () => {
  const state = normalizeState({ quick: ["map", "map", "__proto__", "evil"], glossary: [{ term: "A", meaning: "B", slug: "book", id: '<script>', p: -1 }], profiles: [{ name: "Night", settings: { fontSize: 1000, lineHeight: 99, theme: "bad", layout: { width: -1 } } }] });
  assert.deepEqual(state.quick, ["map"]); assert.equal(state.glossary[0].id, ""); assert.equal(state.glossary[0].p, 0);
  assert.equal(state.profiles[0].settings.fontSize, 28); assert.equal(state.profiles[0].settings.theme, "sepia");
  assert.equal(state.profiles[0].settings.layout.width, 460); assert.equal(profileSettings().fontSize, 20);
});
test("PDF page rasterization stays bounded and text extraction honors line endings", () => {
  const scale = pageScale(10000, 15000); assert.ok(10000 * 15000 * scale * scale <= 2200000.01);
  assert.throws(() => pageScale(0, 50));
  assert.deepEqual(pageParagraphs([{ str: "Hello", transform: [1,0,0,1,0,40], height: 10 }, { str: "world", hasEOL: true }, { str: "Next", hasEOL: true }]), ["Hello world", "Next"]);
});
test("PDF backup keeps scanned pages as reading pages with images and no invented text", () => {
  const digest = "a".repeat(64), book = validateBook({ slug: `ebook-${digest.slice(0,24)}`, digest, sourceFormat: "PDF", titleVi: "Scanned", assets: [{ key: "pdf-page-1", blob: new Blob(["jpeg"], { type: "image/jpeg" }), w: 100, h: 150 }], volumesData: [{ chapters: [{ title: "Trang 1", content: "", paragraphs: [], images: [{ asset: "pdf-page-1" }] }] }] });
  assert.equal(book.sourceFormat, "PDF"); assert.equal(book.volumesData[0].chapters[0].isIllustration, false);
  assert.equal(book.volumesData[0].chapters[0].content, "");
});
