import { ApiFailure, api, unwrap } from "./api";
import { pdfThumb, prepareImage } from "./image";

const MB = 1024 * 1024;

export type UploadCategory = "material" | "student" | "screenshot" | "cover";

export const maxBytes = (category: UploadCategory) => (category === "screenshot" ? 10 * MB : category === "student" ? 50 * MB : 100 * MB);

export const tooLargeMessage = (category: UploadCategory) => `${maxBytes(category) / MB}MB까지 올릴 수 있어요. 더 작은 파일을 골라 주세요.`;

/** 서버가 서명에 넣은 헤더(Content-Type, If-None-Match)를 그대로 보낸다. */
function put(url: string, body: Blob, headers: Record<string, string>, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiFailure(xhr.status, "upload_failed", "파일을 올리지 못했어요. 다시 시도해 주세요.")));
    xhr.onerror = () => reject(new ApiFailure(0, "network", "파일을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."));
    xhr.send(body);
  });
}

/** 줄이고, 주소를 받고, R2에 직접 올리고, 서버에 확인받는다 (plan.md 12.2). */
export async function uploadFile(
  original: File,
  ctx: { courseId?: string; lectureId?: string; category: UploadCategory },
  onProgress?: (fraction: number) => void,
): Promise<{ fileId: string; filename: string; mime: string; size: number }> {
  const prepared = await prepareImage(original);
  const thumb = prepared.thumb ?? (original.type === "application/pdf" ? await pdfThumb(original) : null);
  const file = prepared.file;
  const mime = file.type || "application/octet-stream";
  if (file.size > maxBytes(ctx.category)) throw new ApiFailure(413, "too_large", tooLargeMessage(ctx.category));

  const started = await unwrap(
    api.uploads.$post({
      json: { courseId: ctx.courseId, lectureId: ctx.lectureId, filename: file.name, mime, size: file.size, category: ctx.category, thumbSize: thumb?.size },
    }),
  );
  await put(started.uploadUrl, file, started.headers, onProgress);
  if (thumb && started.thumbUploadUrl && started.thumbHeaders) await put(started.thumbUploadUrl, thumb, started.thumbHeaders).catch(() => undefined);
  await unwrap(api.uploads[":fileId"].complete.$post({ param: { fileId: started.fileId }, json: { width: prepared.width, height: prepared.height } }));
  return { fileId: started.fileId, filename: file.name, mime, size: file.size };
}
