// Keep the browser dependency local so importing also works offline.
const fs = require("node:fs");
const path = require("node:path");
const source = path.dirname(require.resolve("jszip/package.json"));
const target = path.join(__dirname, "../public/vendor");
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(source, "dist/jszip.min.js"), path.join(target, "jszip.min.js"));
const license = fs.readFileSync(path.join(source, "LICENSE.markdown"), "utf8");
fs.writeFileSync(path.join(target, "jszip-LICENSE.txt"), license.split("GPL version 3")[0]);
