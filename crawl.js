const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const epub = require("epub-gen-memory").default;
const docx = require("docx");

// ============================================================
//  CONFIG
// ============================================================
const BASE_URL = "https://otonaritenshi.wordpress.com";
const OUTPUT_DIR = path.join(__dirname, "output");
const EPUB_OUTPUT = path.join(__dirname, "otonari_no_tenshi.epub");
const DOCX_OUTPUT = path.join(__dirname, "otonari_no_tenshi.docx");
const REQUEST_DELAY_MS = 1500; // delay giữa các request
const MAX_RETRIES = 3;

// ============================================================
//  HELPERS
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 30000,
      });
      return data;
    } catch (err) {
      console.error(
        `  ⚠ Attempt ${attempt}/${retries} failed for ${url}: ${err.message}`
      );
      if (attempt < retries) await sleep(2000);
      else throw err;
    }
  }
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadImage(url, destPath, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 30000,
      });
      fs.writeFileSync(destPath, Buffer.from(response.data));
      return true;
    } catch (err) {
      if (attempt < retries) await sleep(1000);
      else {
        console.error(`      ⚠ Không tải được ảnh: ${path.basename(destPath)} (${err.message})`);
        return false;
      }
    }
  }
}

function getBestImageUrl(imgEl, $) {
  // Ưu tiên lấy ảnh gốc (chất lượng cao nhất)
  return (
    $(imgEl).attr("data-orig-file") ||
    $(imgEl).attr("data-large-file") ||
    $(imgEl).attr("src") ||
    ""
  );
}

function getImageExtension(url) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"].includes(ext)) return ext;
  return ".jpg"; // default
}

// ============================================================
//  STEP 1 — Lấy danh sách các tập từ trang chủ
// ============================================================
async function getVolumeList() {
  console.log("📚 Đang lấy danh sách tập từ trang chủ...");
  const html = await fetchPage(BASE_URL);
  const $ = cheerio.load(html);

  const volumes = [];

  // Trang chủ có các heading h2 chứa link đến mục lục mỗi tập
  $(".entry-content a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();

    // Chỉ lấy các link dẫn đến trang mục lục (danh sách chương)
    if (
      href &&
      text &&
      (text.startsWith("Tập") || text.startsWith("Ngoại Truyện")) &&
      href.includes("danh-sach")
    ) {
      // Tránh trùng lặp
      if (!volumes.find((v) => v.url === href)) {
        volumes.push({ name: text, url: href });
      }
    }
  });

  console.log(`  ✅ Tìm thấy ${volumes.length} tập\n`);
  return volumes;
}

// ============================================================
//  STEP 2 — Lấy danh sách chương từ trang mục lục mỗi tập
// ============================================================
async function getChapterList(volumeUrl, volumeName) {
  console.log(`📖 Đang lấy mục lục: ${volumeName}`);
  const html = await fetchPage(volumeUrl);
  const $ = cheerio.load(html);

  const chapters = [];

  // URLs cần bỏ qua
  const SKIP_PATTERNS = [
    "?share=",
    "/category/",
    "/tag/",
    "/author/",
    "#respond",
    "#comment",
    "facebook.com",
    "twitter.com",
    "x.com",
    "pinterest.com",
  ];

  $(".entry-content a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();

    if (!href || !text) return;
    if (text.includes("danh-sach")) return;
    if (text.includes("Chia sẻ")) return;
    if (text.includes("Mở trong cửa sổ")) return;

    // Bỏ qua các URL không phải nội dung
    if (SKIP_PATTERNS.some((p) => href.includes(p))) return;

    // Chỉ giữ link WordPress hoặc GitHub Pages
    if (
      !href.includes("otonaritenshi.wordpress.com") &&
      !href.includes("kyantaa.github.io")
    ) return;

    // Tránh trùng lặp
    if (!chapters.find((c) => c.url === href)) {
      chapters.push({ title: text, url: href });
    }
  });

  console.log(`  ✅ Tìm thấy ${chapters.length} chương\n`);
  return chapters;
}

