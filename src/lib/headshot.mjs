/**
 * Staff headshots: the settings and steps shared by `npm run generate-headshot`
 * (scripts/generate-headshot.mjs, which resizes and encodes with sharp) and the editors' page
 * (src/pages/editors/generate-headshot.astro, which does with WebAssembly), so both make the same
 * picture from a photo: the person cut out of it, on the gray behind authors' initials, cropped
 * square (its middle), as a small WebP. See README.md's "Authors and the team".
 */
import { RawImage, pipeline } from "@huggingface/transformers";

/**
 * A headshot's width and height. The biggest one shown is 140px wide (on an author's page), so
 * this is enough for 2x screens.
 */
export const HEADSHOT_SIZE = 280;

/** WebP quality. Lower than other images' 85: at this size it looks the same, and is smaller. */
export const HEADSHOT_WEBP_QUALITY = 80;

/**
 * What replaces the photo's background: the gray behind authors' initials (.initials in
 * src/components/AuthorPicture.astro), so a headshot's circle matches theirs. Baked in rather than
 * left transparent, since a transparent WebP is about twice the size.
 */
export const HEADSHOT_BACKGROUND = [0xe4, 0xe4, 0xe4];

/**
 * The background-removal model: MODNet, made for portraits (Apache-2.0), quantized to 8 bits, a
 * 6.6 MB download (cached after the first time) that takes well under a second per photo.
 */
const MODEL = "Xenova/modnet";
const MODEL_DTYPE = "q8";

/** A pixel at least this opaque in the cutout is part of the person. */
const SUBJECT_ALPHA = 128;

let remover;

/**
 * The person in a photo, cut out of it: RGBA pixels the photo's size, transparent where its
 * background was.
 * @param {Uint8Array | Uint8ClampedArray} pixels the photo's pixels, RGB or RGBA, upright and sRGB
 * @param {number} width
 * @param {number} height
 * @param {3 | 4} channels
 * @returns {Promise<Uint8ClampedArray>}
 */
export async function cutOut(pixels, width, height, channels) {
  remover ??= pipeline("background-removal", MODEL, { dtype: MODEL_DTYPE });
  const output = await (await remover)(new RawImage(pixels, width, height, channels));
  const cutout = Array.isArray(output) ? output[0] : output;
  return new Uint8ClampedArray((await cutout.rgba()).data);
}

/**
 * A cutout on HEADSHOT_BACKGROUND, cropped square: the middle of it, cropping only the longer side
 * (equally from both ends), so headshots are always square.
 * @param {Uint8ClampedArray} cutout from cutOut()
 * @param {number} width
 * @param {number} height
 * @returns {{ pixels: Uint8ClampedArray, size: number }} opaque RGBA pixels, size x size
 */
export function onBackgroundSquare(cutout, width, height) {
  let foundPerson = false;
  for (let i = 3; i < cutout.length && !foundPerson; i += 4) {
    foundPerson = cutout[i] >= SUBJECT_ALPHA;
  }
  if (!foundPerson) throw new Error("No person was found in this photo.");

  const size = Math.min(width, height);
  const cropLeft = Math.floor((width - size) / 2);
  const cropTop = Math.floor((height - size) / 2);

  const [r, g, b] = HEADSHOT_BACKGROUND;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = ((cropTop + y) * width + cropLeft + x) * 4;
      const to = (y * size + x) * 4;
      const alpha = cutout[from + 3] / 255;
      pixels[to] = cutout[from] * alpha + r * (1 - alpha);
      pixels[to + 1] = cutout[from + 1] * alpha + g * (1 - alpha);
      pixels[to + 2] = cutout[from + 2] * alpha + b * (1 - alpha);
      pixels[to + 3] = 255;
    }
  }
  return { pixels, size };
}
