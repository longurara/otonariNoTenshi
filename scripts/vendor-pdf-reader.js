const fs = require("node:fs");
const path = require("node:path");
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(__dirname, "../public/vendor/pdfjs");
fs.mkdirSync(target, { recursive: true });
for (const name of ["pdf.mjs", "pdf.worker.mjs"]) fs.copyFileSync(path.join(source, "legacy/build", name), path.join(target, name));
for (const name of ["cmaps", "standard_fonts", "wasm"]) fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true });
fs.copyFileSync(path.join(source, "LICENSE"), path.join(target, "LICENSE.txt"));
fs.writeFileSync(path.join(target, "NOTICE.txt"), "Mozilla PDF.js 6.3.289 — Apache License 2.0\nSource: https://www.npmjs.com/package/pdfjs-dist/v/6.3.289\nRuntime is loaded locally only when importing PDF.\n");
