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
};
