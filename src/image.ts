import { PNG } from "pngjs";

/**
 * Nearest-neighbor downscale so reference images fit Replicate's ~1MB
 * data-URI budget. Never upscales.
 */
export function downscalePng(buffer: Buffer, maxEdge: number): Buffer {
  const src = PNG.sync.read(buffer);
  const scale = maxEdge / Math.max(src.width, src.height);
  if (scale >= 1) return buffer;
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const sy = Math.min(src.height - 1, Math.floor(y / scale));
      const so = (sy * src.width + sx) * 4;
      const oo = (y * width + x) * 4;
      out.data[oo] = src.data[so]!;
      out.data[oo + 1] = src.data[so + 1]!;
      out.data[oo + 2] = src.data[so + 2]!;
      out.data[oo + 3] = src.data[so + 3]!;
    }
  }
  return PNG.sync.write(out);
}

export function pngDataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/**
 * Concrete pixel dimensions for an aspect ratio, long edge pinned and
 * both edges rounded to a hardware-friendly multiple. Used by backends
 * that take explicit width/height instead of an aspect string.
 */
export function aspectDimensions(aspect: string, longEdge = 1024, multiple = 16): { width: number; height: number } {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  const round = (v: number) => Math.max(multiple, Math.round(v / multiple) * multiple);
  if (w >= h) return { width: round(longEdge), height: round((longEdge * h) / w) };
  return { width: round((longEdge * w) / h), height: round(longEdge) };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * Center-crops to the contract aspect. Used for backends that render at
 * fixed sizes (gpt-image) so deliverables still honor the contract.
 */
export function cropToAspect(buffer: Buffer, aspect: string): Buffer {
  const [aw, ah] = aspect.split(":").map(Number) as [number, number];
  const target = aw / ah;
  const src = PNG.sync.read(buffer);
  const current = src.width / src.height;
  if (Math.abs(current - target) / target < 0.005) return buffer;
  let width = src.width;
  let height = src.height;
  if (current > target) width = Math.round(src.height * target);
  else height = Math.round(src.width / target);
  const out = new PNG({ width, height });
  PNG.bitblt(src, out, Math.floor((src.width - width) / 2), Math.floor((src.height - height) / 2), width, height, 0, 0);
  return PNG.sync.write(out);
}
