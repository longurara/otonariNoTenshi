// Copy the pinned browser runtime. The checked-in hand model is downloaded
// separately from the official MediaPipe model catalog and verified here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const source = path.dirname(require.resolve("@mediapipe/tasks-vision"));
const target = path.join(__dirname, "../public/vendor/mediapipe");
fs.mkdirSync(path.join(target, "wasm"), { recursive: true });
fs.copyFileSync(path.join(source, "vision_bundle.mjs"), path.join(target, "vision_bundle.mjs"));
for (const name of ["vision_wasm_module_internal.js", "vision_wasm_module_internal.wasm"]) {
  fs.copyFileSync(path.join(source, "wasm", name), path.join(target, "wasm", name));
}
const model = fs.readFileSync(path.join(target, "hand_landmarker.task"));
const hash = crypto.createHash("sha256").update(model).digest("hex");
if (hash !== "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1") throw new Error("Unexpected MediaPipe hand model checksum");
fs.writeFileSync(path.join(target, "NOTICE.txt"), [
  "MediaPipe Tasks Vision 1.0.1 and Hand Landmarker model — Google LLC",
  "License: Apache License 2.0 (see LICENSE.txt)",
  "Runtime source: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1",
  "Model source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  `Model SHA-256: ${hash}`,
  "Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf",
  ""
].join("\n"));
