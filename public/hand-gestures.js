(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HandGestures = api;
})(globalThis, function () {
  "use strict";
  const STORAGE = "tenshi-hand-camera-v1";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const PINCH_CLOSE_RATIO = 0.16, PINCH_RELEASE_RATIO = 0.24, PINCH_HOLD_MS = 160;

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
    let previous = null, candidateAt = null, closeSamples = 0, dragging = false, anchorY = 0;
    function reset() { previous = null; candidateAt = null; closeSamples = 0; dragging = false; }
    function push(sample, time) {
      const idle = { pinched: false, dragging: false, delta: 0 };
      if (!sample?.pinch?.usable || !Number.isFinite(sample.pinch.ratio) || sample.pinch.ratio < 0 || !Number.isFinite(time)) { reset(); return idle; }
      if (previous && (time <= previous.time || time - previous.time > 300 || sample.hand !== previous.hand ||
        Math.hypot(sample.pinch.x - previous.pinch.x, sample.pinch.y - previous.pinch.y) > 0.18 ||
        sample.size / previous.size > 1.55 || sample.size / previous.size < 0.65)) reset();
      previous = { ...sample, time };
      // Require close fingertips throughout confirmation. A slightly wider release
      // threshold only applies after the grab, so it cannot arm a loose pinch.
      if (sample.pinch.ratio > (dragging ? PINCH_RELEASE_RATIO : PINCH_CLOSE_RATIO)) { reset(); return idle; }
      if (candidateAt === null) {
        candidateAt = time; closeSamples = 1;
        return { pinched: true, dragging: false, delta: 0 };
      }
      if (!dragging) {
        closeSamples++;
        if (time - candidateAt < PINCH_HOLD_MS || closeSamples < 3) return { pinched: true, dragging: false, delta: 0 };
        // Start at confirmation, without scrolling movement made while closing.
        dragging = true; anchorY = sample.pinch.y;
        return { pinched: true, dragging: true, delta: 0 };
      }
      const delta = anchorY - sample.pinch.y;
      if (Math.abs(delta) < 0.004) return { pinched: true, dragging, delta: 0 };
      anchorY = sample.pinch.y;
      return { pinched: true, dragging, delta: clamp(delta, -0.12, 0.12) };
    }
    return { push, reset };
  }

  function createSmoothScroll(options) {
    let target = null, position = null, frame = null, lastTime = null, lastWritten = null;
    function cancel() {
      if (frame !== null) options.cancelFrame(frame);
      target = position = frame = lastTime = lastWritten = null;
    }
    function step(time) {
      frame = null;
      if (target === null) return;
      if (!options.canScroll() || Math.abs(options.read() - lastWritten) > 2) { cancel(); return; }
      const elapsed = lastTime === null ? 16 : clamp(time - lastTime, 1, 64);
      lastTime = time; target = clamp(target, 0, options.max());
      // Keep a fractional position so small frames survive browser pixel rounding.
      position += (target - position) * (1 - Math.exp(-elapsed / 55));
      if (Math.abs(target - position) < 0.5) position = target;
      options.write(position); lastWritten = options.read();
      if (position === target) cancel();
      else frame = options.requestFrame(step);
    }
    function add(amount) {
      if (!Number.isFinite(amount) || !amount || !options.canScroll()) return;
      const actual = options.read();
      if (options.reducedMotion()) { cancel(); options.write(clamp(actual + amount, 0, options.max())); return; }
      if (target === null || Math.abs(actual - lastWritten) > 2) {
        cancel(); target = position = lastWritten = actual;
      }
      target = clamp(target + amount, 0, options.max());
      if (frame === null) frame = options.requestFrame(step);
    }
    return { add, cancel };
  }

  function create(options) {
    const $ = (selector) => document.querySelector(selector);
    let saved; try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch (_) {}
    let prefs = preferences(saved), swipe = createSwipeDetector(prefs.sensitivity), pinch = createPinchDetector();
    function resetGestures() { swipe.reset(); pinch.reset(); options.stopDrag(); }
    let stream = null, worker = null, generation = 0, timer = null, readyTimer = null, frameTimer = null;
    let active = false, starting = false, frameBusy = false, blockedLast = false, ignoreBefore = 0, lastFeedback = 0;
    let finishReady = null;
    const desktopLayout = window.matchMedia("(min-width: 1081px)");
    const mobileDevice = Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const available = () => desktopLayout.matches && !mobileDevice;
    const sidebar = $(".reader-sidebar");
    const panel = document.createElement("section");
    panel.id = "hand-camera-panel"; panel.className = "hand-camera-panel"; panel.tabIndex = -1;
    panel.setAttribute("aria-labelledby", "hand-camera-title");
    panel.innerHTML = `<div class="hand-camera-heading"><h3 id="hand-camera-title">Điều khiển bằng tay <span class="beta-badge">Beta</span></h3><button id="hand-camera-stop" type="button" hidden>Tắt camera</button></div>
      <div class="hand-camera-preview" hidden><video id="hand-camera-video" autoplay muted playsinline aria-label="Khung webcam để căn bàn tay"></video><canvas id="hand-camera-overlay" aria-hidden="true"></canvas></div>
      <p id="hand-camera-status" role="status" aria-live="polite"></p>
      <button id="hand-camera-start" class="btn-primary" type="button">Bật camera</button>
      <button id="hand-camera-preview-toggle" type="button" aria-expanded="true" aria-controls="hand-camera-video" hidden>Thu gọn camera</button>
      <details id="hand-camera-config"><summary>Cài đặt &amp; hướng dẫn</summary><div class="hand-camera-settings">
      <p>Đặt máy ổn định, đưa tay vào khung webcam.</p>
      <p><strong>Kéo trang:</strong> chụm sát đầu ngón cái và ngón trỏ, giữ một nhịp đến khi hiện vòng tròn xanh rồi kéo lên/xuống. Mở hai ngón để thả.</p>
      <p><strong>Phất tay:</strong> mở bàn tay, giữ một nhịp rồi phất lên để cuộn xuống, phất xuống để cuộn lên.</p>
      <label for="hand-camera-sensitivity">Độ nhạy phất tay <output id="hand-camera-sensitivity-value"></output><input id="hand-camera-sensitivity" type="range" min="1" max="5" step="1"></label>
      <label for="hand-camera-amount">Khoảng cuộn<select id="hand-camera-amount"><option value="0.5">Nửa màn hình</option><option value="1">Một màn hình</option></select></label>
      <p>Hình ảnh xử lý ngay trên máy, không lưu hoặc gửi đi. Bản Beta chỉ hỗ trợ máy tính.</p></div></details>`;
    sidebar.querySelector(".reader-side-progress").after(panel);
    const video = $("#hand-camera-video"), overlay = $("#hand-camera-overlay");
    const status = $("#hand-camera-status"), settings = $("#hand-camera-config"), preview = panel.querySelector(".hand-camera-preview");
    const startButton = $("#hand-camera-start"), stopButton = $("#hand-camera-stop"), previewToggle = $("#hand-camera-preview-toggle");
    const sensitivity = $("#hand-camera-sensitivity"), amount = $("#hand-camera-amount");

    function setStatus(value) { if (status.textContent !== value) status.textContent = value; }
    function refresh() {
      const supported = available();
      panel.hidden = !supported;
      $("#hand-camera-entry").hidden = !supported;
      document.querySelectorAll("[data-hand-camera]").forEach((button) => { button.hidden = !supported; });
      sensitivity.value = prefs.sensitivity; amount.value = prefs.amount;
      $("#hand-camera-sensitivity-value").textContent = ["", "Thấp", "Hơi thấp", "Vừa", "Hơi cao", "Cao"][prefs.sensitivity];
      startButton.disabled = starting || active;
      startButton.hidden = active;
      startButton.textContent = starting ? "Đang bật…" : "Bật camera";
      stopButton.hidden = !starting && !active;
      preview.hidden = !stream;
      previewToggle.hidden = !stream;
    }
    function save() {
      prefs = preferences({ sensitivity: Number(sensitivity.value), amount: Number(amount.value) });
      swipe.setSensitivity(prefs.sensitivity); pinch.reset(); ignoreBefore = performance.now() + 300;
      try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch (_) { options.message("Không lưu được cài đặt điều khiển bằng tay."); }
      refresh();
    }
    function show() {
      if (!available()) { options.message("Điều khiển bằng tay Beta chỉ hỗ trợ máy tính có thanh bên trái."); return; }
      if (options.context().view !== "reader") { options.message("Mở một chương để dùng điều khiển bằng tay ở thanh bên trái."); return; }
      options.closeSettings(); refresh();
      resetGestures();
      sidebar.scrollTop += panel.getBoundingClientRect().top - sidebar.getBoundingClientRect().top - 12;
      panel.focus({ preventScroll: true });
    }
    function stop(message = "Camera đã tắt.") {
      generation++; active = false; starting = false; frameBusy = false;
      clearTimeout(timer); clearTimeout(readyTimer); clearTimeout(frameTimer);
      if (finishReady) { finishReady(new Error("cancelled")); finishReady = null; }
      if (worker) { worker.terminate(); worker = null; }
      if (stream) { stream.getTracks().forEach((track) => track.stop()); stream = null; }
      video.pause(); video.srcObject = null;
      resetGestures(); setStatus(message); refresh();
    }
    function fail(message) { stop(message); options.message(message); }
    function blocked() {
      return options.context().blocked || settings.open || Boolean(String(window.getSelection?.() || ""));
    }
    function draw(points, grabbing = false) {
      const width = video.videoWidth || 640, height = video.videoHeight || 480;
      if (overlay.width !== width) overlay.width = width;
      if (overlay.height !== height) overlay.height = height;
      const context = overlay.getContext("2d"); context.clearRect(0, 0, width, height);
      if (!points) return;
      const xs = points.map((p) => (1 - p.x) * width), ys = points.map((p) => p.y * height);
      context.strokeStyle = "#73e1b3"; context.lineWidth = 3;
      context.strokeRect(Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) - Math.min(...xs) + 16, Math.max(...ys) - Math.min(...ys) + 16);
      if (grabbing) {
        context.beginPath(); context.arc((xs[4] + xs[8]) / 2, (ys[4] + ys[8]) / 2, 9, 0, Math.PI * 2); context.stroke();
      }
    }
    function receive(data, session) {
      if (session !== generation || data.type !== "result") return;
      frameBusy = false; clearTimeout(frameTimer);
      if (!active) return;
      if (options.context().view !== "reader") { stop(); return; }
      if (blocked() || data.timestamp < ignoreBefore) {
        draw(data.landmarks);
        resetGestures(); blockedLast = true;
        setStatus("Tạm dừng khi mở bảng điều khiển hoặc chọn chữ."); return;
      }
      if (blockedLast) { resetGestures(); blockedLast = false; }
      const sample = sampleHand(data.landmarks, data.hand), drag = pinch.push(sample, data.timestamp);
      if (!drag.dragging) options.stopDrag();
      draw(data.landmarks, drag.dragging);
      if (drag.pinched) {
        swipe.reset(); lastFeedback = -Infinity;
        if (drag.delta) options.drag(drag.delta);
        setStatus(drag.dragging ? "Đang giữ trang · Kéo tay ↑ / ↓ · Mở ngón để thả" : "Chụm sát hai đầu ngón và giữ một nhịp…");
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
      if (!available()) { setStatus("Điều khiển bằng tay Beta chỉ hỗ trợ máy tính có thanh bên trái."); return; }
      if (options.context().view !== "reader") { setStatus("Mở một chương để bật điều khiển bằng tay."); return; }
      if (!window.isSecureContext) { setStatus("Camera cần kết nối HTTPS. Hãy mở địa chỉ HTTPS của trang."); return; }
      if (!navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
        setStatus("Trình duyệt chưa hỗ trợ tính năng này. Hãy thử Chrome hoặc Edge mới hơn."); return;
      }
      const session = ++generation; starting = true; refresh(); setStatus("Đang xin quyền camera…");
      try {
        const requested = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } });
        if (session !== generation) { requested.getTracks().forEach((track) => track.stop()); return; }
        stream = requested;
        stream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => { if (session === generation) stop("Camera đã ngắt. Bấm bật để kết nối lại."); }));
        video.srcObject = stream; video.muted = true; panel.classList.remove("is-compact");
        previewToggle.textContent = "Thu gọn camera"; previewToggle.setAttribute("aria-expanded", "true");
        refresh();
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
        settings.open = false;
        setStatus("Đưa bàn tay vào khung camera."); tick(session);
      } catch (error) {
        if (session !== generation) return;
        const message = error.name === "NotAllowedError" ? "Chưa được cấp quyền camera. Cho phép camera trong trình duyệt rồi thử lại."
          : error.name === "NotFoundError" ? "Không tìm thấy camera trên thiết bị."
          : error.name === "NotReadableError" ? "Camera đang bận hoặc không mở được. Đóng ứng dụng đang dùng camera rồi thử lại."
          : "Không bật được nhận diện. Kiểm tra kết nối lần đầu hoặc thử Chrome/Edge mới hơn.";
        stop(message);
      }
    }
    startButton.onclick = start;
    stopButton.onclick = () => stop();
    $("#btn-hand-camera-settings").onclick = show;
    previewToggle.onclick = () => {
      const compact = panel.classList.toggle("is-compact");
      previewToggle.textContent = compact ? "Hiện camera" : "Thu gọn camera";
      previewToggle.setAttribute("aria-expanded", String(!compact));
    };
    settings.addEventListener("toggle", () => { resetGestures(); ignoreBefore = performance.now() + 300; });
    sensitivity.oninput = save; amount.onchange = save;
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-hand-camera]");
      if (!button) return;
      button.closest("dialog")?.close();
      show();
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible" && (active || starting)) stop("Camera đã tắt khi chuyển ứng dụng. Bật lại để tiếp tục."); });
    window.addEventListener("pagehide", () => stop());
    window.addEventListener("orientationchange", () => { resetGestures(); ignoreBefore = performance.now() + 900; });
    function manualScroll() { if (active) { resetGestures(); ignoreBefore = performance.now() + 400; } }
    window.addEventListener("wheel", manualScroll, { passive: true });
    document.addEventListener("pointerdown", manualScroll, { passive: true });
    document.addEventListener("keydown", (event) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) manualScroll(); });
    desktopLayout.addEventListener("change", () => {
      if (!available() && (active || starting)) stop("Camera đã tắt khi chuyển sang giao diện nhỏ.");
      refresh();
    });
    setStatus("Chụm ngón để kéo trang, hoặc mở tay và phất để cuộn.");
    refresh();
    return { onView() { resetGestures(); ignoreBefore = performance.now() + 300; if (options.context().view !== "reader") { stop(); settings.open = false; } refresh(); }, isOpen: () => options.context().view === "reader" && !panel.hidden && settings.open, isBlocked: blocked };
  }
  return { preferences, sampleHand, createSwipeDetector, createPinchDetector, createSmoothScroll, create };
});
