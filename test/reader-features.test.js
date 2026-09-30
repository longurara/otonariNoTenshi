const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chapterEntries, newChapters, applyPronunciation, unlockedCharacters, goalProgress, wrapLines } = require("../public/reader-features");

const series = (chapters) => ({ slug: "example", volumesData: [{ name: "Tập 1", dirName: "Tap_1", chapters: chapters.map((title) => ({ title, isIllustration: title === "Minh họa" })) }] });

test("first visits establish a baseline; only new story chapters trigger badges", () => {
  const original = series(["Minh họa", "Chương 1", "Chương 2"]);
  assert.deepEqual(newChapters(original, undefined), []);
  const known = chapterEntries(original).map((chapter) => chapter.id);
  const updated = series(["Minh họa", "Chương 1", "Chương mới xen giữa", "Chương 2"]);
  assert.deepEqual(newChapters(updated, known).map((chapter) => chapter.chapter.title), ["Chương mới xen giữa"]);
  assert.deepEqual(newChapters(series(["Chương 2", "Minh họa", "Chương 1"]), known), []);
});

test("pronunciation replaces whole names without changing surrounding Vietnamese words", () => {
  const result = applyPronunciation("Mahiru, MAHIRU và xMahiru, Mahiruđ, Amane!", [{ name: "Mahiru", say: "Ma hi rư" }, { name: "Amane", say: "A ma nê" }]);
  assert.equal(result.text, "Ma hi rư, Ma hi rư và xMahiru, Mahiruđ, A ma nê!");
  assert.equal(result.map.length, result.text.length + 1);
  assert.equal(result.map[result.map.length - 1], "Mahiru, MAHIRU và xMahiru, Mahiruđ, Amane!".length);
  assert.ok(result.map.every((offset, index) => index === 0 || offset >= result.map[index - 1]));
});

test("longer aliases win; pronunciation output is not recursively replaced", () => {
  const rules = [{ name: "A+B", say: "A plus B" }, { name: "Shiina Mahiru", say: "Shi i na" }, { name: "Mahiru", say: "Ma hi rư" }, { name: "Ma", say: "Mã" }];
  assert.equal(applyPronunciation("A+B và Shiina Mahiru gặp Mahiru.", rules).text, "A plus B và Shi i na gặp Ma hi rư.");
});

test("word highlights after an expanded name map back to the original text", () => {
  const original = "Amane gặp Mahiru.";
  const result = applyPronunciation(original, [{ name: "Amane", say: "A ma nê" }]);
  const offset = result.text.indexOf("gặp");
  assert.equal(original.slice(result.map[offset], result.map[offset + 3]), "gặp");
});

test("future character notes stay locked; previously reached notes remain visible", () => {
  const entries = chapterEntries(series(["Chương 1", "Chương 2", "Chương 3"]));
  const characters = [{ name: "A", gate: entries[0].id }, { name: "B", gate: entries[2].id }, { name: "Removed", gate: "missing" }];
  assert.deepEqual(unlockedCharacters(characters, entries, []).map((item) => item.name), []);
  assert.deepEqual(unlockedCharacters(characters, entries, [entries[1].id]).map((item) => item.name), ["A"]);
  assert.deepEqual(unlockedCharacters(characters, entries, [entries[2].id, entries[0].id]).map((item) => item.name), ["A", "B"]);
});

test("goals count distinct chapters and exact elapsed minutes", () => {
  assert.equal(goalProgress({ kind: "chapters", target: 2, chapters: ["a", "a"] }).reached, false);
  assert.equal(goalProgress({ kind: "chapters", target: 2, chapters: ["a", "b", "a"] }).reached, true);
  assert.equal(goalProgress({ kind: "minutes", target: 15, seconds: 899 }).reached, false);
  assert.equal(goalProgress({ kind: "minutes", target: 15, seconds: 900 }).reached, true);
});

test("quote cards wrap long words and preserve paragraph breaks without truncation", () => {
  const context = { measureText: (text) => ({ width: [...text].length * 10 }) };
  const original = "Một câu chuyện\n\nabcdefghijklmno";
  const lines = wrapLines(context, original, 60);
  assert.ok(lines.every((line) => context.measureText(line).width <= 60));
  assert.ok(lines.includes(""));
  assert.equal(lines.join("").replace(/\s/g, ""), original.replace(/\s/g, ""));
});
