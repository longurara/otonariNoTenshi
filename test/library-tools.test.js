const { test } = require("node:test");
const assert = require("node:assert/strict");
const Ebooks = require("../public/ebook-import.js");
const { locatePart, normalizeState } = require("../public/library-tools.js");
const { validateBook, validateSettings, restore } = require("../public/library-backup.js");

test("annotation anchors recover after text moves and distinguish repeated quotes", () => {
  const part = { start: 9, end: 17, quote: "xin chào", prefix: "Mở đầu. ", suffix: " bạn." };
  const text = "xin chào người khác. Mở đầu. xin chào bạn.";
  assert.equal(text.slice(locatePart(text, part).start, locatePart(text, part).end), "xin chào");
  assert.equal(locatePart(text, part).start, text.lastIndexOf("xin chào"));
  assert.equal(locatePart("Không còn câu cũ.", part), null);
});

test("TXT chapter controls preserve text while merging, splitting and changing detection", () => {
  const chapters = Ebooks.textChapters("1. Mở đầu\nA.\n\nB.\n\n2. Kết thúc\nC.", "Sách", "numbered");
  assert.deepEqual(chapters.map((c) => c.title), ["1. Mở đầu", "2. Kết thúc"]);
  const split = Ebooks.splitTextChapter(chapters, 0, 1);
  assert.deepEqual(split.map((c) => c.content), ["A.", "B.", "C."]);
  const merged = Ebooks.mergeTextChapters(split, 0);
  assert.match(merged[0].content, /A\.[\s\S]*B\./);
  assert.equal(Ebooks.textChapters("# Tiêu đề\nNội dung", "Sách", "markdown")[0].title, "# Tiêu đề");
  assert.equal(Ebooks.textChapters("Chương 1\nA\nChương 2\nB", "Sách", "single").length, 1);
});

test("rich EPUB output preserves formatting and nested lists while escaping imported text", () => {
  const html = Ebooks.renderRich([{ text: "<script>bad</script>", marks: ["strong", "script"], note: 'id" onclick="bad' }]);
  assert.match(html, /<strong>&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|onclick="bad/);
  const nested = Ebooks.renderBlocks([{ p: 0, list: "ol", level: 0, ordinal: 1 }, { p: 1, list: "ul", level: 1, ordinal: 1 }, { p: 2, list: "ol", level: 0, ordinal: 2 }, { p: 3 }], (b) => `<p>${b.p}</p>`, () => "");
  assert.match(nested, /<li><p>0<\/p><ul/);
  assert.match(nested, /<\/ul><\/li><li><p>2/);
  assert.ok(nested.endsWith("</ol><p>3</p>"));
});

test("shelf summaries omit chapter text and illustration blobs", () => {
  const cover = new Blob(["cover"], { type: "image/png" });
  const summary = Ebooks.summary({ slug: "ebook-test", assets: [{ key: "cover", blob: cover }], coverAsset: "cover", footnotes: { note: "secret" }, txtSource: "large source", volumesData: [{ chapters: [{ title: "A", words: 2, isIllustration: false, content: "large content", paragraphs: ["large content"], rich: [], images: [{ asset: "image", w: 10, h: 20, src: "blob:old" }] }] }] });
  assert.equal(summary.coverBlob, cover);
  assert.equal(summary.assets, undefined);
  assert.equal(summary.volumesData[0].chapters[0].content, undefined);
  assert.equal(summary.volumesData[0].chapters[0].images[0].src, undefined);
});

test("restored books retain reading structure without runtime URLs or arbitrary markup", () => {
  const book = validateBook({ slug: "ebook-" + "a".repeat(24), digest: "a".repeat(64), titleVi: "Sách", sourceFormat: "TXT", assets: [], volumesData: [{ chapters: [{ title: "Chương 1", content: "Chữ đậm", paragraphs: ["Chữ đậm"], images: [], rich: [[{ text: "Chữ đậm", marks: ["strong", "script"] }]], blocks: [{ p: 0 }] }] }] });
  assert.deepEqual(book.volumesData[0].chapters[0].rich[0][0].marks, ["strong"]);
  assert.equal(book.volumesData[0].chapters[0].words, 2);
  assert.throws(() => validateBook({ ...book, volumesData: [{ chapters: [{ content: "A", paragraphs: ["B"], images: [] }] }] }));
  assert.throws(() => validateSettings({ "unrelated-account": "secret" }));
  assert.throws(() => validateSettings({ "tenshi-reader-tools-v1": JSON.stringify({ version: 1, quotes: [{ id: 'x" onclick="bad', text: "A" }] }) }));
});

test("restored library state clamps layout and drops invalid annotation anchors", () => {
  const value = normalizeState({ version: 1, layout: { width: "bad", margin: 500, gap: -20 }, marks: [{ id: "good", slug: "book", volIdx: 0, chapIdx: 0, parts: [{ p: -1, start: 0, end: 2, quote: "AB" }], color: "red" }] });
  assert.equal(value.layout.width, 700); assert.equal(value.layout.margin, 64); assert.equal(value.layout.gap, 0.4);
  assert.equal(value.marks[0].color, "yellow"); assert.deepEqual(value.marks[0].parts, []);
});

test("failed ebook restore rolls settings back even when temporary values occupy the quota", async () => {
  const previousStorage = global.localStorage, previousEbooks = global.EbookImport;
  const values = new Map([["tenshi-a", "a".repeat(30)], ["tenshi-b", "b".repeat(5)]]);
  global.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem(key, value) {
      const next = new Map(values); next.set(key, value);
      if ([...next.values()].reduce((sum, item) => sum + item.length, 0) > 50) throw new Error("Quota exceeded");
      values.set(key, value);
    }
  };
  global.EbookImport = { saveMany: async () => { throw new Error("Database full"); } };
  try {
    await assert.rejects(restore({ settings: { "tenshi-a": "x", "tenshi-b": "y".repeat(40) }, books: [] }), /Database full/);
    assert.equal(values.get("tenshi-a"), "a".repeat(30));
    assert.equal(values.get("tenshi-b"), "b".repeat(5));
  } finally {
    if (previousStorage === undefined) delete global.localStorage; else global.localStorage = previousStorage;
    if (previousEbooks === undefined) delete global.EbookImport; else global.EbookImport = previousEbooks;
  }
});
