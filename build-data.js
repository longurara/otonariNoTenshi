const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const META_PATH = path.join(__dirname, "output", "metadata.json");
const OUTPUT_DIR = path.join(__dirname, "output");
const PUBLIC_DIR = path.join(__dirname, "public");
const IMG_DEST = path.join(PUBLIC_DIR, "images");
const OPT_DEST = path.join(PUBLIC_DIR, "img");
// The app loads data/index.json (titles, pictures, word counts: a few KB)
// to draw the library, then one data/vol-N.<hash>.json per volume only when
// a chapter from it is opened. The hash in the name lets those files be
// cached forever; index.json always names the current ones.
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const INDEX_PATH = path.join(DATA_DIR, "index.json");
const LEGACY_DATA_PATH = path.join(PUBLIC_DIR, "data.json");

// Reader images are downscaled WebP copies of the scans (a few MB each as
// PNG); covers get a small thumbnail since they never show wider than 250px.
const READER_WIDTH = 1600;
const COVER_WIDTH = 520;

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_").trim();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Existing copies are kept (they are committed, and a fresh checkout's mtimes
// say nothing). Delete public/img/<volume> to rebuild one after a re-crawl.
async function optimizeImage(src, dest, width) {
  if (!fs.existsSync(dest)) {
    await sharp(src)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(dest);
  }
  const { width: w, height: h } = await sharp(dest).metadata();
  return { w, h };
}

// ------------------------------------------------------------
//  Text cleanup
// ------------------------------------------------------------

// Navigation chrome and uploader notes scraped along with some chapters.
const CHROME_PATTERNS = [
  /^Chương\s*(trước|tiếp)$/i,
  /^Chọn chương$/i,
  /^Loading\.*$/i,
  /^Truyện được leak bởi/i,
  /\sChương\s*trước$/, // page header: "<series> Chương N: <title> Chương trước"
  /^c\d+\s*v\d+$/i, // "c14 v4" chapter tags
  /^image$/i
];
const STRAY_HEADING = /^Chương\s*\d+\s*[:：]\s*\S.{0,120}$/i;
const SCENE_BREAK = /^[.•·*\s]+$/;

// A paragraph that stops without closing punctuation continues in the next one
// when that starts in lower case, or with a romanised name ("Mahiru"): the
// source split lines around names. Vietnamese sentence starts carry diacritics
// or follow a full stop, so they are left alone.
function continuesInto(prev, next) {
  if (/,$/.test(prev)) return /^\p{L}/u.test(next);
  if (!/[\p{L}\p{N}]$/u.test(prev)) return false;
  return /^\p{Ll}/u.test(next) || /^[A-Z][a-z]+(?!\p{L})/u.test(next) || /^[“"‘]\p{Ll}/u.test(next);
}

// Some pages were scraped through nested wrappers, so the body appears
// several times in a row. Keep one copy.
function collapseRepeats(paragraphs) {
  const n = paragraphs.length;
  for (let copies = Math.floor(n / 2); copies >= 2; copies -= 1) {
    if (n % copies !== 0) continue;
    const size = n / copies;
    if (paragraphs.every((p, i) => p === paragraphs[i % size])) return paragraphs.slice(0, size);
  }
  return paragraphs;
}

function cleanChapter(title, content) {
  let heading = null;
  // NFC keeps one code unit per letter, so search can map matches in the
  // accent-folded text straight back onto the original.
  let paragraphs = (content || "")
    .normalize("NFC")
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t\r\f\v]*\n[ \t\r\f\v\n]*/g, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .filter((p) => {
      if (CHROME_PATTERNS.some((re) => re.test(p))) return false;
      if (STRAY_HEADING.test(p)) {
        heading = heading || p;
        return false;
      }
      return true;
    });

  paragraphs = collapseRepeats(paragraphs);

  const merged = [];
  for (const p of paragraphs) {
    const prev = merged[merged.length - 1];
    if (SCENE_BREAK.test(p)) {
      if (prev !== "--- ---") merged.push("--- ---");
    } else if (prev && !prev.startsWith("---") && continuesInto(prev, p)) {
      merged[merged.length - 1] = `${prev} ${p}`;
    } else {
      merged.push(p);
    }
  }

  let cleanTitle = title.normalize("NFC").replace(/\s+/g, " ").trim().replace(/(.{6,})\1$/, "$1");
  if (heading && !/^Chương/i.test(cleanTitle)) cleanTitle = heading;

  return { title: cleanTitle, content: merged.join("\n\n") };
}

