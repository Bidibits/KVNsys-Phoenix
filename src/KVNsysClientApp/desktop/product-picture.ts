import { ProductPictureLimit } from '@kvnsys/client';
import { nativeImage, type NativeImage } from 'electron';
import type { PictureChoice } from './bridge.js';

/** The longest side a product's picture is kept at: plenty for a form, small enough to send. */
export const PictureSide = 600;

/** Tried in turn until the JPEG fits ProductPictureLimit. */
const Qualities = [85, 70, 50];

const Unreadable = "That file isn't a picture KVNsys can read. Choose a JPEG or PNG picture.";

/**
 * A picture file, made into what KVNsys keeps (SCHEMA-PLAN: one format, so no image type is
 * recorded): no side longer than PictureSide, see-through parts made white, and a JPEG within
 * ProductPictureLimit. It's done here, with Electron's own image tools, so the server never has
 * to read a picture, only check it.
 */
export function shrinkPicture(path: string): PictureChoice {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return { ok: false, reason: 'unreadable', message: Unreadable };
  const { width, height } = image.getSize();
  const scale = Math.min(1, PictureSide / Math.max(width, height));
  const sized =
    scale < 1
      ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' })
      : image;
  const flat = onWhite(sized);
  for (const quality of Qualities) {
    const jpeg = flat.toJPEG(quality);
    if (jpeg.length <= ProductPictureLimit) return { ok: true, picture: jpeg.toString('base64') };
  }
  return { ok: false, reason: 'unreadable', message: 'That picture is still too big after shrinking it. Choose a plainer one.' };
}

/**
 * The picture over a white background. A JPEG has no see-through parts, and Electron would make
 * them black: a product cut out of its background (a common PNG) would end up on black.
 * Electron's pixels are premultiplied BGRA, so white shows through by what alpha leaves.
 */
function onWhite(image: NativeImage): NativeImage {
  const pixels = image.toBitmap();
  let seeThrough = false;
  for (let i = 3; i < pixels.length; i += 4) {
    const alpha = pixels[i]!;
    if (alpha === 255) continue;
    seeThrough = true;
    const white = 255 - alpha;
    pixels[i - 3] = Math.min(255, pixels[i - 3]! + white);
    pixels[i - 2] = Math.min(255, pixels[i - 2]! + white);
    pixels[i - 1] = Math.min(255, pixels[i - 1]! + white);
    pixels[i] = 255;
  }
  return seeThrough ? nativeImage.createFromBitmap(pixels, image.getSize()) : image;
}
