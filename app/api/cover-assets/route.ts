import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const createAssetsTable = `CREATE TABLE IF NOT EXISTS cover_assets (
  filename TEXT PRIMARY KEY, media_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL
)`;

const allowedRemoteHosts = new Set([
  "books.google.com",
  "books.googleusercontent.com",
  "covers.openlibrary.org",
  "archive.org",
  "isbn.ncl.edu.tw",
  "ndlsearch.ndl.go.jp",
]);

function isAllowedRemoteHost(hostname: string) {
  return allowedRemoteHosts.has(hostname)
    || /^ia\d+\.us\.archive\.org$/.test(hostname)
    || /^img\d+\.doubanio\.com$/.test(hostname)
    || /^(?:[a-z0-9-]+\.)*kongfz\.com$/.test(hostname)
    || /^(?:[a-z0-9-]+\.)*kongfz\.cn$/.test(hostname)
    || /^(?:[a-z0-9-]+\.)*kfzimg\.com$/.test(hostname);
}

function extension(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/gif") return "gif";
  if (mediaType === "image/webp") return "webp";
  return "jpg";
}

function safeStem(value: string) {
  const name = value.replaceAll("\\", "/").split("/").pop()?.replace(/\.[^.]*$/, "") ?? "cover";
  const cleaned = name.normalize("NFKC").replace(/[^a-zA-Z0-9\u3400-\u9fff._-]+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "");
  return (cleaned || "cover").slice(0, 120);
}

async function uniqueFilename(stem: string, suffix: string) {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${safeStem(stem)}-${date}`;
  let candidate = `${base}.${suffix}`;
  for (let index = 2; index < 1000; index += 1) {
    const exists = await env.DB.prepare("SELECT filename FROM cover_assets WHERE filename = ?").bind(candidate).first();
    if (!exists) return candidate;
    candidate = `${base}-${index}.${suffix}`;
  }
  return `${base}-${crypto.randomUUID()}.${suffix}`;
}

async function saveImage(bytes: ArrayBuffer, mediaType: string, originalName: string) {
  if (!mediaType.match(/^image\/(?:jpeg|png|gif|webp)$/) || !bytes.byteLength || bytes.byteLength > MAX_IMAGE_SIZE) {
    throw new Error("图片格式不受支持或文件超过 12 MB。");
  }
  await env.DB.prepare(createAssetsTable).run();
  const filename = await uniqueFilename(originalName, extension(mediaType));
  await env.DB.prepare("INSERT INTO cover_assets (filename, media_type, data, created_at) VALUES (?, ?, ?, ?)")
    .bind(filename, mediaType, bytes, new Date().toISOString()).run();
  return `/api/covers/${encodeURIComponent(filename)}`;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "没有收到图片文件。" }, { status: 400 });
      const coverImage = await saveImage(await file.arrayBuffer(), file.type, file.name);
      return NextResponse.json({ coverImage });
    }

    const body = await request.json() as { url?: string; originalName?: string };
    const url = new URL(body.url ?? "");
    if (url.protocol === "http:" && isAllowedRemoteHost(url.hostname)) url.protocol = "https:";
    if (url.protocol !== "https:" || !isAllowedRemoteHost(url.hostname)) {
      return NextResponse.json({ error: "该封面来源不在允许列表中。" }, { status: 400 });
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!response.ok) throw new Error(`下载封面失败（HTTP ${response.status}）。`);
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" || !isAllowedRemoteHost(finalUrl.hostname)) throw new Error("封面下载发生了不安全的跳转。");
    const bytes = await response.arrayBuffer();
    const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    const originalName = body.originalName || decodeURIComponent(finalUrl.pathname.split("/").pop() || "cover");
    const coverImage = await saveImage(bytes, mediaType, originalName);
    return NextResponse.json({ coverImage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "图片保存失败。" }, { status: 400 });
  }
}