// ------------------------------------------------------------
//  Build
// ------------------------------------------------------------

function countWords(text) {
  const words = text.match(/\S+/g);
  return words ? words.length : 0;
}

async function main() {
  console.log("📦 Building data/ + images for static deployment...\n");

  const raw = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  let totalImages = 0;
  const data = [];
  const texts = [];

  for (const vol of raw) {
    const volDirName = sanitizeName(vol.volumeName);
    const srcImgDir = path.join(OUTPUT_DIR, volDirName, "images");
    const destImgDir = path.join(IMG_DEST, volDirName);
    const optDir = path.join(OPT_DEST, volDirName);

    // Scan & copy originals, then make the reader-size WebP copies.
    const imageFiles = fs.existsSync(srcImgDir) ? fs.readdirSync(srcImgDir).sort() : [];
    const imageInfo = {};
    if (imageFiles.length) {
      ensureDir(destImgDir);
      ensureDir(optDir);
    }

    for (const file of imageFiles) {
      const src = path.join(srcImgDir, file);
      const dest = path.join(destImgDir, file);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);

      const base = path.parse(file).name;
      const size = await optimizeImage(src, path.join(optDir, `${base}.webp`), READER_WIDTH);
      imageInfo[file] = { src: `/img/${volDirName}/${base}.webp`, ...size };
    }
    totalImages += imageFiles.length;

    const chapters = vol.chapters.map((ch, idx) => {
      // Find images for this chapter
      const prefix = ch.isIllustration
        ? "illu"
        : `ch${String(idx + 1).padStart(2, "0")}`;
      const chImages = imageFiles.filter((f) => f.startsWith(prefix));
      const text = ch.isIllustration
        ? { title: ch.title, content: "" }
        : cleanChapter(ch.title, ch.content);

      return {
        title: text.title,
        content: text.content,
        isIllustration: ch.isIllustration || false,
        images: chImages.map((f) => imageInfo[f])
      };
    });

    // The first picture in the volume doubles as its cover.
    let cover = "";
    const coverChapter = vol.chapters.findIndex((_, i) => chapters[i].images.length > 0);
    if (coverChapter >= 0) {
      const first = chapters[coverChapter].images[0];
      const file = imageFiles.find((f) => imageInfo[f] === first);
      const base = path.parse(file).name;
      await optimizeImage(path.join(srcImgDir, file), path.join(optDir, `${base}.cover.webp`), COVER_WIDTH);
      cover = `/img/${volDirName}/${base}.cover.webp`;
    }

    texts.push(chapters.map((ch) => ch.content));
    data.push({
      name: vol.volumeName,
      dirName: volDirName,
      cover,
      chapters: chapters.map(({ content, ...rest }) => ({ ...rest, words: countWords(content) }))
    });
  }

  // Rewrite data/ from scratch so files from older builds do not pile up.
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  ensureDir(DATA_DIR);
  if (fs.existsSync(LEGACY_DATA_PATH)) fs.rmSync(LEGACY_DATA_PATH);

  let textBytes = 0;
  data.forEach((volume, volIdx) => {
    const json = JSON.stringify(texts[volIdx]);
    const hash = crypto.createHash("sha1").update(json).digest("hex").slice(0, 10);
    const file = `vol-${volIdx}.${hash}.json`;
    fs.writeFileSync(path.join(DATA_DIR, file), json, "utf-8");
    volume.text = `/data/${file}`;
    textBytes += Buffer.byteLength(json);
  });

  fs.writeFileSync(INDEX_PATH, JSON.stringify(data), "utf-8");

  const indexKB = (fs.statSync(INDEX_PATH).size / 1024).toFixed(0);
  const totalChapters = data.reduce((s, v) => s + v.chapters.length, 0);

  console.log(`✅ data/index.json: ${indexKB} KB, chapter text: ${(textBytes / 1024 / 1024).toFixed(2)} MB in ${data.length} files`);
  console.log(`   ${data.length} volumes, ${totalChapters} chapters`);
  console.log(`   ${totalImages} images copied to public/images/, WebP copies in public/img/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
