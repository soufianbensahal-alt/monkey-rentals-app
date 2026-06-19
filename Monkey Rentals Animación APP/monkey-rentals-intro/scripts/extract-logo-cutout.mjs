import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const input =
  "/Users/soufianbensahal/Documents/POST MONKEY RENTALS/LOGO DESTACADAS IG/Logo_Monkey_Rentals.jpeg";
const output = path.resolve("public/logo-monkey-rentals-cutout.png");
const originalOutput = path.resolve("public/logo-monkey-rentals-source.jpeg");

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const image = sharp(input).ensureAlpha();
const { width = 0, height = 0 } = await image.metadata();
const raw = await image.raw().toBuffer();

if (!width || !height) {
  throw new Error("Could not read logo dimensions.");
}

const samplePixel = (x, y) => {
  const index = (y * width + x) * 4;
  return [raw[index], raw[index + 1], raw[index + 2]];
};

const cornerSamples = [
  samplePixel(4, 4),
  samplePixel(width - 5, 4),
  samplePixel(4, height - 5),
  samplePixel(width - 5, height - 5),
  samplePixel(Math.floor(width / 2), 4),
  samplePixel(Math.floor(width / 2), height - 5),
];

const background = cornerSamples
  .reduce(
    (acc, rgb) => [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]],
    [0, 0, 0],
  )
  .map((channel) => channel / cornerSamples.length);

const rgba = Buffer.from(raw);
const transparentDistance = 23;
const solidDistance = 66;

for (let index = 0; index < rgba.length; index += 4) {
  const r = rgba[index];
  const g = rgba[index + 1];
  const b = rgba[index + 2];
  const distance = Math.hypot(
    r - background[0],
    g - background[1],
    b - background[2],
  );

  const alpha = clamp(
    Math.round(((distance - transparentDistance) / (solidDistance - transparentDistance)) * 255),
    0,
    255,
  );

  rgba[index + 3] = alpha;
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.copyFile(input, originalOutput);

await sharp(rgba, {
  raw: {
    width,
    height,
    channels: 4,
  },
})
  .png()
  .toFile(output);

console.log(`Saved cutout logo to ${output}`);
