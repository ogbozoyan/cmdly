import type { GlyphName } from "../shared/model.ts";

/** Inline SVG icons (16×16, stroke = currentColor), so they follow the theme colors. */

const stroke = (d: string, width = 1.5) =>
  `<svg viewBox="0 0 16 16"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ARROW_ICON = stroke("M3 8h10M9 4l4 4-4 4", 1.7);

export const SEARCH_ICON =
  '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

export const GLYPHS: Record<GlyphName, string> = {
  link: stroke("M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.8"),
  close: stroke("M4 4l8 8M12 4l-8 8"),
  duplicate: stroke("M5.5 5.5h7v7h-7zM3.5 10.5v-7h7"),
  pin: stroke("M10 2.5l3.5 3.5-2.5 1-2.5 2.5.5 2.5-1 1L3 8l1-1 2.5.5L9 5zM5.5 10.5L2.5 13.5"),
  sound: stroke("M2.5 6v4h2.5l3.5 3V3L5 6zM11 5.5a3.5 3.5 0 010 5M12.8 3.8a6 6 0 010 8.4"),
  reload: stroke("M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3"),
  window: stroke("M2.5 3.5h11v9h-11zM2.5 6h11"),
  restore: stroke("M3 6.5h6.5a3.5 3.5 0 010 7H6M5.5 4L3 6.5 5.5 9"),
  star: stroke("M8 2.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 11.1l-3.4 1.8.7-3.8L2.5 6.5l3.8-.5z"),
  incognito: stroke("M2.5 7.5h11M4 7.5l1-4h6l1 4M5 12.5a1.8 1.8 0 100-.1M11 12.5a1.8 1.8 0 100-.1M6.8 12h2.4"),
  history: stroke("M8 4.5V8l2.5 1.5M2.8 8a5.2 5.2 0 101.5-3.7M2.5 2.5v2.5H5"),
  download: stroke("M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"),
  puzzle: stroke("M3 5h3a1.5 1.5 0 113 0h3v3a1.5 1.5 0 110 3v2.5H3V11a1.5 1.5 0 100-3z"),
  gear: stroke("M8 5.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"),
  calc: stroke("M3.5 2.5h9v11h-9zM5.5 4.5h5v2h-5zM5.5 9h.01M8 9h.01M10.5 9h.01M5.5 11.5h.01M8 11.5h.01M10.5 11.5h.01"),
  trash: stroke("M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9"),
  key: stroke("M10 2.5a3.5 3.5 0 11-2.9 5.4L2.5 12.5v1h2v-1.5h1.5v-1.5h1.5l.6-.6A3.5 3.5 0 0110 2.5zM11 5h.01"),
  code: stroke("M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10"),
  braces: stroke("M5.5 2.5c-1.5 0-2 .7-2 2v1.5c0 1-.5 2-1.5 2 1 0 1.5 1 1.5 2v1.5c0 1.3.5 2 2 2M10.5 2.5c1.5 0 2 .7 2 2v1.5c0 1 .5 2 1.5 2-1 0-1.5 1-1.5 2v1.5c0 1.3-.5 2-2 2"),
  user: stroke("M8 7.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 13.5c.4-2.6 2.5-4 5-4s4.6 1.4 5 4"),
  shield: stroke("M8 2L3 4v4c0 3 2.2 5 5 6 2.8-1 5-3 5-6V4zM5.8 8l1.7 1.7 3-3.2"),
  lock: stroke("M4 7.5h8v6H4zM5.5 7.5V5.5a2.5 2.5 0 015 0v2M8 10v1.5"),
  card: stroke("M2 4.5h12v8H2zM2 7h12M4 10.5h2.5"),
  mapPin: stroke("M8 14s4.5-4 4.5-7.5a4.5 4.5 0 00-9 0C3.5 10 8 14 8 14zM8 8.2a1.7 1.7 0 100-3.4 1.7 1.7 0 000 3.4z"),
  sliders: stroke("M2.5 4.5h6M11.5 4.5h2M2.5 8h2M7.5 8h6M2.5 11.5h7M12.5 11.5h1M10 3v3M6 6.5v3M11 10v3"),
  camera: stroke("M2 5.5h3L6 4h4l1 1.5h3v7H2zM8 11a2.2 2.2 0 100-4.4A2.2 2.2 0 008 11z"),
  mic: stroke("M6 2.5h4v5.5a2 2 0 01-4 0zM3.8 7.5a4.2 4.2 0 008.4 0M8 11.7v2M5.5 13.7h5"),
  bell: stroke("M4 11V7.5a4 4 0 018 0V11l1 1.5H3zM6.5 14h3"),
  image: stroke("M2.5 3.5h11v9h-11zM2.5 11l3.5-3.5 3 3 1.5-1.5 3 3M10.5 6.2h.01"),
  clipboard: stroke("M4 3.5h8v10H4zM6 3.5V2.5h4v1M6 7h4M6 9.5h4"),
  doc: stroke("M4 2.5h5l3 3v8H4zM9 2.5v3h3M6 8.5h4M6 11h4"),
  cpu: stroke("M5 5h6v6H5zM6.5 2.5V5M9.5 2.5V5M6.5 11v2.5M9.5 11v2.5M2.5 6.5H5M2.5 9.5H5M11 6.5h2.5M11 9.5h2.5"),
  palette: stroke("M8 2.5a5.5 5.5 0 100 11c1 0 1.3-.8.8-1.5-.5-.8 0-1.6.9-1.6H11a2.5 2.5 0 002.5-2.5C13.5 4.8 11 2.5 8 2.5zM5.5 8h.01M7 5.5h.01M10 5.5h.01"),
  text: stroke("M3 4.5v-1h10v1M8 3.5v9M6 12.5h4"),
  globe: stroke("M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2.5 8h11M8 2.5c-2 1.8-2 9.2 0 11M8 2.5c2 1.8 2 9.2 0 11"),
  power: stroke("M8 2.5v5M4.8 4.6a5 5 0 106.4 0"),
  accessibility: stroke("M8 3.5h.01M3 6l5 1 5-1M8 7v2.5M6 13.5l2-4 2 4"),
  info: stroke("M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM8 7.5V11M8 5.3h.01"),
  cookie: stroke("M8 2.5a5.5 5.5 0 105.5 5.5 2.5 2.5 0 01-3-3A2.5 2.5 0 018 2.5zM6 7h.01M7.5 10.5h.01M10.5 10h.01"),
  search: stroke("M7 11.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.5 10.5L14 14"),
};

export const EXPAND_ICON = stroke("M4 6l4 4 4-4", 1.7);