// ============================================================
//  STEP 3 — Crawl nội dung 1 chương
// ============================================================
async function getChapterContent(chapterUrl) {
  const html = await fetchPage(chapterUrl);
  const $ = cheerio.load(html);

  let title = "";
  let content = "";
  let contentHtml = "";
  const images = [];

  if (chapterUrl.includes("wordpress.com")) {
    // WordPress page
    title = $("h1.entry-title").first().text().trim();
    const $entry = $(".entry-content").first();

    // Loại bỏ sharing, related posts, navigation
    $entry.find(".sharedaddy, .jp-relatedposts, .post-navigation").remove();

    // Thu thập ảnh (lấy bản chất lượng cao nhất)
    $entry.find("img").each((_, img) => {
      const src = getBestImageUrl(img, $);
      if (src && !src.includes("s.w.org") && !src.includes("wp-smiley")) {
        images.push(src);
      }
    });

    // Lấy text thuần
    content = $entry
      .find("p, blockquote, h2, h3, h4, li")
      .map((_, el) => {
        const tag = el.tagName;
        const text = $(el).text().trim();
        if (tag === "blockquote") return `\n「${text}」\n`;
        if (tag.startsWith("h")) return `\n--- ${text} ---\n`;
        return text;
      })
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    // Lấy HTML cho EPUB (giữ format)
    contentHtml = $entry.html() || "";
  } else if (
    chapterUrl.includes("kyantaa.github.io")
  ) {
    // GitHub Pages
    title =
      $("h1").first().text().trim() ||
      $("title").first().text().trim() ||
      "Chapter";
    const $body = $("article, main, .content, body").first();

    $body.find("nav, header, footer, script, style").remove();

    $body.find("img").each((_, img) => {
      const src = $(img).attr("src");
      if (src) images.push(src);
    });

    content = $body
      .find("p, blockquote, h2, h3, h4, li, div")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    contentHtml = $body.html() || "";
  }

  return { title, content, contentHtml, images };
}

// ============================================================
//  STEP 4 — Lưu nội dung ra file
// ============================================================
function saveChapter(volumeName, chapterIndex, title, content) {
  const volDir = path.join(OUTPUT_DIR, sanitizeFilename(volumeName));
  ensureDir(volDir);

  const filename = `Chuong_${String(chapterIndex).padStart(2, "0")}_${sanitizeFilename(title)}.txt`;
  const filePath = path.join(volDir, filename);

  const fileContent = `${title}\n${"=".repeat(title.length)}\n\n${content}`;
  fs.writeFileSync(filePath, fileContent, "utf-8");

  return filePath;
}

