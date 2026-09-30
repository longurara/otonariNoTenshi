const { test } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { archivePath, decodeText, textChapters, inspectArchive, rasterDimensions } = require("../public/ebook-import.js");

test("TXT retains Vietnamese text, preface and chapter boundaries", () => {
  const chapters = textChapters("Lời giới thiệu.\n\nChương 1: Bắt đầu\nXin chào.\n\nMột đoạn nữa.\nChương trình này là văn bản.\n\nChapter II — End\nGoodbye.", "Tên sách");
  assert.deepEqual(chapters.map((c) => c.title), ["Tên sách", "Chương 1: Bắt đầu", "Chapter II — End"]);
  assert.equal(chapters[1].paragraphs.length, 2);
  assert.match(chapters[1].content, /Chương trình này/);
  assert.equal(textChapters("Nội dung không có tiêu đề.", "Tên sách")[0].title, "Tên sách");
  assert.throws(() => textChapters(" \n ", "Trống"), /không có nội dung/);
});

test("TXT handles Unicode BOMs and reports invalid encodings", () => {
  assert.equal(decodeText(Buffer.from("\ufeffTiếng Việt\r\nDòng sau", "utf8")), "Tiếng Việt\nDòng sau");
  const little = Buffer.concat([Buffer.from([255, 254]), Buffer.from("Tiếng Việt", "utf16le")]);
  assert.equal(decodeText(little), "Tiếng Việt");
  assert.equal(decodeText(Buffer.from(little).swap16()), "Tiếng Việt");
  assert.throws(() => decodeText(new Uint8Array([0xff, 0xff, 0xff])), /mã hóa/);
});

test("EPUB references stay inside the archive without external URLs", () => {
  assert.equal(archivePath("OPS/Text/ch1.xhtml", "../Images/b%C3%ACa.png#cover"), "OPS/Images/bìa.png");
  assert.equal(archivePath("OPS/nav.xhtml", "Text/ch1.xhtml#section"), "OPS/Text/ch1.xhtml");
  assert.equal(archivePath("OPS/nav.xhtml", "#section"), "OPS/nav.xhtml");
  for (const href of ["https://example.com/a.jpg", "//example.com/a.jpg", "../../../outside", "javascript:alert(1)", "..\\outside"]) {
    assert.equal(archivePath("OPS/ch1.xhtml", href), null);
  }
});

test("EPUB expansion and encryption are checked before decompression", async () => {
  const zip = new JSZip(); zip.file("mimetype", "application/epub+zip");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  assert.equal(inspectArchive(bytes).entries, 1);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const central = bytes.findIndex((_, i) => i + 4 < bytes.length && view.getUint32(i, true) === 0x02014b50);
  view.setUint32(central + 24, 151 * 1024 * 1024, true);
  assert.throws(() => inspectArchive(bytes), /150 MB/);
  view.setUint32(central + 24, 10, true); view.setUint16(central + 8, 1, true);
  assert.throws(() => inspectArchive(bytes), /mã hóa/);
  assert.throws(() => inspectArchive(new Uint8Array([1, 2, 3])), /không phải EPUB/);
});

test("raster headers expose oversized images before decoding", () => {
  const png = new Uint8Array(24), view = new DataView(png.buffer);
  view.setUint32(16, 100000); view.setUint32(20, 100000);
  assert.deepEqual(rasterDimensions(png, "image/png"), [100000, 100000]);
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 10, 0, 8, 1, 1, 17, 0, 255, 217]);
  assert.deepEqual(rasterDimensions(jpeg, "image/jpeg"), [8, 10]);
  assert.equal(rasterDimensions(new Uint8Array(3), "image/png"), null);
});
