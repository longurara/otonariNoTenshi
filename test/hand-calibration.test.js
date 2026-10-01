const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCollector } = require("../public/hand-calibration");

const sample = (ratio = 0.1, extra = {}) => ({ x: 0.5, y: 0.5, size: 0.2, hand: "Right", pinch: { usable: true, ratio, metric: "world" }, ...extra });
const accept = (_closed, _opened, { metric }) => ({ version: 2, metric, close: 0.14, release: 0.22 });
function phase(collector, ratio, start = 0, interval = 100, count = 10) {
  let result;
  for (let index = 0; index < count; index++) result = collector.push(sample(ratio), start + index * interval);
  return result;
}
function prepared(stage = "waiting", fit = accept) {
  const collector = createCollector({ fit });
  assert.equal(phase(collector, 0.1).event, "closed");
  if (stage === "open") collector.next();
  return collector;
}

test("a fit function is mandatory and next only advances the waiting stage", () => {
  assert.throws(() => createCollector(), TypeError);
  assert.throws(() => createCollector({ fit: true }), TypeError);
  const collector = createCollector({ fit: accept });
  assert.deepEqual(collector.next(), { stage: "close", event: "" });
});

test("a stable two-phase session sends metric and separate samples to fit", () => {
  const calls = [];
  const collector = createCollector({ fit(closed, opened, options) { calls.push({ closed, opened, options }); return accept(closed, opened, options); } });
  assert.deepEqual(phase(collector, 0.1), { stage: "waiting", event: "closed" });
  assert.deepEqual(collector.next(), { stage: "open", event: "" });
  const completed = phase(collector, 0.7, 1000);
  assert.equal(completed.stage, "done"); assert.equal(completed.event, "done");
  assert.deepEqual(completed.fitted, { version: 2, metric: "world", close: 0.14, release: 0.22 });
  assert.deepEqual(calls[0], { closed: Array(10).fill(0.1), opened: Array(10).fill(1), options: { metric: "world" } });
  assert.deepEqual(calls[1], { closed: Array(10).fill(0.1), opened: Array(10).fill(0.7), options: { metric: "world" } });
  assert.deepEqual(collector.push(null, 2000), { stage: "done", event: "" });
  assert.equal(collector.next().stage, "done");
});

test("waiting frames check identity but cannot count toward the open phase", () => {
  const collector = prepared();
  for (let time = 1000; time <= 1900; time += 100) assert.equal(collector.push(sample(0.7), time).stage, "waiting");
  collector.next();
  for (let time = 2000; time < 2900; time += 100) assert.equal(collector.push(sample(0.7), time).stage, "open");
  assert.equal(collector.push(sample(0.7), 2900).event, "done");
});

test("both waiting and open restart when the hand or metric changes", () => {
  for (const stage of ["waiting", "open"]) {
    for (const changed of [sample(0.7, { hand: "Left" }), sample(0.7, { pinch: { usable: true, ratio: 0.7, metric: "image3d" } })]) {
      const collector = prepared(stage);
      assert.deepEqual(collector.push(changed, 1000), { stage: "close", event: "restart" });
      // The former closed samples cannot survive the restart.
      assert.equal(collector.next().stage, "close");
      assert.equal(collector.push(sample(0.7), 1100).stage, "close");
    }
  }
});

test("missing tracking, backwards/duplicate time and long gaps restart both later stages", () => {
  for (const stage of ["waiting", "open"]) {
    for (const [value, time] of [[null, 1000], [sample(), NaN], [sample(), 800], [sample(), 900], [sample(), 1251]]) {
      const collector = prepared(stage);
      assert.deepEqual(collector.push(value, time), { stage: "close", event: "restart" });
    }
  }
});

test("center jumps and abrupt scale changes restart both later stages", () => {
  for (const stage of ["waiting", "open"]) {
    for (const changed of [sample(0.7, { x: 0.69 }), sample(0.7, { size: 0.312 }), sample(0.7, { size: 0.128 })]) {
      const collector = prepared(stage);
      assert.equal(collector.push(changed, 1000).event, "restart");
      assert.equal(collector.stage, "close");
    }
  }
});

