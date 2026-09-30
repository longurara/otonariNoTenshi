(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HandGestures = api;
})(globalThis, function () {
  "use strict";
  const STORAGE = "tenshi-hand-camera-v1";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function preferences(value) {
    return { sensitivity: clamp(Math.round(Number(value?.sensitivity) || 3), 1, 5), amount: value?.amount === 1 ? 1 : 0.5 };
  }
  function sampleHand(points, hand = "") {
    if (!Array.isArray(points) || points.length !== 21 || points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) return null;
    const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
    const size = distance(0, 9), center = [0, 5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + points[i].x / 5, y: sum.y + points[i].y / 5 }), { x: 0, y: 0 });
    const fingers = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
    const open = fingers.filter(([base, middle, tip]) => distance(base, tip) > distance(base, middle) * 1.45 && distance(0, tip) > distance(0, middle) * 1.08).length >= 3;
    if (size < 0.035 || size > 0.65 || center.x < 0.06 || center.x > 0.94 || center.y < 0.06 || center.y > 0.94) return null;
    const pinch = { x: (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2,
      ratio: distance(4, 8) / size, usable: distance(0, 8) > size * 0.9 && distance(0, 4) > size * 0.75 };
    return { ...center, size, open, hand, pinch };
  }

  // A stable, visible hand must arm each swipe. Cooldown + re-arming prevents
  // its return movement from becoming an accidental swipe in the other direction.
  function createSwipeDetector(sensitivity = 3) {
    let trail = [], armed = false, until = 0, previous = null;
    function reset() { trail = []; armed = false; previous = null; }
    function push(sample, time) {
      if (!sample?.open || !Number.isFinite(time)) { reset(); return 0; }
      if (previous && (time <= previous.time || time - previous.time > 250 || sample.hand !== previous.hand ||
        Math.hypot(sample.x - previous.x, sample.y - previous.y) > 0.3 || sample.size / previous.size > 1.55 || sample.size / previous.size < 0.65)) reset();
      previous = { ...sample, time };
      if (time < until) { trail = []; armed = false; return 0; }
      trail.push({ ...sample, time });
      trail = trail.filter((p) => time - p.time <= 650);
      if (!armed) {
        const stable = trail.filter((p) => time - p.time <= 220);
        if (stable.length >= 3 && time - stable[0].time >= 140 &&
          Math.max(...stable.map((p) => p.y)) - Math.min(...stable.map((p) => p.y)) < 0.025 &&
          Math.max(...stable.map((p) => p.x)) - Math.min(...stable.map((p) => p.x)) < 0.035) {
          armed = true; trail = [stable[stable.length - 1]];
        }
        return 0;
      }
      const start = trail[0], dy = sample.y - start.y, dx = sample.x - start.x, elapsed = time - start.time;
      const threshold = Math.max(0.05, Math.min(0.18, sample.size * (0.85 - clamp(sensitivity, 1, 5) * 0.1)));
      if (elapsed >= 100 && elapsed <= 650 && Math.abs(dy) >= threshold && Math.abs(dy) > Math.abs(dx) * 1.6 && Math.abs(dy) / elapsed > 0.00012) {
        const direction = dy < 0 ? 1 : -1;
        until = time + 850; reset(); return direction;
      }
      return 0;
    }
    return { push, reset, setSensitivity(value) { sensitivity = clamp(value, 1, 5); reset(); } };
  }

  function createPinchDetector() {
    let previous = null, candidateAt = null, dragging = false, anchorY = 0;
    function reset() { previous = null; candidateAt = null; dragging = false; }
    function push(sample, time) {
      const idle = { pinched: false, dragging: false, delta: 0 };
      if (!sample?.pinch?.usable || !Number.isFinite(time)) { reset(); return idle; }
      if (previous && (time <= previous.time || time - previous.time > 300 || sample.hand !== previous.hand ||
        Math.hypot(sample.pinch.x - previous.pinch.x, sample.pinch.y - previous.pinch.y) > 0.18 ||
        sample.size / previous.size > 1.55 || sample.size / previous.size < 0.65)) reset();
      previous = { ...sample, time };
      // Two thresholds prevent a held pinch flickering between grab and release.
      if (sample.pinch.ratio > (candidateAt !== null ? 0.42 : 0.28)) { reset(); return idle; }
      if (candidateAt === null) {
        candidateAt = time; anchorY = sample.pinch.y;
        return { pinched: true, dragging: false, delta: 0 };
      }
      if (time - candidateAt < 60) return { pinched: true, dragging: false, delta: 0 };
      dragging = true;
      const delta = anchorY - sample.pinch.y;
      if (Math.abs(delta) < 0.004) return { pinched: true, dragging, delta: 0 };
      anchorY = sample.pinch.y;
      return { pinched: true, dragging, delta: clamp(delta, -0.12, 0.12) };
    }
    return { push, reset };
  }

  function create(options) {
    const $ = (selector) => document.querySelector(selector);
    let saved; try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch (_) {}
    let prefs = preferences(saved), swipe = createSwipeDetector(prefs.sensitivity), pinch = createPinchDetector();
    function resetGestures() { swipe.reset(); pinch.reset(); }
    let stream = null, worker = null, generation = 0, timer = null, readyTimer = null, frameTimer = null;
    let active = false, starting = false, frameBusy = false, blockedLast = false, ignoreBefore = 0, lastFeedback = 0;
    let finishReady = null;
    const dialog = document.createElement("dialog");
    dialog.id = "hand-camera-dialog"; dialog.className = "tools-dialog hand-camera-dialog";
    dialog.setAttribute("aria-labelledby", "hand-camera-title");
    dialog.innerHTML = `<div class="tools-heading"><div><span class="eyebrow">ĐỌC KHÔNG CẦN CHẠM</span><h2 id="hand-camera-title">Điều khiển bằng tay <span class="beta-badge">Beta</span></h2></div><button class="tools-close" type="button" aria-label="Đóng điều khiển bằng tay">×</button></div>
      <div class="tools-panel"><p class="tools-hint">Đặt điện thoại ổn định, đưa tay vào khung camera trước.</p>
      <p class="tools-hint"><strong>Kéo trang:</strong> chụm ngón cái và ngón trỏ, giữ chụm rồi kéo lên/xuống. Nội dung đi theo tay; mở hai ngón để thả.</p>
      <p class="tools-hint"><strong>Phất tay:</strong> mở bàn tay, giữ một nhịp rồi phất lên để cuộn xuống, phất xuống để cuộn lên.</p>
      <p class="tools-hint">Hình ảnh được xử lý ngay trên thiết bị. Camera chỉ bật khi bạn chọn bật tính năng và cấp quyền.</p>
      <label for="hand-camera-sensitivity">Độ nhạy phất tay <output id="hand-camera-sensitivity-value"></output><input id="hand-camera-sensitivity" type="range" min="1" max="5" step="1"></label>
      <label for="hand-camera-amount">Khoảng cuộn mỗi lần phất<select id="hand-camera-amount"><option value="0.5">Nửa màn hình</option><option value="1">Một màn hình</option></select></label>
      <p id="hand-camera-settings-status" class="tools-hint" role="status"></p>
      <div class="tools-actions"><button id="hand-camera-start" class="btn-primary" type="button">Bật camera · Beta</button><button id="hand-camera-settings-stop" class="btn-secondary" type="button" hidden>Tắt camera</button></div></div>`;
    const hud = document.createElement("aside");
    hud.id = "hand-camera-hud"; hud.className = "hand-camera-hud"; hud.hidden = true;
    hud.setAttribute("aria-label", "Camera điều khiển bằng tay Beta");
    hud.innerHTML = `<div class="hand-camera-hud-heading"><strong>Điều khiển bằng tay <span class="beta-badge">Beta</span></strong><button id="hand-camera-stop" type="button">Tắt camera</button></div>
      <div class="hand-camera-preview"><video id="hand-camera-video" autoplay muted playsinline aria-label="Khung camera trước để căn bàn tay"></video><canvas id="hand-camera-overlay" aria-hidden="true"></canvas></div>
      <p id="hand-camera-status" role="status" aria-live="polite"></p><div class="hand-camera-hud-actions"><button id="hand-camera-preview-toggle" type="button" aria-expanded="true">Thu gọn</button><button id="hand-camera-config" type="button">Cài đặt</button></div>`;
    document.body.append(dialog, hud);
    const video = $("#hand-camera-video"), overlay = $("#hand-camera-overlay");
    const status = $("#hand-camera-status"), settingsStatus = $("#hand-camera-settings-status");
    const startButton = $("#hand-camera-start"), settingsStop = $("#hand-camera-settings-stop");
    const sensitivity = $("#hand-camera-sensitivity"), amount = $("#hand-camera-amount");

    function setStatus(value) { if (status.textContent !== value) status.textContent = value; if (settingsStatus.textContent !== value) settingsStatus.textContent = value; }
    function refresh() {
      sensitivity.value = prefs.sensitivity; amount.value = prefs.amount;
      $("#hand-camera-sensitivity-value").textContent = ["", "Thấp", "Hơi thấp", "Vừa", "Hơi cao", "Cao"][prefs.sensitivity];
      startButton.disabled = starting || active;
      startButton.textContent = starting ? "Đang bật…" : active ? "Camera đang bật" : "Bật camera · Beta";
      settingsStop.hidden = !starting && !active;
    }
    function save() {
      prefs = preferences({ sensitivity: Number(sensitivity.value), amount: Number(amount.value) });
      swipe.setSensitivity(prefs.sensitivity); pinch.reset(); ignoreBefore = performance.now() + 300;
      try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch (_) { options.message("Không lưu được cài đặt điều khiển bằng tay."); }
      refresh();
    }
    function show() {
      options.closeSettings(); refresh();
      if (!dialog.open) dialog.showModal();
      resetGestures();
      if (!active && !starting) setStatus(options.context().view === "reader" ? "Bản Beta: hãy dùng nơi đủ sáng và để bàn tay trong khung hình." : "Mở một chương để bật điều khiển bằng tay.");
    }
    function stop(message = "Camera đã tắt.") {
      generation++; active = false; starting = false; frameBusy = false;
      clearTimeout(timer); clearTimeout(readyTimer); clearTimeout(frameTimer);
      if (finishReady) { finishReady(new Error("cancelled")); finishReady = null; }
      if (worker) { worker.terminate(); worker = null; }
      if (stream) { stream.getTracks().forEach((track) => track.stop()); stream = null; }
      video.pause(); video.srcObject = null; hud.hidden = true;
      resetGestures(); setStatus(message); refresh();
    }
    function fail(message) { stop(message); options.message(message); }
    function blocked() {
      return options.context().blocked || dialog.open || Boolean(String(window.getSelection?.() || ""));
    }
    function draw(points) {
      const width = video.videoWidth || 640, height = video.videoHeight || 480;
      if (overlay.width !== width) overlay.width = width;
      if (overlay.height !== height) overlay.height = height;
      const context = overlay.getContext("2d"); context.clearRect(0, 0, width, height);
      if (!points) return;
      const xs = points.map((p) => (1 - p.x) * width), ys = points.map((p) => p.y * height);
      context.strokeStyle = "#73e1b3"; context.lineWidth = 3;
      context.strokeRect(Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) - Math.min(...xs) + 16, Math.max(...ys) - Math.min(...ys) + 16);
      if (sampleHand(points)?.pinch.ratio < 0.42) {
        context.beginPath(); context.arc((xs[4] + xs[8]) / 2, (ys[4] + ys[8]) / 2, 9, 0, Math.PI * 2); context.stroke();
      }
    }
    function receive(data, session) {
      if (session !== generation || data.type !== "result") return;
      frameBusy = false; clearTimeout(frameTimer);
      if (!active) return;
      if (options.context().view !== "reader") { stop(); return; }
      draw(data.landmarks);
      if (blocked() || data.timestamp < ignoreBefore) {
        resetGestures(); blockedLast = true;
        setStatus("Tạm dừng khi mở bảng điều khiển hoặc chọn chữ."); return;
      }
      if (blockedLast) { resetGestures(); blockedLast = false; }
      const sample = sampleHand(data.landmarks, data.hand), drag = pinch.push(sample, data.timestamp);
      if (drag.pinched) {
        swipe.reset();
        if (drag.delta) options.drag(drag.delta);
        setStatus(drag.dragging ? "Đang giữ trang · Kéo tay ↑ / ↓ · Mở ngón để thả" : "Đã chụm ngón · Giữ chụm rồi kéo tay");
        return;
      }
      const direction = swipe.push(sample, data.timestamp);
      if (direction) {
        options.scroll(direction, prefs.amount); lastFeedback = performance.now();
        setStatus(direction > 0 ? "↓ Đã cuộn xuống" : "↑ Đã cuộn lên");
      } else if (performance.now() - lastFeedback > 1000) {
        setStatus(!sample ? "Đưa bàn tay vào khung camera." : "Chụm ngón để kéo · Mở tay và phất để cuộn");
      }
    }
    async function tick(session) {
      if (!active || session !== generation) return;
      if (options.context().view !== "reader" || document.visibilityState !== "visible") { stop(); return; }
      if (blocked()) {
        resetGestures(); blockedLast = true;
        setStatus("Tạm dừng khi mở bảng điều khiển hoặc chọn chữ.");
      } else if (video.readyState >= 2 && !frameBusy) {
        frameBusy = true;
        let bitmap;
        try {
          bitmap = await createImageBitmap(video);
          const timestamp = performance.now();
          if (!active || session !== generation || blocked()) { bitmap.close(); if (session === generation) frameBusy = false; }
          else {
            worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]);
            bitmap = null;
            frameTimer = setTimeout(() => { if (session === generation) fail("Nhận diện không phản hồi. Hãy thử bật lại camera."); }, 10000);
          }
        } catch (_) { bitmap?.close(); if (session === generation) fail("Không đọc được hình từ camera. Hãy thử lại trên Chrome hoặc Safari."); }
      }
      if (session === generation && active) timer = setTimeout(() => tick(session), 80);
    }
    async function start() {
      if (active || starting) return;
      if (options.context().view !== "reader") { setStatus("Mở một chương để bật điều khiển bằng tay."); return; }
      if (!window.isSecureContext) { setStatus("Camera cần kết nối HTTPS. Hãy mở địa chỉ HTTPS của trang."); return; }
      if (!navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
        setStatus("Trình duyệt chưa hỗ trợ tính năng này. Hãy thử Chrome hoặc Safari mới hơn."); return;
      }
      const session = ++generation; starting = true; refresh(); setStatus("Đang xin quyền camera…");
      try {
        const requested = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } });
        if (session !== generation) { requested.getTracks().forEach((track) => track.stop()); return; }
        stream = requested;
        stream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => { if (session === generation) stop("Camera đã ngắt. Bấm bật để kết nối lại."); }));
        video.srcObject = stream; video.muted = true; hud.hidden = false; hud.classList.remove("is-compact");
        $("#hand-camera-preview-toggle").textContent = "Thu gọn"; $("#hand-camera-preview-toggle").setAttribute("aria-expanded", "true");
        setStatus("Đang chuẩn bị nhận diện bàn tay…");
        await video.play();
        if (session !== generation) return;
        worker = new Worker(new URL("hand-camera-worker.js", document.baseURI), { type: "module" });
        await new Promise((resolve, reject) => {
          finishReady = (error) => { clearTimeout(readyTimer); finishReady = null; error ? reject(error) : resolve(); };
          readyTimer = setTimeout(() => finishReady?.(new Error("model")), 45000);
          worker.onmessage = ({ data }) => {
            if (session !== generation) return;
            if (data.type === "ready") finishReady?.();
            else if (data.type === "error") {
              if (finishReady) finishReady(new Error("model"));
              else fail("Không nhận diện được bàn tay. Hãy thử bật lại camera.");
            } else receive(data, session);
          };
          worker.onerror = () => {
            if (session !== generation) return;
            if (finishReady) finishReady(new Error("model"));
            else fail("Nhận diện đã dừng. Hãy thử bật lại camera.");
          };
          worker.postMessage({ type: "init" });
        });
        if (session !== generation) return;
        starting = false; active = true; blockedLast = false; resetGestures(); refresh();
        if (dialog.open) dialog.close();
        setStatus("Đưa bàn tay vào khung camera."); tick(session);
      } catch (error) {
        if (session !== generation) return;
        const message = error.name === "NotAllowedError" ? "Chưa được cấp quyền camera. Cho phép camera trong trình duyệt rồi thử lại."
          : error.name === "NotFoundError" ? "Không tìm thấy camera trên thiết bị."
          : error.name === "NotReadableError" ? "Camera đang bận hoặc không mở được. Đóng ứng dụng đang dùng camera rồi thử lại."
          : "Không bật được nhận diện. Kiểm tra kết nối lần đầu hoặc thử Chrome/Safari mới hơn.";
        stop(message); if (!dialog.open) show(); setStatus(message);
      }
    }
    dialog.querySelector(".tools-close").onclick = () => dialog.close();
    dialog.addEventListener("close", () => { if (starting) stop("Đã hủy bật camera."); });
    startButton.onclick = start;
    $("#hand-camera-stop").onclick = () => stop(); settingsStop.onclick = () => stop();
    $("#hand-camera-config").onclick = show;
    $("#btn-hand-camera-settings").onclick = show;
    $("#hand-camera-preview-toggle").onclick = () => {
      const compact = hud.classList.toggle("is-compact");
      $("#hand-camera-preview-toggle").textContent = compact ? "Hiện camera" : "Thu gọn";
      $("#hand-camera-preview-toggle").setAttribute("aria-expanded", String(!compact));
    };
    sensitivity.oninput = save; amount.onchange = save;
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-hand-camera]");
      if (!button) return;
      // Transfer focus from the utilities dialog so it cannot keep gestures paused.
      button.closest("dialog")?.close();
      show();
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible" && (active || starting)) stop("Camera đã tắt khi chuyển ứng dụng. Bật lại để tiếp tục."); });
    window.addEventListener("pagehide", () => stop());
    window.addEventListener("orientationchange", () => { resetGestures(); ignoreBefore = performance.now() + 900; });
    refresh();
    return { onView() { resetGestures(); ignoreBefore = performance.now() + 300; if (options.context().view !== "reader") { stop(); if (dialog.open) dialog.close(); } }, isOpen: () => dialog.open };
  }
  return { preferences, sampleHand, createSwipeDetector, createPinchDetector, create };
});
