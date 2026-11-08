import { removeBackground } from "@/lib/remove-background";

/**
 * Gör om en uppladdad bild till samma sorts bild som Teknik-sidan visar: ljusgröna linjer på
 * genomskinlig botten, så att den vilar mot sidans mörkgröna bakgrund. Allt sker i webbläsaren.
 *
 *  - photoToSketch: foto av fastigheten -> frilagd byggnad -> kantlinjer i grönt.
 *  - cleanSketch: en egen skiss (mörka linjer på ljust papper, eller ljusa linjer på mörkt) ->
 *    bakgrunden blir genomskinlig och linjerna grönas. Är bilden redan genomskinlig lämnas den orörd.
 */

const MAX_SIDE = 1600;
export const LINE_RGB: [number, number, number] = [165, 205, 145];

type Pix = { w: number; h: number; data: Uint8ClampedArray };

async function toPixels(file: Blob): Promise<Pix> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

async function toPng(p: Pix, out: Uint8ClampedArray): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = p.w;
  c.height = p.h;
  c.getContext("2d")!.putImageData(new ImageData(out as unknown as Uint8ClampedArray<ArrayBuffer>, p.w, p.h), 0, 0);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/png"));
}

function asFile(blob: Blob, name: string): File {
  const base = name.replace(/\.[^.]+$/, "") || "skiss";
  return new File([blob], `${base}.png`, { type: "image/png" });
}

function lumOf(d: Uint8ClampedArray, i: number): number {
  // Genomskinliga pixlar räknas som svart, så att byggnadens kontur också blir en kant.
  return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * (d[i + 3] / 255);
}

export async function photoToSketch(file: File): Promise<File> {
  let src: Blob = file;
  try {
    src = await removeBackground(file); // bara byggnaden, utan träd och himmel
  } catch (e) {
    console.error("frilägg misslyckades, använder hela fotot", e);
  }
  const p = await toPixels(src);
  const { w, h, data } = p;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = lumOf(data, i * 4);

  // Lätt utjämning (3x3) så att fasadtextur inte blir brus.
  const sm = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum[(y + dy) * w + x + dx];
      sm[y * w + x] = s / 9;
    }

  // Sobel
  const mag = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  let maxMag = 1;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -sm[i - w - 1] - 2 * sm[i - 1] - sm[i + w - 1] + sm[i - w + 1] + 2 * sm[i + 1] + sm[i + w + 1];
      const gy = -sm[i - w - 1] - 2 * sm[i - w] - sm[i - w + 1] + sm[i + w - 1] + 2 * sm[i + w] + sm[i + w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > maxMag) maxMag = m;
    }
  for (let i = 0; i < w * h; i++) hist[Math.min(255, Math.floor((mag[i] / maxMag) * 255))]++;
  // Tröskeln: behåll de starkaste ~9 % av pixlarna.
  let acc = 0;
  let cut = 255;
  for (let b = 255; b >= 0; b--) {
    acc += hist[b];
    if (acc >= w * h * 0.09) {
      cut = b;
      break;
    }
  }
  const t = (cut / 255) * maxMag;

  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, Math.min(1, (mag[i] - t * 0.55) / (t * 0.9)));
    out[i * 4] = LINE_RGB[0];
    out[i * 4 + 1] = LINE_RGB[1];
    out[i * 4 + 2] = LINE_RGB[2];
    out[i * 4 + 3] = Math.round(a * 235);
  }
  return asFile(await toPng(p, out), file.name);
}

export async function cleanSketch(file: File): Promise<File> {
  const p = await toPixels(file);
  const { w, h, data } = p;

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  if (transparent / (w * h) > 0.05) return file; // redan utan bakgrund

  // Bakgrundsnivå = medelljusheten i bildens hörn.
  const corner = (x0: number, y0: number) => {
    let s = 0;
    let n = 0;
    for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 10; x++) { s += lumOf(data, (y * w + x) * 4); n++; }
    return s / n;
  };
  const bg = (corner(0, 0) + corner(w - 10, 0) + corner(0, h - 10) + corner(w - 10, h - 10)) / 4;
  const lightBg = bg >= 128;
  const range = lightBg ? Math.max(40, bg) : Math.max(40, 255 - bg);

  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const l = lumOf(data, i * 4);
    const diff = lightBg ? bg - l : l - bg;
    const a = Math.max(0, Math.min(1, (diff / range - 0.08) / 0.5));
    out[i * 4] = LINE_RGB[0];
    out[i * 4 + 1] = LINE_RGB[1];
    out[i * 4 + 2] = LINE_RGB[2];
    out[i * 4 + 3] = Math.round(a * 240);
  }
  return asFile(await toPng(p, out), file.name);
}
