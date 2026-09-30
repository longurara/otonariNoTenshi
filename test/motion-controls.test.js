const { test } = require("node:test");
const assert = require("node:assert/strict");
const { preferences, axes, createTiltDetector, createShakeDetector, shakeAction, createAutoScroll } = require("../public/motion-controls");
function hold(d, beta = 40, gamma = 0, start = 0, angle = 0) { let result; for (let t = start; t <= start + 800; t += 100) result = d.push(beta, gamma, angle, t); return result; }
test("calibration ignores hand tremor, scrolling returns to zero, and off never moves", () => {
  const d = createTiltDetector(); assert.equal(hold(d).calibrating, false);
  assert.ok(d.push(65, 0, 0, 1000).velocity > 0);
  assert.ok(d.push(15, 0, 0, 1500).velocity < 0);
  hold(d, 40, 0, 1600); assert.equal(d.push(40, 0, 0, 2500).velocity, 0);
  d.configure({ mode: "off" }); hold(d); const result = d.push(65, 40, 0, 1000); assert.equal(result.velocity, 0); assert.equal(result.page, 0);
  assert.equal(d.push(null, 0, 0, 1100).calibrating, true);
});
test("tilt paging requires return to neutral before the next page and tracking gaps recalibrate", () => {
  const d = createTiltDetector({ mode: "page", sensitivity: 5 }); hold(d);
  assert.equal(d.push(40, 40, 0, 1000).page, 1);
  for (let t = 1100; t <= 1500; t += 100) assert.equal(d.push(40, 40, 0, t).page, 0);
  hold(d, 40, 0, 1600); assert.equal(d.push(40, -40, 0, 2600).page, -1);
  assert.equal(d.push(40, -40, 0, 4000).calibrating, true);
});
test("screen rotation maps the tilt axes and face-down pauses once after a stable hold", () => {
  const rotated = axes(40, 10, 90); assert.ok(Math.abs(rotated.pitch - 10) < 1e-8); assert.ok(Math.abs(rotated.roll + 40) < 1e-8);
  const d = createTiltDetector(); hold(d);
  let pauses = 0;
  for (let t = 900; t <= 2600; t += 100) if (d.push(180, 0, 0, t).pause) pauses++;
  assert.equal(pauses, 1); assert.equal(d.push(40, 0, 0, 2700).pause, false);
});
test("a shake needs three alternating peaks; jitter, a single bump, and cooldown do not trigger", () => {
  const d = createShakeDetector(); const event = (x) => ({ acceleration: { x, y: 0, z: 0 } });
  assert.equal(d.push(event(2), 0), false); assert.equal(d.push(event(14), 100), false);
  assert.equal(d.push(event(-14), 240), false); assert.equal(d.push(event(14), 380), true);
  for (let t = 500; t < 2200; t += 140) assert.equal(d.push(event(t % 280 ? 14 : -14), t), false);
  d.reset(); assert.equal(d.push({ acceleration: { x: null, y: null, z: null } }, 3000), false);
});
test("timer extension wins over bookmark only while a playing timer is near expiry", () => {
  const p = preferences(); assert.equal(shakeAction(p, { playing: true, remaining: 30000 }), "extend");
  assert.equal(shakeAction(p, { playing: false, remaining: 30000 }), "bookmark");
  assert.equal(shakeAction(p, { playing: true, remaining: 0 }), "bookmark");
  assert.equal(shakeAction(preferences({ bookmark: false }), { playing: true, remaining: 300000 }), "");
});
test("auto-scroll accumulates tiny distances and stops on blocking or manual scroll", () => {
  let top = 100, next, allowed = true;
  const d = createAutoScroll({ read: () => top, write: (v) => { top = Math.round(v); }, max: () => 1000,
    requestFrame: (callback) => { next = callback; return 1; }, cancelFrame: () => { next = null; }, canScroll: () => allowed });
  const step = (time) => { const cb = next; next = null; cb(time); };
  d.set(5); for (let t = 0; t < 500; t += 16) step(t); assert.ok(top > 101);
  allowed = false; step(520); assert.equal(next, null);
  allowed = true; d.set(50); step(600); top += 100; step(620); assert.equal(next, null);
});
