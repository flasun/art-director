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
