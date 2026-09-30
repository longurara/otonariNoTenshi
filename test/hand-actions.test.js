const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sampleHand, preferences, createSwipeDetector, createPinchDetector, fitPinchCalibration, createPoseDetector, autoScrollSpeed, createPointer } = require("../public/hand-gestures");
const sample = (extra = {}) => ({ x: .5, y: .5, size: .2, hand: "Right", open: true, ...extra });
test("horizontal waves need a stable hand and do not accept vertical waves", () => {
  const d = createSwipeDetector(3, "x"); for (const time of [0, 80, 160]) d.push(sample(), time);
  assert.equal(d.push(sample({ x: .36 }), 320), 1);
  d.reset(); for (const time of [1400, 1480, 1560]) d.push(sample(), time);
  assert.equal(d.push(sample({ y: .35 }), 1720), 0);
});
test("personal calibration rejects shaky or indistinct poses and remains strict", () => {
  const fitted = fitPinchCalibration(Array(12).fill(.06), Array(12).fill(.6));
  assert.ok(Math.abs(fitted.close - .1) < 1e-8); assert.ok(fitted.release > fitted.close);
  assert.equal(fitPinchCalibration(Array(12).fill(.3), Array(12).fill(.6)), null);
  assert.equal(fitPinchCalibration(Array(12).fill(.1), Array(12).fill(.2)), null);
  assert.equal(preferences({ calibration: { close: .7, release: .9 } }).calibration, null);
  const d = createPinchDetector(fitted); const p = sample({ pinch: { x: .5, y: .5, ratio: .13, usable: true } });
  assert.equal(d.push(p, 0).pinched, false); d.calibrate(null); assert.equal(d.push(p, 80).pinched, true);
});
test("thumbs-up, fist, open hand and index pointer are distinguishable in landmarks", () => {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .6 })); points[0] = { x: .5, y: .8 };
  for (const [base, middle, tip, x] of [[5, 6, 8, .4], [9, 10, 12, .5], [13, 14, 16, .6], [17, 18, 20, .7]]) {
    points[base] = { x, y: .6 }; points[middle] = { x, y: .5 }; points[tip] = { x, y: .64 };
  }
  points[2] = { x: .45, y: .58 }; points[3] = { x: .45, y: .45 }; points[4] = { x: .45, y: .25 };
  assert.equal(sampleHand(points).thumbUp, true); assert.equal(sampleHand(points).fist, false);
  points[4] = { x: .45, y: .63 }; assert.equal(sampleHand(points).fist, true);
  points[8] = { x: .4, y: .3 }; assert.equal(sampleHand(points).pointing, true);
  for (const tip of [12, 16, 20]) points[tip] = { ...points[tip], y: .3 };
  assert.equal(sampleHand(points).open, true); assert.equal(sampleHand(points).pointing, false);
});
test("held poses trigger once, reject moving hands and can re-arm after release", () => {
  const d = createPoseDetector(); let events = [];
  for (let t = 0; t < 3000; t += 80) { const event = d.push(sample({ open: false, thumbUp: true }), t); if (event) events.push(event); }
  assert.deepEqual(events, ["bookmark"]); d.push(null, 3100);
  for (let t = 3200; t < 4100; t += 80) { const event = d.push(sample({ open: false, fist: true }), t); if (event) events.push(event); }
  assert.deepEqual(events, ["bookmark", "pause"]);
  d.reset(); for (let t = 0; t < 1500; t += 80) assert.equal(d.push(sample({ thumbUp: true, x: .2 + t / 4000 }), t), "");
});
test("auto-scroll has a neutral zone, signed capped speed and stops when the hand closes", () => {
  assert.equal(autoScrollSpeed(sample({ y: .54 })), 0);
  assert.equal(autoScrollSpeed(sample({ y: .9 }), 300), 300);
  assert.equal(autoScrollSpeed(sample({ y: .1 }), 300), -300);
  assert.equal(autoScrollSpeed(sample({ y: .8, open: false })), 0);
});
test("virtual pointer requires dwell and confirms only one click per held pinch", () => {
  let clicks = 0, shown = null; const target = {};
  const d = createPointer({ width: () => 1000, height: () => 800, target: () => target, render: (p) => { shown = p; }, click: () => clicks++ });
  const p = sample({ pointing: true, pointer: { x: .6, y: .4 } });
  d.push(p, { pinched: false }, 0); assert.ok(shown.x < 500);
  d.push(p, { pinched: true, dragging: true }, 200); assert.equal(clicks, 0);
  d.push(p, { pinched: false }, 300); d.push(p, { pinched: true, dragging: true }, 600); assert.equal(clicks, 1);
  d.push(p, { pinched: true, dragging: true }, 1000); assert.equal(clicks, 1);
  d.push(null, { pinched: false }, 1100); assert.equal(shown, null);
});
