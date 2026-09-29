// Turns a folder of chapter pages saved from a reader site (one folder per
// volume, one .html per chapter) into output/<slug>/metadata.json plus the
// pictures in output/<slug>/<volume>/images, the same shape crawl.js writes
// for the first series. build-data.js takes it from there.
//
//   node import-html.js <slug> "Tập 1=<folder>" "Tập 2=<folder>" ...
//
// Pictures are downloaded so the site does not depend on the image hosts;
// the reader site's own chapter banners (ads for the series page) are left out.

const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "output");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SKIP_IMAGE = /\/chapter-banners\//;

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_").trim();
}

// Saved file names spell non-ASCII letters as "#U00ec".
function decodeFileName(name) {
  return name.replace(/#U([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).normalize("NFC");
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// Illustrations first, then numbered chapters, then anything else (afterword).
function chapterOrder(title) {
  if (/^Minh họa/i.test(title)) return -1;
  const numbered = title.match(/^Chương\s*(\d+)/i);
  return numbered ? Number(numbered[1]) : 10000;
}

function parseChapter(html, fallbackTitle) {
  const hidden = html.match(/<p style="display: none">([\s\S]*?)<\/p>/);
  const title = decodeEntities((hidden ? hidden[1] : fallbackTitle).replace(/<[^>]+>/g, "")).trim();
  const paragraphs = [];
  const images = [];
  for (const [, inner] of html.matchAll(/<p id="\d+">([\s\S]*?)<\/p>/g)) {
    for (const [, src] of inner.matchAll(/<img[^>]*src="([^"]+)"/g)) {
      if (!SKIP_IMAGE.test(src)) images.push(decodeEntities(src));
    }
    const text = decodeEntities(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  }
  return { title, content: paragraphs.join("\n\n"), images };
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/*,*/*" } });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.startsWith("image/")) throw new Error(`${res.status} ${type}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (error) {
      if (attempt === 3) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function extensionOf(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
}

async function main() {
  const [slug, ...volumeArgs] = process.argv.slice(2);
  if (!slug || !volumeArgs.length) {
    console.error('Usage: node import-html.js <slug> "Tập 1=<folder>" ...');
    process.exit(1);
  }

  const seriesDir = path.join(OUTPUT_DIR, slug);
  fs.mkdirSync(seriesDir, { recursive: true });
  const metadata = [];

  for (const arg of volumeArgs) {
    const [volumeName, folder] = arg.split(/=(.*)/s);
    const files = fs.readdirSync(folder).filter((file) => file.endsWith(".html"));
    const chapters = files
      .map((file) => parseChapter(fs.readFileSync(path.join(folder, file), "utf-8"), decodeFileName(file.replace(/\.html$/, ""))))
      .sort((a, b) => chapterOrder(a.title) - chapterOrder(b.title));

    const imagesDir = path.join(seriesDir, sanitizeName(volumeName), "images");
    fs.mkdirSync(imagesDir, { recursive: true });

    let storyIndex = 0;
    const out = [];
    for (const chapter of chapters) {
      const isIllustration = /^Minh họa/i.test(chapter.title);
      if (!isIllustration) storyIndex += 1;
      // build-data.js files a volume's pictures under "illu*" and "chNN_*".
      const prefix = isIllustration ? "illu" : `ch${String(storyIndex).padStart(2, "0")}`;
      const images = [];
      for (const [i, url] of chapter.images.entries()) {
        const file = `${prefix}_${String(i + 1).padStart(2, "0")}${extensionOf(url)}`;
        await download(url, path.join(imagesDir, file));
        images.push(url);
      }
      out.push({ title: chapter.title, content: isIllustration ? "" : chapter.content, images, isIllustration });
      console.log(`  ${volumeName} · ${chapter.title}: ${chapter.content.length} chars, ${images.length} pictures`);
    }
    metadata.push({ volumeName, chapters: out });
  }

  fs.writeFileSync(path.join(seriesDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  console.log(`\nWrote ${path.relative(__dirname, path.join(seriesDir, "metadata.json"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
