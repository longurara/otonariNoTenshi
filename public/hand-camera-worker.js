// Camera frames stay in this worker and are closed immediately after inference.
import { FilesetResolver, HandLandmarker } from "./vendor/mediapipe/vision_bundle.mjs";

let detector;
let lastVideoTimestamp = -Infinity;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const canvas = new OffscreenCanvas(640, 480);
      const files = await FilesetResolver.forVisionTasks(new URL("./vendor/mediapipe/wasm", self.location.href).href, true);
      detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL("./vendor/mediapipe/hand_landmarker.task", self.location.href).href, delegate: "CPU" },
        canvas, runningMode: "VIDEO", numHands: 1,
        minHandDetectionConfidence: 0.65, minHandPresenceConfidence: 0.65, minTrackingConfidence: 0.65
      });
      lastVideoTimestamp = -Infinity;
      self.postMessage({ type: "ready" });
    } catch (_) { self.postMessage({ type: "error", stage: "init" }); }
    return;
  }
  if (data.type === "frame") {
    const bitmap = data.bitmap;
    const metadata = { frameId: data.frameId, timestamp: data.timestamp, capturedTimestamp: data.timestamp, width: 0, height: 0 };
    try {
      metadata.width = bitmap?.width || 0;
      metadata.height = bitmap?.height || 0;
      if (!detector) throw new Error("Detector not ready");
      if (!Number.isFinite(data.timestamp) || data.timestamp < 0) throw new Error("Invalid capture timestamp");
      // VIDEO mode needs strictly increasing inference times. Keep the original
      // capture time in the result so the caller can reject stale frames.
      lastVideoTimestamp = Math.max(data.timestamp, lastVideoTimestamp + 1);
      const result = detector.detectForVideo(bitmap, lastVideoTimestamp);
      self.postMessage({ type: "result", ...metadata, landmarks: result.landmarks?.[0] || null,
        worldLandmarks: result.worldLandmarks?.[0] || null, hand: result.handedness?.[0]?.[0]?.categoryName || "" });
    } catch (_) { self.postMessage({ type: "error", stage: "frame", ...metadata }); }
    finally { try { bitmap?.close?.(); } catch (_) {} }
  }
};
