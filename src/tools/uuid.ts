/**
 * UUID generation (RFC 9562): v4 random, v7 time-ordered, v1 time-based.
 * Pure apart from the clock and crypto randomness, both injectable for tests.
 */

export const UUID_VERSIONS = ["v4", "v7", "v1"] as const;
export type UuidVersion = (typeof UUID_VERSIONS)[number];

export const UUID_DESCRIPTIONS: Record<UuidVersion, string> = {
  v4: "random",
  v7: "time-ordered",
  v1: "time-based",
};

export interface UuidEnv {
  now: () => number;
  random: (bytes: number) => Uint8Array;
}

const defaultEnv: UuidEnv = {
  now: () => Date.now(),
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
};

/** Next version in the Tab cycle: v4 → v7 → v1 → v4. */
export function nextUuidVersion(version: UuidVersion): UuidVersion {
  return UUID_VERSIONS[(UUID_VERSIONS.indexOf(version) + 1) % UUID_VERSIONS.length];
}

export function isUuidVersion(value: unknown): value is UuidVersion {
  return (UUID_VERSIONS as readonly unknown[]).includes(value);
}

/**
 * Generates `count` UUIDs. A batch of v7/v1 is strictly increasing, so it sorts in creation order
 * even when all of them fall into the same millisecond.
 */
export function generateUuids(version: UuidVersion, count = 1, env: UuidEnv = defaultEnv): string[] {
  const now = env.now();
  const sequence = env.random(2);
  const start = ((sequence[0] << 8) | sequence[1]) & 0x7ff; // leaves room to count up within 12 bits
  return Array.from({ length: count }, (_, i) => {
    if (version === "v7") return uuidV7(now, start + i, env);
    if (version === "v1") return uuidV1(now, i, env);
    return uuidV4(env);
  });
}

function uuidV4(env: UuidEnv): string {
  const b = env.random(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(b);
}

/** 48-bit Unix ms timestamp | ver 7 | 12-bit counter | variant | 62 random bits. */
function uuidV7(ms: number, counter: number, env: UuidEnv): string {
  const b = env.random(16);
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(b);
}

/** 100 ns ticks since 1582-10-15, a random clock sequence and a random node (multicast bit set). */
const GREGORIAN_OFFSET = 0x01b21dd213814000n;

function uuidV1(ms: number, tick: number, env: UuidEnv): string {
  const time = BigInt(ms) * 10000n + GREGORIAN_OFFSET + BigInt(tick);
  const timeLow = Number(time & 0xffffffffn);
  const timeMid = Number((time >> 32n) & 0xffffn);
  const timeHigh = Number((time >> 48n) & 0x0fffn) | 0x1000;
  const rnd = env.random(8);
  const clockSeq = (((rnd[0] << 8) | rnd[1]) & 0x3fff) | 0x8000;
  rnd[2] |= 0x01; // random node id must have the multicast bit set (RFC 9562 §6.10)
  const node = [...rnd.slice(2, 8)].map((x) => hex(x)).join("");
  return `${hex(timeLow, 8)}-${hex(timeMid, 4)}-${hex(timeHigh, 4)}-${hex(clockSeq, 4)}-${node}`;
}

function hex(value: number, width = 2): string {
  return value.toString(16).padStart(width, "0");
}

function format(b: Uint8Array): string {
  const h = [...b].map((x) => hex(x)).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
