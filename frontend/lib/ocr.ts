// Reads the text in photos and scanned pages inside the browser, so images never leave the device.
// Only the extracted text is sent to the server, where the usual fixed rules analyse it.

export const isImageFile = (file: File) => file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);

/** Small or low-resolution photos read better when enlarged first; full-size phone photos pass through. */
async function enlarge(image: File | string): Promise<File | string | HTMLCanvasElement> {
  if (typeof image === "string") return image;
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(2, 2400 / bitmap.width);
  if (scale <= 1.1) return image;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function readImages(images: (File | string)[], onProgress: (message: string) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  let done = 0;
  onProgress("Preparing the text reader…");
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgress(`Reading the text… ${Math.round(((done + m.progress) / images.length) * 100)}%`);
      }
    },
  });
  try {
    // Keep the gaps between table columns, so each printed row stays one line.
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const pages: string[] = [];
    for (const image of images) {
      const { data } = await worker.recognize(await enlarge(image));
      pages.push(data.text);
      done += 1;
    }
    return pages.join("\n");
  } finally {
    await worker.terminate();
  }
}
