// Camera frames stay in this worker and are closed immediately after inference.
import { FilesetResolver, HandLandmarker } from "./vendor/mediapipe/vision_bundle.mjs";

let detector;
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
      self.postMessage({ type: "ready" });
    } catch (_) { self.postMessage({ type: "error", stage: "init" }); }
    return;
  }
  if (data.type === "frame") {
    try {
      if (!detector) throw new Error("Detector not ready");
      const result = detector.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: "result", timestamp: data.timestamp, landmarks: result.landmarks[0] || null,
        hand: result.handedness[0]?.[0]?.categoryName || "" });
    } catch (_) { self.postMessage({ type: "error", stage: "frame" }); }
    finally { data.bitmap.close(); }
  }
};
