/**
 * FlatWorld deterministic simulation.
 *
 * The same file runs in the browser (to play) and on the server (to replay a run and
 * verify its score before signing it). To make replays bit-identical across JS engines
 * (V8, JavaScriptCore, SpiderMonkey), the simulation only uses IEEE-754 operations that
 * are exactly specified: + - * / and Math.sqrt. No Math.sin/cos/random inside the sim:
 * rotations use hard-coded cos/sin constants and randomness comes from a seeded PRNG.
 */

export const TICK_RATE = 60; // simulation steps per second
export const MAX_TICKS = TICK_RATE * 600; // hard cap: 10 minutes per run

export const ARENA_RADIUS = 1; // disc radius at the start (world units)
export const MIN_RADIUS = 0.38;
export const PLAYER_RADIUS = 0.045;
const PLAYER_ACCEL = 2.4; // units/s^2 from input
const FRICTION = 0.9; // velocity multiplier per second (applied per tick)
const GRIP_FRICTION = 0.25;

export interface Vec {
  x: number;
  y: number;
}

/** One input change: from `tick` onward the player holds direction (dx, dy). */
export interface InputEvent {
  tick: number;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export type PickupKind = "hat" | "grip" | "shield";

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec;
  ttl: number; // ticks left before it vanishes
}

export interface Meteor {
  id: number;
  pos: Vec;
  vel: Vec;
  r: number;
  warn: number; // ticks of warning shadow before it becomes dangerous
}

export interface GameState {
  tick: number;
  seed: number;
  rng: number;
  player: Vec;
  vel: Vec;
  tilt: Vec; // gravity pulling the player across the tilted disc
  radius: number;
  pickups: Pickup[];
  meteors: Meteor[];
  hats: number;
  gripTicks: number;
  shield: boolean;
  alive: boolean;
  deathCause: "fell" | "meteor" | null;
  nextId: number;
  input: { dx: number; dy: number };
}

