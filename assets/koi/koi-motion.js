// koi-motion: a smooth random swimming path for one koi.
//
// The model joins five known parts. docs/motion.md gives the sources.
// 1. Turn rate: an Ornstein-Uhlenbeck process (a random walk that is pulled back to
//    zero), the "persistent turning walker" model of fish paths (Gautrais 2009).
// 2. Meander: two slow sine waves with unrelated periods per koi, so each koi
//    has its own curve style and the sum does not repeat.
// 3. Steering: wall avoidance with a look-ahead point and seek toward food
//    (Reynolds 1999). All steering goes into the turn rate, never into the position.
// 4. A second-order filter on the turn rate, so the heading and its first two
//    derivatives stay continuous. The path has no corners and no jerks.
// 5. Burst-and-coast speed: short strokes and long glides, as koi swim (Wu 2007).
// A slow divergence-free current (curl noise, Bridson 2007) adds a gentle drift.
//
// All units are pond pixels, seconds and radians. The y axis points down, so a
// positive turn rate turns the koi toward the bottom of the screen.

const TAU = Math.PI * 2;
const STEP = 1 / 60;

/** A 32-bit hash of the given parts (FNV-1a), for seeds. */
export function hashSeed(...parts) {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A seeded random source (mulberry32) with uniform and normal values. */
export function random(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (low, high) => low + (high - low) * next(),
    normal() {
      const u = Math.max(next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * next());
    },
  };
}

/**
 * Swim styles for the five git-koi behaviors. Speeds are in body lengths per second.
 * cruise: speed with no stroke. burst: extra speed at a full stroke.
 * coast: mean glide time between strokes. stroke: mean stroke time.
 * wander: turn-rate spread. meander: sine turn amplitude. depth: 0 surface, 1 deep.
 */
export const STYLES = {
  "deep-rest": {
    cruise: 0.07,
    burst: 0.35,
    coast: 5.0,
    stroke: 0.7,
    wander: 0.1,
    meander: 0.16,
    depth: 0.8,
  },
  rest: {
    cruise: 0.14,
    burst: 0.5,
    coast: 3.4,
    stroke: 0.65,
    wander: 0.14,
    meander: 0.24,
    depth: 0.55,
  },
  "surface-feeding": {
    cruise: 0.2,
    burst: 0.7,
    coast: 2.2,
    stroke: 0.55,
    wander: 0.26,
    meander: 0.38,
    depth: 0.05,
  },
  dart: {
    cruise: 0.28,
    burst: 1.7,
    coast: 1.2,
    stroke: 0.4,
    wander: 0.42,
    meander: 0.3,
    depth: 0.3,
  },
  cruise: {
    cruise: 0.34,
    burst: 0.9,
    coast: 1.8,
    stroke: 0.6,
    wander: 0.2,
    meander: 0.36,
    depth: 0.35,
  },
};

