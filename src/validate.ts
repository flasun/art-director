import fs from "node:fs";
import { isPng } from "./image.js";

export function parseIntInRange(label: string, raw: string, min: number, max: number): number {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || String(value) !== raw.trim()) {
    throw new Error(`${label} must be an integer, got "${raw}"`);
  }
  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}, got ${value}`);
  }
  return value;
}

/**
 * Reads an image the pipeline will decode with pngjs. Failing here with
 * the filename beats a cryptic "Invalid file signature" three calls deep.
 */
export function readPngFile(file: string, purpose: string): Buffer {
  if (!fs.existsSync(file)) {
    throw new Error(`${purpose} not found: ${file}`);
  }
  const buffer = fs.readFileSync(file);
  if (!isPng(buffer)) {
    throw new Error(`${purpose} must be a PNG, and ${file} is not one (JPEG/WebP aren't supported yet)`);
  }
  return buffer;
}
