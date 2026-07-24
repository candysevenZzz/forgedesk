const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 256;
const TARGET_BYTES = 80 * 1024;
const QUALITY_LEVELS = [0.82, 0.72, 0.62, 0.54];

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("浏览器无法压缩这张头像图片"))),
      "image/webp",
      quality,
    );
  });
}

function readDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取压缩后的头像图片"));
    reader.readAsDataURL(blob);
  });
}

async function loadImage(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export type CompressedAvatar = {
  dataUrl: string;
  sizeBytes: number;
};

/**
 * 头像展示尺寸很小，保留原图分辨率只会增加上传、下载和数据库占用。
 * 统一转为 256px 以内的 WebP，并逐级降低质量和尺寸，目标限制为 80KB。
 */
export async function compressAvatar(file: File): Promise<CompressedAvatar> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("请选择 PNG、JPEG 或 WebP 图片");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("原始头像不能超过 12 MB");
  }

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("头像图片尺寸无效");
  }

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = Math.min(1, MAX_DIMENSION / longestSide);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持头像图片压缩");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_LEVELS) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= TARGET_BYTES) {
        return { dataUrl: await readDataUrl(blob), sizeBytes: blob.size };
      }
    }
    scale *= 0.72;
  }
  throw new Error("这张图片无法压缩到 80 KB 以内，请换一张更简单的头像");
}
