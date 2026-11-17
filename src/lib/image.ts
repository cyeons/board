const MAX_EDGE = 2560;
const THUMB_EDGE = 480;

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

function draw(source: CanvasImageSource, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export type Prepared = { file: File; thumb: Blob | null; width: number | null; height: number | null };

const isHeic = (file: File) => /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

/**
 * 올리기 전에 이미지를 긴 변 2560px로 줄이고 480px 썸네일을 만든다.
 * 브라우저가 못 여는 형식(HEIC 등)은 원본 그대로 두고 썸네일 없이 올린다.
 */
export async function prepareImage(file: File): Promise<Prepared> {
  if (!file.type.startsWith("image/") && !isHeic(file)) return { file, thumb: null, width: null, height: null };
  if (file.type === "image/gif" || file.type === "image/svg+xml") return { file, thumb: null, width: null, height: null };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { file, thumb: null, width: null, height: null };
  }
  const { width, height } = bitmap;
  try {
    const thumbBlob = await canvasBlob(draw(bitmap, width, height, THUMB_EDGE), "image/jpeg", 0.8);
    let out = file;
    let finalWidth = width;
    let finalHeight = height;
    const needsResize = Math.max(width, height) > MAX_EDGE;
    if (needsResize || isHeic(file)) {
      const big = draw(bitmap, width, height, MAX_EDGE);
      const blob = await canvasBlob(big, "image/jpeg", 0.88);
      if (blob) {
        out = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        finalWidth = big.width;
        finalHeight = big.height;
      }
    }
    return { file: out, thumb: thumbBlob, width: finalWidth, height: finalHeight };
  } finally {
    bitmap.close();
  }
}

/** PDF 첫 장을 썸네일로 만든다. pdf.js는 무거워서 PDF를 고를 때만 불러온다. */
export async function pdfThumb(file: File): Promise<Blob | null> {
  try {
    const pdf = await loadPdf(await file.arrayBuffer());
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_EDGE / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    return await canvasBlob(canvas, "image/jpeg", 0.8);
  } catch {
    return null;
  }
}

export async function loadPdf(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data }).promise;
}

/** 파일 고르는 즉시 띄우는 미리보기용. 올릴 때는 prepareImage의 결과를 쓴다. */
export const objectUrl = (blob: Blob) => URL.createObjectURL(blob);
