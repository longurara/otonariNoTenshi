(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HandCalibration = api;
})(globalThis, function () {
  "use strict";

  function createCollector({ fit } = {}) {
    if (typeof fit !== "function") throw new TypeError("A calibration fit function is required");
    let stage = "close", samples = [], closed = [], hand = "", metric = "", previous = null;
    const result = (event = "", fitted) => ({ stage, event, ...(fitted ? { fitted } : {}) });

    function restart() {
      const interrupted = stage === "waiting" || stage === "open";
      stage = "close"; samples = []; closed = []; hand = ""; metric = ""; previous = null;
      return result(interrupted ? "restart" : "");
    }
    function usable(sample, time) {
      return sample?.pinch?.usable === true && typeof sample.hand === "string" && Boolean(sample.hand.trim()) &&
        typeof sample.pinch.metric === "string" && Boolean(sample.pinch.metric.trim()) &&
        Number.isFinite(time) && time >= 0 && Number.isFinite(sample.x) && sample.x >= 0 && sample.x <= 1 &&
        Number.isFinite(sample.y) && sample.y >= 0 && sample.y <= 1 && Number.isFinite(sample.size) && sample.size > 0 &&
        Number.isFinite(sample.pinch.ratio) && sample.pinch.ratio >= 0 && sample.pinch.ratio <= 2;
    }
    function push(sample, time) {
      if (stage === "done") return result();
      if (!usable(sample, time)) return restart();
      if (previous && (time <= previous.time || time - previous.time > 350 ||
        sample.hand !== hand || sample.pinch.metric !== metric ||
        Math.hypot(sample.x - previous.x, sample.y - previous.y) > 0.18 ||
        sample.size / previous.size > 1.55 || sample.size / previous.size < 0.65)) return restart();

      hand ||= sample.hand; metric ||= sample.pinch.metric;
      previous = { time, x: sample.x, y: sample.y, size: sample.size };
      // Waiting still checks tracking continuity, without collecting open samples.
      if (stage === "waiting") return result();

      const ratio = sample.pinch.ratio;
      if ((stage === "close" && ratio > 0.25) || (stage === "open" && ratio < 0.35)) {
        samples = []; return result();
      }
      samples.push({ ratio, time });
      samples = samples.filter((entry) => time - entry.time <= 2000);
      // Preserve the time span at high frame rates instead of keeping only the
      // newest 40 points, which could never span the required 900 ms.
      if (samples.length > 40) {
        let removeAt = 1, shortestSpan = Infinity;
        for (let index = 1; index < samples.length - 1; index++) {
          const span = samples[index + 1].time - samples[index - 1].time;
          if (span < shortestSpan) { shortestSpan = span; removeAt = index; }
        }
        samples.splice(removeAt, 1);
      }
      if (samples.length < 10 || time - samples[0].time < 900) return result();
      const ratios = samples.map((entry) => entry.ratio);
      if (Math.max(...ratios) - Math.min(...ratios) > 0.12 + 1e-9) return result();

      if (stage === "close") {
        // Reject a loose closed pose before asking the user to measure open fingers.
        if (!fit([...ratios], Array(10).fill(1), { metric })) { samples = []; return result(); }
        closed = ratios; samples = []; stage = "waiting";
        return result("closed");
      }
      const fitted = fit([...closed], ratios, { metric });
      if (!fitted) return restart();
      stage = "done"; samples = [];
      return result("done", fitted);
    }
    function next() {
      if (stage === "waiting") { stage = "open"; samples = []; }
      return result();
    }
    return { push, next, get stage() { return stage; } };
  }
  return { createCollector };
});
