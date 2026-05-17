const sharp = require('sharp');

/**
 * Convert an arbitrary image buffer to WebP. Optionally resize the
 * longest side to `maxWidth`. Returns `{ buffer, ext, mime, width, height }`.
 *
 * width/height reflect the *output* image dimensions (post-resize). Stored
 * alongside the image so the frontend can render the thumbnail with the
 * exact aspect-ratio slot from t=0 — no column-count reflow when the
 * pixels eventually arrive.
 *
 * Uses sharp (libvips + libwebp). Preserves animated GIFs as animated
 * WebP. Caps effort at 4 for a reasonable speed/size trade-off during
 * a serverless invocation.
 */
async function toWebp(buffer, opts = {}) {
  const { maxWidth, quality = 82, lossless = false } = opts;

  let pipeline = sharp(buffer, { animated: true, failOnError: false });

  if (maxWidth) {
    const meta = await pipeline.metadata();
    if (meta.width && meta.width > maxWidth) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }
  }

  const { data: out, info } = await pipeline
    .webp({ quality, lossless, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out,
    ext: '.webp',
    mime: 'image/webp',
    width: info.width || null,
    height: info.height || null,
  };
}

/**
 * Fast sniff of the first few bytes to check if a buffer is already WebP.
 * Layout: b'RIFF' + 4-byte size + b'WEBP'. Cheap enough to skip the
 * sharp round-trip when the input already matches.
 */
function isWebp(buffer) {
  if (!buffer || buffer.length < 12) return false;
  return (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  );
}

/**
 * If the buffer is already WebP, return it unchanged. Otherwise
 * convert. Shortcut used for manual uploads where we want to skip
 * a sharp pass for files the user already pre-converted.
 * Either way, we read width/height from sharp metadata so callers
 * can persist them.
 */
async function ensureWebp(buffer, opts = {}) {
  if (isWebp(buffer)) {
    let width = null, height = null;
    try {
      const meta = await sharp(buffer, { failOnError: false }).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch { /* dimensions unknown — frontend falls back to aspect-ratio: auto */ }
    return { buffer, ext: '.webp', mime: 'image/webp', width, height };
  }
  return toWebp(buffer, opts);
}

module.exports = { toWebp, isWebp, ensureWebp };
