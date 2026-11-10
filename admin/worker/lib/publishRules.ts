// What Instagram and Facebook accept, checked before a post can be scheduled. Pure, no
// Worker APIs, so the React composer imports it too and shows the same errors live.
// Limits are Meta's documented ones; reel and story numbers are re-verified in stage 4.

export type Platform = "instagram" | "facebook";
export type Kind = "feed" | "carousel" | "reel" | "story";
export type MediaIn = {
  type: "image" | "video";
  bytes?: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
};
export type PostIn = { kind: Kind; caption: string; media: MediaIn[]; platforms: Platform[] };

export const KINDS: readonly Kind[] = ["feed", "carousel", "reel", "story"];
export const PLATFORMS: readonly Platform[] = ["instagram", "facebook"];

export const MAX_CAROUSEL = 10;
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAGS_MAX = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // the Worker request body limit
const FEED_RATIO_MIN = 0.8; // 4:5
const FEED_RATIO_MAX = 1.91;

const UPLOAD_TYPES: Record<string, { type: "image" | "video"; ext: string }> = {
  "image/jpeg": { type: "image", ext: "jpg" },
  "video/mp4": { type: "video", ext: "mp4" },
  "video/quicktime": { type: "video", ext: "mov" },
};

export function checkUpload(
  contentType: string,
  bytes: number
): { ok: true; type: "image" | "video"; ext: string } | { ok: false; error: string } {
  const t = UPLOAD_TYPES[contentType];
  if (!t) return { ok: false, error: "Use a JPEG photo or an MP4 / MOV video." };
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: "The file is empty." };
  const max = t.type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes > max) return { ok: false, error: `${t.type === "image" ? "Photos" : "Videos"} can be at most ${max / 1024 / 1024} MB.` };
  return { ok: true, type: t.type, ext: t.ext };
}

const hashtags = (s: string) => (s.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;

export function validatePost(p: PostIn): string[] {
  const errors: string[] = [];
  if (!KINDS.includes(p.kind)) return ["Unknown post type."];
  if (p.platforms.length === 0) errors.push("Pick at least one channel.");
  const ig = p.platforms.includes("instagram");
  const fb = p.platforms.includes("facebook");

  if (p.kind === "story") {
    if (p.caption.trim()) errors.push("Stories do not have a caption.");
  } else if (ig) {
    if (p.caption.length > IG_CAPTION_MAX) errors.push(`Instagram captions can be at most ${IG_CAPTION_MAX} characters.`);
    if (hashtags(p.caption) > IG_HASHTAGS_MAX) errors.push(`Instagram allows at most ${IG_HASHTAGS_MAX} hashtags.`);
  }

  const m = p.media;
  const photoRatio = (x: MediaIn) => {
    if (!ig || x.type !== "image" || !x.width || !x.height) return;
    const r = x.width / x.height;
    if (r < FEED_RATIO_MIN) errors.push("Instagram photos must not be taller than 4:5.");
    else if (r > FEED_RATIO_MAX) errors.push("Instagram photos must not be wider than 1.91:1.");
  };

  if (p.kind === "feed") {
    if (m.length !== 1 || m[0].type !== "image") errors.push("A photo post needs exactly one photo.");
    else photoRatio(m[0]);
  } else if (p.kind === "carousel") {
    if (m.length < 2 || m.length > MAX_CAROUSEL) errors.push(`A carousel needs 2 to ${MAX_CAROUSEL} items.`);
    if (fb && m.some((x) => x.type === "video")) errors.push("Facebook carousels can only hold photos.");
    m.forEach(photoRatio);
  } else if (p.kind === "reel") {
    if (m.length !== 1 || m[0].type !== "video") errors.push("A reel needs exactly one video.");
    else if (m[0].durationSec != null && (m[0].durationSec < 3 || m[0].durationSec > 90)) errors.push("A reel must last between 3 and 90 seconds.");
  } else {
    if (m.length !== 1) errors.push("A story needs exactly one photo or video.");
    else if (m[0].type === "video" && m[0].durationSec != null && m[0].durationSec > 60) errors.push("A story video can last at most 60 seconds.");
  }
  return errors;
}