test("a lost close phase silently clears its samples and accepts a new hand", () => {
  const collector = createCollector({ fit: accept });
  phase(collector, 0.1, 0, 100, 9);
  assert.deepEqual(collector.push(null, 900), { stage: "close", event: "" });
  for (let time = 1000; time < 1900; time += 100) assert.equal(collector.push(sample(0.1, { hand: "Left" }), time).stage, "close");
  assert.equal(collector.push(sample(0.1, { hand: "Left" }), 1900).event, "closed");
});

test("close requires both ten measurements and 900 ms, including at 60 FPS and 5 FPS", () => {
  for (const fps of [60, 5]) {
    const fitCalls = [];
    const collector = createCollector({ fit(closed, opened, options) { fitCalls.push(closed.length); return accept(closed, opened, options); } });
    let result, completedAt = null;
    for (let index = 0; index < 150; index++) {
      const time = index * 1000 / fps;
      result = collector.push(sample(), time);
      if (time < 900 || index < 9) assert.equal(result.stage, "close");
      if (result.event === "closed") { completedAt = time; break; }
    }
    assert.notEqual(completedAt, null); assert.ok(completedAt >= 900);
    assert.ok(fitCalls[0] >= 10 && fitCalls[0] <= 40);
    if (fps === 5) assert.equal(completedAt, 1800);
  }
});

test("a slow cadence outside the freshness gap cannot accumulate a phase", () => {
  const collector = createCollector({ fit: accept });
  for (let index = 0; index < 20; index++) assert.equal(collector.push(sample(), index * 400).stage, "close");
});

test("closed fingers must fit before allowing the second step", () => {
  let calls = 0;
  const collector = createCollector({ fit(closed) { calls++; assert.ok(closed.every((ratio) => ratio === 0.24)); return null; } });
  assert.deepEqual(phase(collector, 0.24), { stage: "close", event: "" });
  assert.equal(calls, 1); assert.equal(collector.next().stage, "close");
});

test("ratios outside the current pose clear that phase rather than counting toward it", () => {
  const closeCollector = createCollector({ fit: accept });
  phase(closeCollector, 0.1, 0, 100, 9);
  assert.equal(closeCollector.push(sample(0.26), 900).stage, "close");
  assert.equal(phase(closeCollector, 0.1, 1000, 100, 9).stage, "close");
  assert.equal(closeCollector.push(sample(0.1), 1900).event, "closed");
  const openCollector = prepared("open");
  phase(openCollector, 0.7, 1000, 100, 9);
  assert.deepEqual(openCollector.push(sample(0.34), 1900), { stage: "open", event: "" });
  assert.equal(phase(openCollector, 0.7, 2000).event, "done");
});

test("noisy phases do not fit and old noise drops out of the rolling two-second window", () => {
  let calls = 0;
  const collector = createCollector({ fit(closed, opened, options) { calls++; return accept(closed, opened, options); } });
  for (let index = 0; index < 12; index++) assert.equal(collector.push(sample(index % 2 ? 0.24 : 0.1), index * 100).stage, "close");
  assert.equal(calls, 0);
  let result;
  for (let time = 1200; time <= 3300; time += 100) {
    result = collector.push(sample(0.1), time);
    if (result.event === "closed") break;
  }
  assert.equal(result.event, "closed"); assert.equal(calls, 1);
});

test("inseparable closed/open phases rejected by fit restart the entire session", () => {
  let calls = 0;
  const collector = createCollector({ fit(closed, opened, options) { calls++; return opened[0] - closed[0] >= 0.18 ? accept(closed, opened, options) : null; } });
  assert.equal(phase(collector, 0.18).event, "closed"); collector.next();
  assert.deepEqual(phase(collector, 0.35, 1000), { stage: "close", event: "restart" });
  assert.equal(calls, 2);
  assert.equal(collector.next().stage, "close");
});

test("impossible or unusable samples cannot complete calibration", () => {
  const invalid = [sample(NaN), sample(-0.01), sample(2.01), sample(0.1, { hand: "" }), sample(0.1, { x: Infinity }), sample(0.1, { x: -0.1 }), sample(0.1, { size: 0 }), sample(0.1, { size: -1 }), sample(0.1, { pinch: { usable: false, ratio: 0.1, metric: "world" } }), sample(0.1, { pinch: { usable: true, ratio: 0.1, metric: "" } })];
  for (const value of invalid) {
    const collector = prepared("open");
    assert.deepEqual(collector.push(value, 1000), { stage: "close", event: "restart" });
  }
});
