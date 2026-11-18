// The "liquid glass" material for floating chrome only (phone top bar and tab bar, sheets, popups, the client menu bar).
// Never for content cards: glass sits above the content layer and lets it show through. A bright top edge stands in for
// light catching the rim. Elements using it also carry `data-glass` so index.css can turn it solid for people who ask
// for reduced transparency or more contrast.
export const glassCls =
  "bg-white/55 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/70 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(255,255,255,0.3),0_10px_34px_rgba(20,24,36,0.14)]";
/** Heavier variant for big surfaces (sheets): more opaque so text stays legible. */
export const glassThickCls =
  "bg-white/78 backdrop-blur-3xl backdrop-saturate-[1.8] border border-white/80 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_-12px_40px_rgba(20,24,36,0.16)]";