// ============================================================
//  CRAWL — Chạy toàn bộ quá trình crawl
// ============================================================
async function crawlAll() {
  console.log("🚀 Bắt đầu crawl otonaritenshi.wordpress.com\n");
  ensureDir(OUTPUT_DIR);

  const volumes = await getVolumeList();
  await sleep(REQUEST_DELAY_MS);

  const allData = []; // dùng cho EPUB sau này

  for (const vol of volumes) {
    const chapters = await getChapterList(vol.url, vol.name);
    await sleep(REQUEST_DELAY_MS);

    const volChapters = [];

    for (let i = 0; i < chapters.length; i++) {
      const chap = chapters[i];
      console.log(
        `  📝 [${vol.name}] (${i + 1}/${chapters.length}) ${chap.title}`
      );

      try {
        const { title, content, contentHtml, images } =
          await getChapterContent(chap.url);

        const isIllustration = chap.title.toLowerCase().includes("illus") ||
          chap.title.toLowerCase().includes("minh họa") ||
          chap.title.toLowerCase().includes("minh hoạ");

        // Tải ảnh minh họa
        const downloadedImages = [];
        if (images.length > 0) {
          const imgDir = path.join(OUTPUT_DIR, sanitizeFilename(vol.name), "images");
          ensureDir(imgDir);

          for (let j = 0; j < images.length; j++) {
            const imgUrl = images[j];
            const ext = getImageExtension(imgUrl);
            const prefix = isIllustration ? "illu" : `ch${String(i + 1).padStart(2, "0")}`;
            const imgFilename = `${prefix}_${String(j + 1).padStart(2, "0")}${ext}`;
            const imgPath = path.join(imgDir, imgFilename);

            if (!fs.existsSync(imgPath)) {
              const ok = await downloadImage(imgUrl, imgPath);
              if (ok) {
                console.log(`      🖼️ Ảnh: ${imgFilename}`);
                downloadedImages.push({ url: imgUrl, localPath: imgPath, filename: imgFilename });
              }
              await sleep(500);
            } else {
              downloadedImages.push({ url: imgUrl, localPath: imgPath, filename: imgFilename });
            }
          }
        }

        if (content.length === 0 && downloadedImages.length === 0) {
          console.log(`    ⚠ Nội dung trống, bỏ qua.`);
          continue;
        }

        // Lưu text (nếu có nội dung text)
        if (content.length > 0) {
          const filePath = saveChapter(vol.name, i + 1, title || chap.title, content);
          console.log(`    ✅ Đã lưu: ${path.basename(filePath)}`);
        } else if (downloadedImages.length > 0) {
          console.log(`    🖼️ Trang minh họa: ${downloadedImages.length} ảnh`);
        }

        volChapters.push({
          title: title || chap.title,
          content: content,
          contentHtml: contentHtml,
          images: images,
          isIllustration: isIllustration,
        });
      } catch (err) {
        console.error(`    ❌ Lỗi: ${err.message}`);
      }

      await sleep(REQUEST_DELAY_MS);
    }

    allData.push({
      volumeName: vol.name,
      chapters: volChapters,
    });
  }

  // Lưu metadata JSON để có thể tạo EPUB sau mà không cần crawl lại
  const metaPath = path.join(OUTPUT_DIR, "metadata.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(allData, null, 2),
    "utf-8"
  );
  console.log(`\n📦 Đã lưu metadata: ${metaPath}`);

  return allData;
}

// ============================================================
//  EPUB — Tạo file EPUB
// ============================================================
async function generateEpub(allData) {
  console.log("\n📕 Đang tạo file EPUB...");

  // Chuẩn bị chapters cho epub-gen
  const epubChapters = [];

  for (const vol of allData) {
    // Thêm trang tiêu đề cho mỗi tập
    epubChapters.push({
      title: vol.volumeName,
      content: `<h1 style="text-align:center; margin-top: 40%; font-size: 2em;">${vol.volumeName}</h1>`,
    });

    for (const chap of vol.chapters) {
      // Chuyển text thuần sang HTML nếu contentHtml trống
      let html = chap.contentHtml;
      if (!html || html.trim().length === 0) {
        html = chap.content
          .split("\n\n")
          .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join("\n");
      } else {
        // Dọn dẹp HTML — xóa scripts, styles, không cần thiết
        const $ = cheerio.load(html);
        $(
          "script, style, .sharedaddy, .jp-relatedposts, .post-navigation, .wpcnt"
        ).remove();

        // Chuyển ảnh WordPress sang dạng tương đối nếu cần
        $("img").each((_, img) => {
          const src =
            $(img).attr("data-orig-file") || $(img).attr("src");
          if (src) {
            $(img).attr("src", src);
            $(img).removeAttr("data-orig-file");
            $(img).removeAttr("srcset");
            $(img).removeAttr("data-large-file");
            $(img).removeAttr("data-medium-file");
            // Giới hạn kích thước ảnh trong EPUB
            $(img).attr(
              "style",
              "max-width:100%; height:auto; display:block; margin:1em auto;"
            );
          }
        });

        html = $.html();
      }

      epubChapters.push({
        title: chap.title,
        content: html,
      });
    }
  }

  const epubOptions = {
    title: "Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken",
    author: "Saeki-san (Dịch: Kyantaa)",
    publisher: "otonaritenshi.wordpress.com",
    lang: "vi",
    tocTitle: "Mục Lục",
    ignoreFailedDownloads: true,
    verbose: false,
    fetchTimeout: 10000,
    retryTimes: 2,
    batchSize: 5,
    css: `
      body { font-family: Georgia, serif; line-height: 1.8; color: #333; padding: 0 1em; }
      h1, h2, h3 { color: #1a1a2e; margin-top: 1.5em; }
      p { text-indent: 1.5em; margin: 0.5em 0; text-align: justify; }
      blockquote { font-style: italic; margin: 1em 2em; padding-left: 1em; border-left: 3px solid #ccc; }
      img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
    `,
  };

  try {
    // epub-gen-memory: epub(options, content) — content is the SECOND argument
    const epubBuffer = await epub(epubOptions, epubChapters);
    fs.writeFileSync(EPUB_OUTPUT, epubBuffer);
    console.log(`✅ EPUB đã được tạo: ${EPUB_OUTPUT}`);
    console.log(`📖 Tổng cộng ${epubChapters.length} mục trong sách.`);
  } catch (err) {
    console.error(`❌ Lỗi tạo EPUB: ${err.message}`);
    throw err;
  }
}