/* -------------------------------------------------------------------------- */
/* Seeded PRNG (mulberry32): integer ops only, identical everywhere.           */
/* -------------------------------------------------------------------------- */
function nextRand(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* Rotation constants (pre-computed, never call trig in the sim). */
const ROT_SLOW = { c: 0.9999451694, s: 0.0104717841 }; // 0.6 deg / tick
const ROT_FAST = { c: 0.9997806834, s: 0.0209424199 }; // 1.2 deg / tick

function rotate(v: Vec, r: { c: number; s: number }): Vec {
  return { x: v.x * r.c - v.y * r.s, y: v.x * r.s + v.y * r.c };
}

function len(v: Vec): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Random point inside a disc of radius `r` (rejection sampling, no trig). */
function randomPointInDisc(state: GameState, r: number): Vec {
  for (let i = 0; i < 16; i++) {
    const x = (nextRand(state) * 2 - 1) * r;
    const y = (nextRand(state) * 2 - 1) * r;
    if (x * x + y * y <= r * r) return { x, y };
  }
  return { x: 0, y: 0 };
}

/** Difficulty stage: escalates every 15 seconds. */
export function stageOf(tick: number): number {
  return Math.floor(tick / (TICK_RATE * 15));
}

export function createGame(seed: number): GameState {
  const s: GameState = {
    tick: 0,
    seed: seed >>> 0,
    rng: seed >>> 0,
    player: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    tilt: { x: 0, y: 0 },
    radius: ARENA_RADIUS,
    pickups: [],
    meteors: [],
    hats: 0,
    gripTicks: 0,
    shield: false,
    alive: true,
    deathCause: null,
    nextId: 1,
    input: { dx: 0, dy: 0 },
  };
  // Initial tilt direction from the seed (unit vector via normalisation, no trig).
  const d = randomPointInDisc(s, 1);
  const l = len(d) || 1;
  s.tilt = { x: (d.x / l) * 0.35, y: (d.y / l) * 0.35 };
  return s;
}

/** Advance the simulation by exactly one tick. */
export function step(s: GameState): void {
  if (!s.alive) return;
  const dt = 1 / TICK_RATE;
  const stage = stageOf(s.tick);

  /* 1. Tilt: grows with stage, starts rotating at stage 1, faster at stage 3. */
  const tiltMag = Math.min(0.35 + stage * 0.22, 1.6);
  const tl = len(s.tilt) || 1;
  s.tilt = { x: (s.tilt.x / tl) * tiltMag, y: (s.tilt.y / tl) * tiltMag };
  if (stage >= 3) s.tilt = rotate(s.tilt, ROT_FAST);
  else if (stage >= 1) s.tilt = rotate(s.tilt, ROT_SLOW);

  /* 2. Arena shrinks from stage 2 (edges crack and fall off). */
  if (stage >= 2 && s.radius > MIN_RADIUS) {
    s.radius = Math.max(MIN_RADIUS, s.radius - 0.00018 * (1 + (stage - 2) * 0.5));
  }

  /* 3. Player physics. */
  let ix = s.input.dx;
  let iy = s.input.dy;
  if (ix !== 0 && iy !== 0) {
    ix *= 0.70710678118;
    iy *= 0.70710678118;
  }
  s.vel.x += (ix * PLAYER_ACCEL + s.tilt.x) * dt;
  s.vel.y += (iy * PLAYER_ACCEL + s.tilt.y) * dt;
  const fr = s.gripTicks > 0 ? GRIP_FRICTION : FRICTION;
  const damp = 1 - (1 - fr) * dt * 6;
  s.vel.x *= damp;
  s.vel.y *= damp;
  s.player.x += s.vel.x * dt;
  s.player.y += s.vel.y * dt;
  if (s.gripTicks > 0) s.gripTicks--;

  /* 4. Spawns (all from the seeded PRNG). */
  if (s.tick % (TICK_RATE * 3) === TICK_RATE && s.pickups.length < 3) {
    const roll = nextRand(s);
    const kind: PickupKind = roll < 0.7 ? "hat" : roll < 0.88 ? "grip" : "shield";
    s.pickups.push({
      id: s.nextId++,
      kind,
      pos: randomPointInDisc(s, s.radius * 0.8),
      ttl: TICK_RATE * 6,
    });
  }
  if (stage >= 1) {
    const every = Math.max(TICK_RATE * 0.6, TICK_RATE * (2.4 - stage * 0.3));
    if (s.tick % Math.floor(every) === 0) {
      const target = randomPointInDisc(s, s.radius * 0.9);
      // Meteors fall from above: a warning shadow, then a hazard that slides slightly.
      const drift = randomPointInDisc(s, 0.25);
      s.meteors.push({
        id: s.nextId++,
        pos: target,
        vel: drift,
        r: 0.06 + nextRand(s) * 0.05,
        warn: TICK_RATE,
      });
    }
  }

  /* 5. Pickups. */
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const p = s.pickups[i];
    p.ttl--;
    const dx = p.pos.x - s.player.x;
    const dy = p.pos.y - s.player.y;
    if (dx * dx + dy * dy < (PLAYER_RADIUS + 0.04) * (PLAYER_RADIUS + 0.04)) {
      if (p.kind === "hat") s.hats++;
      else if (p.kind === "grip") s.gripTicks = TICK_RATE * 5;
      else s.shield = true;
      s.pickups.splice(i, 1);
    } else if (p.ttl <= 0 || p.pos.x * p.pos.x + p.pos.y * p.pos.y > s.radius * s.radius) {
      s.pickups.splice(i, 1);
    }
  }

  /* 6. Meteors. */
  for (let i = s.meteors.length - 1; i >= 0; i--) {
    const m = s.meteors[i];
    if (m.warn > 0) {
      m.warn--;
      continue;
    }
    m.pos.x += m.vel.x * dt;
    m.pos.y += m.vel.y * dt;
    const dx = m.pos.x - s.player.x;
    const dy = m.pos.y - s.player.y;
    const hit = m.r + PLAYER_RADIUS;
    if (dx * dx + dy * dy < hit * hit) {
      if (s.shield) {
        s.shield = false;
        s.meteors.splice(i, 1);
        continue;
      }
      s.alive = false;
      s.deathCause = "meteor";
    }
    if (m.pos.x * m.pos.x + m.pos.y * m.pos.y > (s.radius + 0.3) * (s.radius + 0.3)) {
      s.meteors.splice(i, 1);
    }
  }

  /* 7. Falling off the flat edge. */
  const pr = len(s.player);
  if (pr > s.radius) {
    s.alive = false;
    s.deathCause = "fell";
  }

  s.tick++;
  if (s.tick >= MAX_TICKS) s.alive = false;
}

/** Score: 10 points per second survived + 50 per hat. */
export function scoreOf(s: GameState): number {
  return Math.floor(s.tick / TICK_RATE) * 10 + s.hats * 50;
}

/**
 * Re-run a whole game from its seed and recorded input changes.
 * Used by the server to verify a claimed score before signing it.
 */
export function replay(seed: number, inputs: InputEvent[]): { score: number; ticks: number; hats: number } {
  const s = createGame(seed);
  let k = 0;
  const sorted = [...inputs].sort((a, b) => a.tick - b.tick);
  while (s.alive && s.tick < MAX_TICKS) {
    while (k < sorted.length && sorted[k].tick <= s.tick) {
      s.input = { dx: sorted[k].dx, dy: sorted[k].dy };
      k++;
    }
    step(s);
  }
  return { score: scoreOf(s), ticks: s.tick, hats: s.hats };
}
