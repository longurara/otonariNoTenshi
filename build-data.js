const fs = require("fs");
const path = require("path");

const META_PATH = path.join(__dirname, "output", "metadata.json");
const OUTPUT_DIR = path.join(__dirname, "output");
const PUBLIC_DIR = path.join(__dirname, "public");
const IMG_DEST = path.join(PUBLIC_DIR, "images");
const DATA_PATH = path.join(PUBLIC_DIR, "data.json");

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_").trim();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

console.log("📦 Building data.json + copying images for static deployment...\n");

const raw = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));

let totalImages = 0;

const data = raw.map((vol) => {
  const volDirName = sanitizeName(vol.volumeName);
  const srcImgDir = path.join(OUTPUT_DIR, volDirName, "images");
  const destImgDir = path.join(IMG_DEST, volDirName);

  // Scan & copy images
  let imageFiles = [];
  if (fs.existsSync(srcImgDir)) {
    imageFiles = fs.readdirSync(srcImgDir).sort();
    ensureDir(destImgDir);

    for (const file of imageFiles) {
      const src = path.join(srcImgDir, file);
      const dest = path.join(destImgDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
    totalImages += imageFiles.length;
  }

  return {
    name: vol.volumeName,
    dirName: volDirName,
    chapters: vol.chapters.map((ch, idx) => {
      // Find images for this chapter
      const prefix = ch.isIllustration
        ? "illu"
        : `ch${String(idx + 1).padStart(2, "0")}`;
      const chImages = imageFiles.filter((f) => f.startsWith(prefix));

      return {
        title: ch.title,
        content: ch.content || "",
        isIllustration: ch.isIllustration || false,
        images: chImages, // actual filenames
      };
    }),
  };
});

ensureDir(PUBLIC_DIR);
fs.writeFileSync(DATA_PATH, JSON.stringify(data), "utf-8");

const sizeMB = (fs.statSync(DATA_PATH).size / 1024 / 1024).toFixed(2);
const totalChapters = data.reduce((s, v) => s + v.chapters.length, 0);

console.log(`✅ data.json: ${sizeMB} MB`);
console.log(`   ${data.length} volumes, ${totalChapters} chapters`);
console.log(`   ${totalImages} images copied to public/images/`);