/** The smallest signed angle from `from` to `to`, in -PI..PI. */
export function angleTo(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** The traits of one koi: stable for a seed (an account and a day). */
export function personality(seed) {
  const r = random(seed);
  return {
    turnMemory: r.range(2.2, 4.2), // OU time constant of the turn rate, s
    meanderFrequencies: [r.range(0.03, 0.07), r.range(0.09, 0.16)], // Hz
    meanderPhases: [r.range(0, TAU), r.range(0, TAU)],
    meanderShare: r.range(0.35, 0.8), // second wave relative to the first
    handedness: r.range(-0.07, 0.07), // a slight favorite turn, rad/s
    vigor: r.range(0.85, 1.2), // stroke strength scale
    patience: r.range(0.75, 1.35), // glide time scale
  };
}

/**
 * Make a koi. Options:
 *   width, height: the pond in pond pixels
 *   length: the body length in pond pixels
 *   behavior: a key of STYLES (default "cruise")
 *   seed: the koi's personality seed (account and day)
 *   pathSeed: the seed of this visit's random path (default: seed)
 */
export function createKoi(options) {
  const style = STYLES[options.behavior] ?? STYLES.cruise;
  const traits = personality(options.seed ?? 1);
  const r = random(options.pathSeed ?? options.seed ?? 1);
  const length = options.length;
  let width = options.width;
  let height = options.height;
  const margin = () => Math.min(0.6 * length, 0.3 * Math.min(width, height));

  // Five current waves with random directions and slow drift.
  const waves = Array.from({ length: 5 }, () => {
    const angle = r.range(0, TAU);
    const wavelength = r.range(2.5, 6) * length;
    return {
      kx: (Math.cos(angle) * TAU) / wavelength,
      ky: (Math.sin(angle) * TAU) / wavelength,
      omega: r.range(0.03, 0.09),
      phase: r.range(0, TAU),
      amplitude: (0.05 * length * wavelength) / TAU / 5,
    };
  });

  // The koi starts away from the walls and heads roughly toward the middle.
  const m = Math.min(length, 0.35 * Math.min(width, height));
  const startX = r.range(m, width - m);
  const startY = r.range(m, height - m);
  const state = {
    time: 0,
    x: startX,
    y: startY,
    heading:
      Math.atan2(height / 2 - startY, width / 2 - startX) + r.range(-1.2, 1.2),
    turnRate: 0,
    turnAccel: 0,
    wander: 0,
    speed: style.cruise * length,
    stroke: 0,
    thrust: 0,
    phase: r.range(0, TAU),
    depth: style.depth,
    bend: 0,
    wallStrength: 0,
    food: null,
    interest: null,
  };
  let strokeLeft = 0;
  let wallLean = 0;
  let wallReach = 1;
  let wallSide = 0;
  let interestLeft = 0;
  let coastLeft = r.range(0.2, 1.5) * style.coast;
  const events = [];

  function current(x, y, t) {
    // The velocity of the stream function sum of a*sin(k.p + w t + phase):
    // u = d(psi)/dy, v = -d(psi)/dx. It has no divergence, so it does not pile up.
    let u = 0;
    let v = 0;
    for (const w of waves) {
      const c =
        w.amplitude * Math.cos(w.kx * x + w.ky * y + w.omega * t + w.phase);
      u += c * w.ky;
      v -= c * w.kx;
    }
    return [u, v];
  }

  // A turn rate that steers the look-ahead point away from the walls. It grows
  // smoothly from zero as the point enters the margin, so it has no sudden onset.
  // The look-ahead uses the heading that the koi will have in half a second, so
  // the steering does not overshoot and swing from side to side.
  function wallTurn() {
    const heading = state.heading + 0.5 * state.turnRate;
    const ahead = 0.6 * length + 1.6 * state.speed;
    const ax = state.x + Math.cos(heading) * ahead;
    const ay = state.y + Math.sin(heading) * ahead;
    const edge = wallReach * Math.min(2.0 * margin(), 0.36 * Math.min(width, height));
    const push = (distance) => {
      const t = Math.min(Math.max(1 - distance / edge, 0), 1.5);
      return t * t;
    };
    // The head itself also feels the walls, more strongly, so the whole body
    // stays in view and not only the look-ahead point.
    const near = 1.1 * length;
    const pushHead = (distance) => {
      const t = Math.min(Math.max(1 - distance / near, 0), 1);
      return 2.5 * t * t;
    };
    const fx =
      push(ax) -
      push(width - ax) +
      pushHead(state.x) -
      pushHead(width - state.x);
    const fy =
      push(ay) -
      push(height - ay) +
      pushHead(state.y) -
      pushHead(height - state.y);
    if (fx === 0 && fy === 0) {
      state.wallStrength = 0;
      wallSide = 0;
      return 0;
    }
    // Each time the koi meets a wall, it picks a new random lean for the way out,
    // so the turns at the walls differ and the path does not settle into a lap.
    const strength = Math.min(1, Math.hypot(fx, fy));
    const away = Math.atan2(
      Math.sin(heading) + 2.5 * fy,
      Math.cos(heading) + 2.5 * fx,
    );
    let angle = angleTo(heading, away);
    // At each new wall the koi chooses which way to turn and keeps that choice
    // until it is free of the wall. Without this, a koi that swims straight at a
    // wall cannot decide between left and right and crawls along it.
    if (strength < 0.1) wallSide = 0;
    if (wallSide === 0 && strength >= 0.1) {
      wallSide =
        Math.abs(angle) > 2.6
          ? r.next() < 0.5
            ? -1
            : 1
          : Math.sign(angle) || 1;
      wallLean = r.range(-0.5, 0.5);
      // How early the koi reacts differs per wall, so no two turns are alike.
      wallReach = r.range(0.65, 1.35);
    }
    angle += wallLean * strength;
    // Only an exit behind the koi is ambiguous; there the chosen side wins.
    if (wallSide > 0 && angle < -1.6) angle = Math.min(angle + TAU, Math.PI);
    if (wallSide < 0 && angle > 1.6) angle = Math.max(angle - TAU, -Math.PI);
    state.wallStrength = strength;
    // Food near a wall is allowed: the wall turn is weaker while the koi seeks.
    const share = state.food ? 0.35 : 1;
    return share * 3.0 * strength * angle;
  }

  function seekTurn() {
    if (!state.food) return 0;
    const bearing = Math.atan2(state.food.y - state.y, state.food.x - state.x);
    return 1.6 * angleTo(state.heading, bearing);
  }

  // Curiosity: now and then the koi takes an interest in a random place in the
  // pond and drifts toward it. This gentle pull breaks the laps along the walls
  // that a fast koi would otherwise fall into, and it takes the koi everywhere.
  function pickInterest() {
    const m = margin();
    state.interest = { x: r.range(m, width - m), y: r.range(m, height - m) };
    interestLeft = r.range(5, 14);
  }
  function interestTurn(h) {
    if (!state.interest) pickInterest();
    interestLeft -= h;
    const near =
      Math.hypot(state.interest.x - state.x, state.interest.y - state.y) <
      0.6 * length;
    if (interestLeft <= 0 || near) pickInterest();
    const bearing = Math.atan2(
      state.interest.y - state.y,
      state.interest.x - state.x,
    );
    return 0.35 * angleTo(state.heading, bearing);
  }

  function startStroke(strength) {
    state.thrust = Math.min(1, strength * traits.vigor * r.range(0.7, 1.15));
    strokeLeft = style.stroke * r.range(0.6, 1.4);
    events.push({
      type: "stroke",
      x: state.x,
      y: state.y,
      strength: state.thrust,
    });
  }

  function substep(h) {
    const t = state.time;
    // 1. Wander: OU turn rate with standard deviation style.wander.
    const memory = traits.turnMemory;
    state.wander +=
      (-state.wander / memory) * h +
      style.wander * Math.sqrt((2 / memory) * h) * r.normal();
    // 2. Meander: two slow sines.
    const [f1, f2] = traits.meanderFrequencies;
    const [p1, p2] = traits.meanderPhases;
    const meander =
      style.meander *
        (Math.sin(TAU * f1 * t + p1) +
          traits.meanderShare * Math.sin(TAU * f2 * t + p2)) +
      traits.handedness;
    // 3. Steering.
    const wall = wallTurn();
    const seek = seekTurn() + (state.food ? 0 : interestTurn(h));
    const calm = state.food ? 0.3 : 1 - Math.min(1, Math.abs(wall) / 1.5);
    const limit = 1.2 + 1.6 * state.stroke + 1.4 * state.wallStrength;
    const target = Math.max(
      -limit,
      Math.min(limit, calm * (state.wander + meander) + wall + seek),
    );
    // 4. Critically damped second-order filter on the turn rate.
    const k = 3.2;
    state.turnAccel +=
      (k * k * (target - state.turnRate) - 2 * k * state.turnAccel) * h;
    state.turnRate += state.turnAccel * h;
    state.heading += state.turnRate * h;

    // 5. Burst and coast. Near a wall the koi stops its stroke and glides into
    // the turn, as a real koi brakes before a wall.
    const braking = state.wallStrength > 0.45 && !state.food;
    if (braking && strokeLeft > 0) strokeLeft = Math.min(strokeLeft, h);
    if (braking) coastLeft = Math.max(coastLeft, 0.4);
    if (strokeLeft > 0) {
      strokeLeft -= h;
      if (strokeLeft <= 0) {
        state.thrust = 0;
        coastLeft =
          style.coast *
          traits.patience *
          r.range(0.5, 1.6) *
          (state.food ? 0.3 : 1);
      }
    } else {
      coastLeft -= h;
      if (coastLeft <= 0) startStroke(state.food ? 1 : r.range(0.45, 1));
    }
    state.stroke += (state.thrust - state.stroke) * Math.min(1, 7 * h);
    const turnDrag =
      (1 - 0.3 * Math.min(1, Math.abs(state.turnRate) / 2)) *
      (1 - 0.35 * state.wallStrength);
    // A koi that has seen food swims at least as fast as a cruising koi.
    const hungry = state.food ? 1 : 0;
    const terminal =
      length *
      (Math.max(style.cruise, 0.3 * hungry) +
        Math.max(style.burst, 1.1 * hungry) * state.stroke) *
      turnDrag;
    const response =
      state.stroke > 0.3 ? 0.5 : state.wallStrength > 0.45 ? 0.8 : 1.7; // fast push, long glide, a brake at walls
    state.speed += ((terminal - state.speed) / response) * h;

    const [u, v] = current(state.x, state.y, t);
    state.x += (Math.cos(state.heading) * state.speed + u) * h;
    state.y += (Math.sin(state.heading) * state.speed + v) * h;
    // A hard limit that the steering should never need: the head stays in the pond.
    state.x = Math.min(Math.max(state.x, 2), width - 2);
    state.y = Math.min(Math.max(state.y, 2), height - 2);

    // Tail beat: slow while gliding, fast in a stroke, a little faster in turns.
    const beat = 0.7 + 2.1 * state.stroke + 0.25 * Math.abs(state.turnRate);
    state.phase = (state.phase + TAU * beat * h) % TAU;

    // Depth: a slow OU walk around the style depth. Food pulls the koi up.
    const depthTarget = state.food ? 0 : style.depth;
    state.depth +=
      ((depthTarget - state.depth) / (state.food ? 1.2 : 7)) * h +
      0.12 * Math.sqrt((2 / 7) * h) * r.normal();
    state.depth = Math.min(1, Math.max(0, state.depth));

    // The body follows the curve of the path: bend = -curvature * length, plus a
    // share of the turn rate, so a koi that turns in place still curls.
    const curvature = state.turnRate / Math.max(state.speed, 0.4 * length);
    const bendTarget = Math.max(
      -1.2,
      Math.min(1.2, -0.3 * curvature * length - 0.2 * state.turnRate),
    );
    state.bend += (bendTarget - state.bend) * Math.min(1, 3.5 * h);

    if (
      state.food &&
      Math.hypot(state.food.x - state.x, state.food.y - state.y) < 0.35 * length
    ) {
      events.push({
        type: "eat",
        x: state.food.x,
        y: state.food.y,
        strength: 1,
      });
      state.food = null;
    }
    state.time += h;
  }

  return {
    state,
    traits,
    style,
    /** Advance the koi by `seconds`, in fixed steps of 1/60 s. Long gaps are cut. */
    step(seconds) {
      let left = Math.min(Math.max(seconds, 0), 0.25);
      while (left > 1e-9) {
        const h = Math.min(STEP, left);
        substep(h);
        left -= h;
      }
    },
    /** Change the pond size. The koi stays at the same place, clamped inside. */
    resize(newWidth, newHeight) {
      width = newWidth;
      height = newHeight;
      state.x = Math.min(Math.max(state.x, 2), width - 2);
      state.y = Math.min(Math.max(state.y, 2), height - 2);
    },
    /** Drop food at a pond point. The koi swims to it and eats it. */
    feed(x, y) {
      // Food in the outer band is moved in, where the koi can reach it.
      const band = Math.min(0.4 * length, 0.25 * Math.min(width, height));
      state.food = {
        x: Math.min(Math.max(x, band), width - band),
        y: Math.min(Math.max(y, band), height - band),
      };
      if (strokeLeft <= 0) startStroke(1);
    },
    /** Remove and return the events since the last call: strokes and meals. */
    drain() {
      return events.splice(0, events.length);
    },
  };
}
