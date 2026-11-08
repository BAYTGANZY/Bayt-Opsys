/**
 * Tar bort bakgrunden ur en bild, helt i webbläsaren (ingen bild lämnar användarens dator
 * för att rensas). Biblioteket @imgly/background-removal laddas först när någon faktiskt
 * trycker på "Byt bild" med bakgrundsborttagning på, så det tynger inte övriga appen.
 *
 * Första körningen hämtar en AI-modell (flera tiotals MB), därför tar den första bilden längre tid.
 * Misslyckas något kastas ett fel — anroparen sparar då originalbilden i stället.
 */

const LIB_URL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm";
const MAX_SIDE = 2000;

/** Förminskar stora foton innan modellen körs: snabbare, och PNG-resultatet blir inte gigantiskt. */
async function downscale(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (k >= 1) {
    bmp.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/png"));
}

export async function removeBackground(file: File): Promise<File> {
  const url: string = LIB_URL;
  const mod = await import(/* @vite-ignore */ url);
  const run = mod.removeBackground ?? mod.default;
  if (typeof run !== "function") throw new Error("Biblioteket för bakgrundsborttagning kunde inte laddas.");
  const input = await downscale(file);
  const out: Blob = await run(input, { output: { format: "image/png" } });
  const base = file.name.replace(/\.[^.]+$/, "") || "fastighet";
  return new File([out], `${base}.png`, { type: "image/png" });
}