// ============================================================
//  DOCX — Tạo file Word
// ============================================================
async function generateDocx(allData) {
  console.log("\n📄 Đang tạo file Word (.docx)...");

  const { Document, Paragraph, TextRun, HeadingLevel, PageBreak,
    AlignmentType, ImageRun, Packer, TableOfContents,
    SectionType, Header, Footer } = docx;

  const sections = [];

  for (const vol of allData) {
    const children = [];

    // Trang tiêu đề cho mỗi tập
    children.push(
      new Paragraph({ spacing: { before: 4000 } }),
      new Paragraph({
        children: [new TextRun({ text: vol.volumeName, bold: true, size: 56, font: "Georgia" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [new TextRun({
          text: "Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken",
          italics: true, size: 24, font: "Georgia", color: "666666",
        })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Tác giả: Saeki-san | Dịch: Kyantaa", size: 20, font: "Georgia", color: "999999" })],
        alignment: AlignmentType.CENTER,
      })
    );

    for (const chap of vol.chapters) {
      // Page break trước mỗi chương
      children.push(new Paragraph({ children: [new PageBreak()] }));

      // Tiêu đề chương
      children.push(new Paragraph({
        text: chap.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 300 },
      }));

      // Nếu là trang illustration, thêm ảnh từ local
      if (chap.isIllustration && chap.images && chap.images.length > 0) {
        // Tìm ảnh local
        const volImgDir = path.join(OUTPUT_DIR, sanitizeFilename(vol.volumeName), "images");
        if (fs.existsSync(volImgDir)) {
          const illuFiles = fs.readdirSync(volImgDir)
            .filter(f => f.startsWith("illu"))
            .sort();
          for (const imgFile of illuFiles) {
            const imgPath = path.join(volImgDir, imgFile);
            try {
              const imgData = fs.readFileSync(imgPath);
              const imgRun = new ImageRun({
                data: imgData,
                transformation: { width: 500, height: 700 },
                type: "jpg",
              });
              children.push(new Paragraph({
                children: [imgRun],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
              }));
            } catch (e) {
              // Bỏ qua ảnh lỗi
            }
          }
        }
        continue;
      }

      // Nội dung text
      if (chap.content && chap.content.length > 0) {
        const paragraphs = chap.content.split("\n\n");
        for (const para of paragraphs) {
          const trimmed = para.trim();
          if (trimmed.length === 0) continue;

          // Phát hiện blockquote
          if (trimmed.startsWith("「") || trimmed.startsWith("\n「")) {
            children.push(new Paragraph({
              children: [new TextRun({ text: trimmed, italics: true, size: 24, font: "Georgia" })],
              indent: { left: 720 },
              spacing: { before: 100, after: 100 },
            }));
          }
          // Phát hiện heading
          else if (trimmed.startsWith("---") && trimmed.endsWith("---")) {
            const headText = trimmed.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
            children.push(new Paragraph({
              text: headText,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 200 },
            }));
          }
          // Đoạn văn bình thường
          else {
            children.push(new Paragraph({
              children: [new TextRun({ text: trimmed, size: 24, font: "Georgia" })],
              spacing: { before: 80, after: 80 },
              indent: { firstLine: 480 },
            }));
          }
        }

        // Thêm ảnh trong chương (nếu có)
        if (chap.images && chap.images.length > 0) {
          const volImgDir = path.join(OUTPUT_DIR, sanitizeFilename(vol.volumeName), "images");
          if (fs.existsSync(volImgDir)) {
            const chIdx = `ch${String(vol.chapters.indexOf(chap) + 1).padStart(2, "0")}`;
            const chImgs = fs.readdirSync(volImgDir)
              .filter(f => f.startsWith(chIdx))
              .sort();
            for (const imgFile of chImgs) {
              const imgPath = path.join(volImgDir, imgFile);
              try {
                const imgData = fs.readFileSync(imgPath);
                const imgRun = new ImageRun({
                  data: imgData,
                  transformation: { width: 450, height: 600 },
                  type: "jpg",
                });
                children.push(new Paragraph({
                  children: [imgRun],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 200, after: 200 },
                }));
              } catch (e) {
                // Bỏ qua ảnh lỗi
              }
            }
          }
        }
      }
    }

    sections.push({
      properties: { type: SectionType.NEXT_PAGE },
      children: children,
    });
  }

  const doc = new Document({
    title: "Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken",
    creator: "Saeki-san (Dịch: Kyantaa)",
    description: "Light novel Thiên sứ nhà bên - Bản dịch tiếng Việt",
    sections: sections,
    styles: {
      default: {
        document: {
          run: { font: "Georgia", size: 24 },
          paragraph: { spacing: { line: 360 } },
        },
        heading1: {
          run: { font: "Georgia", size: 36, bold: true, color: "1a1a2e" },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        heading2: {
          run: { font: "Georgia", size: 28, bold: true, color: "333333" },
          paragraph: { spacing: { before: 300, after: 150 } },
        },
      },
    },
  });

  try {
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(DOCX_OUTPUT, buffer);
    console.log(`✅ DOCX đã được tạo: ${DOCX_OUTPUT}`);
    console.log(`📄 Kích thước: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    console.error(`❌ Lỗi tạo DOCX: ${err.message}`);
    throw err;
  }
}

// ============================================================
//  MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const epubOnly = args.includes("--epub-only");
  const docxOnly = args.includes("--docx-only");
  const noEpub = args.includes("--no-epub");
  const noDocx = args.includes("--no-docx");

  let allData;

  if (epubOnly || docxOnly) {
    // Chỉ tạo file từ dữ liệu đã crawl
    const metaPath = path.join(OUTPUT_DIR, "metadata.json");
    if (!fs.existsSync(metaPath)) {
      console.error(
        "❌ Không tìm thấy metadata.json. Hãy chạy crawl trước: node crawl.js"
      );
      process.exit(1);
    }
    console.log("📂 Đọc dữ liệu từ metadata.json...");
    allData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } else {
    // Crawl toàn bộ
    allData = await crawlAll();
  }

  // Tạo EPUB
  if (!noEpub && !docxOnly) {
    await generateEpub(allData);
  }

  // Tạo DOCX
  if (!noDocx && !epubOnly) {
    await generateDocx(allData);
  }

  console.log("\n🎉 Hoàn tất!");
}

main().catch((err) => {
  console.error("\n💥 Lỗi nghiêm trọng:", err.message);
  process.exit(1);
});
