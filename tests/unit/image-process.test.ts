import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { ImageError, MAX_WIDTH, processImage } from "../../src/lib/images/process";

const solid = (width: number, height: number, alpha = false) =>
  sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 200, g: 50, b: 50, alpha: 0.5 } : { r: 200, g: 50, b: 50 },
    },
  });

test("large photos are scaled down and lose their metadata (GPS)", async () => {
  const input = await solid(3000, 2000)
    .jpeg()
    .withMetadata({ exif: { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 0/1" } } })
    .toBuffer();
  assert.ok((await sharp(input).metadata()).exif, "fixture should carry EXIF");

  const out = await processImage(input);
  assert.equal(out.contentType, "image/jpeg");
  assert.equal(out.width, MAX_WIDTH);
  assert.equal(out.height, Math.round((2000 * MAX_WIDTH) / 3000));
  const meta = await sharp(out.body).metadata();
  assert.equal(meta.exif, undefined, "EXIF must be stripped");
});

test("EXIF rotation is applied before metadata is dropped", async () => {
  const input = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const out = await processImage(input);
  assert.deepEqual([out.width, out.height], [200, 400]);
});

test("small images are not enlarged", async () => {
  const out = await processImage(await solid(300, 100).png().toBuffer());
  assert.deepEqual([out.contentType, out.width, out.height], ["image/png", 300, 100]);
});

test("WebP becomes JPEG (or PNG with transparency) for Outlook", async () => {
  const opaque = await processImage(await solid(100, 100).webp().toBuffer());
  assert.equal(opaque.contentType, "image/jpeg");
  const transparent = await processImage(await solid(100, 100, true).webp().toBuffer());
  assert.equal(transparent.contentType, "image/png");
});

test("animated GIFs stay animated", async () => {
  // Three 50×50 frames stacked vertically = one 3-page animated GIF.
  const frames = await Promise.all(
    [0, 1, 2].map((i) =>
      sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: i * 80, g: 0, b: 0 } },
      })
        .raw()
        .toBuffer(),
    ),
  );
  const animated = await sharp(Buffer.concat(frames), {
    raw: { width: 50, height: 150, channels: 3, pageHeight: 50 },
  } as never)
    .gif()
    .toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 3);

  const out = await processImage(animated);
  assert.equal(out.contentType, "image/gif");
  assert.equal(out.height, 50);
  assert.equal((await sharp(out.body, { animated: true }).metadata()).pages, 3);
});

test("non-images and unsupported formats are rejected", async () => {
  await assert.rejects(processImage(Buffer.from("hello, not an image")), (e: unknown) => {
    return e instanceof ImageError && e.status === 415;
  });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  await assert.rejects(
    processImage(svg),
    (e: unknown) => e instanceof ImageError && e.status === 415,
  );
});

test("files over 10 MB are rejected before decoding", async () => {
  await assert.rejects(processImage(Buffer.alloc(11 * 1024 * 1024)), (e: unknown) => {
    return e instanceof ImageError && e.status === 413;
  });
});
