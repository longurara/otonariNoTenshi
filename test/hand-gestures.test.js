const { test } = require("node:test");
const assert = require("node:assert/strict");
const { preferences, sampleHand, createSwipeDetector, createPinchDetector } = require("../public/hand-gestures");

const hand = (x = 0.5, y = 0.5, extra = {}) => ({ x, y, size: 0.2, open: true, hand: "Right", ...extra });
function hold(detector, time = 0, sample = hand()) {
  for (const offset of [0, 80, 160]) assert.equal(detector.push(sample, time + offset), 0);
}

test("a held open hand followed by an upward/downward swipe scrolls in the requested direction", () => {
  for (const [dy, expected] of [[-0.14, 1], [0.14, -1]]) {
    const detector = createSwipeDetector();
    hold(detector);
    assert.equal(detector.push(hand(0.5, 0.5 + dy / 2), 240), 0);
    assert.equal(detector.push(hand(0.5, 0.5 + dy), 320), expected);
  }
});

test("jitter, horizontal motion and motion before holding the hand do not scroll", () => {
  const detector = createSwipeDetector();
  assert.equal(detector.push(hand(0.5, 0.7), 0), 0);
  assert.equal(detector.push(hand(0.5, 0.5), 80), 0);
  assert.equal(detector.push(hand(0.5, 0.3), 160), 0);
  detector.reset(); hold(detector, 300);
  for (let time = 540; time < 2000; time += 80) {
    assert.equal(detector.push(hand(0.5 + Math.sin(time) * 0.008, 0.5 + Math.cos(time) * 0.008), time), 0);
  }
  detector.reset(); hold(detector, 2200);
  assert.equal(detector.push(hand(0.63, 0.55), 2440), 0);
  assert.equal(detector.push(hand(0.75, 0.6), 2520), 0);
});

test("a return movement is ignored until cooldown and a new stable hand", () => {
  const detector = createSwipeDetector(); hold(detector);
  assert.equal(detector.push(hand(0.5, 0.36), 320), 1);
  for (let time = 400; time < 1160; time += 80) assert.equal(detector.push(hand(0.5, 0.6), time), 0);
  hold(detector, 1200);
  assert.equal(detector.push(hand(0.5, 0.64), 1520), -1);
});

test("a hand held for several seconds remains ready to swipe", () => {
  const detector = createSwipeDetector();
  for (let time = 0; time <= 4000; time += 80) assert.equal(detector.push(hand(), time), 0);
  assert.equal(detector.push(hand(0.5, 0.64), 4080), -1);
});

test("lost/closed hands, tracking gaps and changing hands cancel a pending gesture", () => {
  for (const [sample, time] of [[null, 240], [hand(0.5, 0.5, { open: false }), 240], [hand(), 500], [hand(0.5, 0.36, { hand: "Left" }), 240]]) {
    const detector = createSwipeDetector(); hold(detector);
    assert.equal(detector.push(sample, time), 0);
    assert.equal(detector.push(hand(0.5, 0.36), time + 80), 0);
  }
});

test("higher sensitivity accepts a smaller swipe and preferences reject invalid values", () => {
  const low = createSwipeDetector(1), high = createSwipeDetector(5);
  hold(low); hold(high);
  assert.equal(low.push(hand(0.5, 0.42), 320), 0);
  assert.equal(high.push(hand(0.5, 0.42), 320), 1);
  assert.deepEqual(preferences({ sensitivity: 99, amount: 1 }), { sensitivity: 5, amount: 1 });
  assert.deepEqual(preferences({ sensitivity: "bad", amount: 9 }), { sensitivity: 3, amount: 0.5 });
});

test("only usable landmarks and an open palm can arm gestures", () => {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
  points[0] = { x: 0.5, y: 0.8 };
  for (const [base, middle, tip, x] of [[5, 6, 8, 0.4], [9, 10, 12, 0.5], [13, 14, 16, 0.6], [17, 18, 20, 0.7]]) {
    points[base] = { x, y: 0.6 }; points[middle] = { x, y: 0.5 }; points[tip] = { x, y: 0.3 };
  }
  assert.equal(sampleHand(points, "Right").open, true);
  const closed = points.map((p, i) => [8, 12, 16, 20].includes(i) ? { ...p, y: 0.64 } : p);
  assert.equal(sampleHand(closed).open, false);
  assert.equal(sampleHand(points.slice(1)), null);
  assert.equal(sampleHand(points.map((p) => ({ ...p, x: NaN }))), null);
});

const pinched = (y = 0.5, ratio = 0.1, extra = {}) => hand(0.5, y, { pinch: { x: 0.5, y, ratio, usable: true }, ...extra });
test("pinching grabs at the current position, drags both ways, and opening releases", () => {
  const detector = createPinchDetector();
  assert.deepEqual(detector.push(pinched(), 0), { pinched: true, dragging: false, delta: 0 });
  assert.ok(Math.abs(detector.push(pinched(0.45), 80).delta - 0.05) < 1e-9);
  assert.ok(Math.abs(detector.push(pinched(0.55), 160).delta + 0.1) < 1e-9);
  assert.deepEqual(detector.push(pinched(0.7, 0.6), 240), { pinched: false, dragging: false, delta: 0 });
  assert.equal(detector.push(pinched(0.8), 320).delta, 0);
  assert.equal(detector.push(pinched(0.8), 400).delta, 0);
});

test("a held pinch tolerates distance jitter while finger movement below the dead zone does not scroll", () => {
  const detector = createPinchDetector();
  assert.equal(detector.push(pinched(0.5, 0.35), 0).pinched, false);
  detector.push(pinched(0.5, 0.2), 80);
  const jitter = detector.push(pinched(0.502, 0.35), 160);
  assert.equal(jitter.dragging, true); assert.equal(jitter.delta, 0);
  assert.ok(detector.push(pinched(0.49, 0.35), 240).delta > 0);
});

test("losing pinch tracking or swapping hands re-grabs without a scroll jump", () => {
  for (const [sample, time] of [[null, 160], [pinched(0.5, 0.1, { hand: "Left" }), 160], [pinched(), 600], [pinched(0.8), 160]]) {
    const detector = createPinchDetector(); detector.push(pinched(), 0); detector.push(pinched(), 80);
    assert.equal(detector.push(sample, time).delta, 0);
    detector.reset(); assert.equal(detector.push(pinched(0.8), time + 80).delta, 0);
  }
});
