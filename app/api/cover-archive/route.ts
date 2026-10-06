import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { unzipSync, zipSync } from "fflate";

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024;
const MAX_IMAGE_SIZE = 1500000;
const createAssetsTable = `CREATE TABLE IF NOT EXISTS cover_assets (
  filename TEXT PRIMARY KEY, media_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL
)`;

function safeFilename(value: string) {
  const name = value.replaceAll("\\", "/").split("/").pop() ?? "";
  return name && name.length <= 200 && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\") ? name : "";
}

function extension(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/gif") return "gif";
  return "webp";
}

function decodeDataUrl(value: string) {
  const match = /^data:(image\/(?:webp|png|jpeg|gif));base64,(.+)$/s.exec(value);
  if (!match) return null;
  return { mediaType: match[1], bytes: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)) };
}

export async function GET() {
  await env.DB.prepare(createAssetsTable).run();
  const [assetResult, legacyResult] = await Promise.all([
    env.DB.prepare("SELECT filename, data FROM cover_assets ORDER BY filename").all<{ filename: string; data: ArrayBuffer }>(),
    env.DB.prepare("SELECT id, cover_image AS coverImage FROM books WHERE cover_image LIKE 'data:image/%'").all<{ id: number; coverImage: string }>(),
  ]);
  const files: Record<string, Uint8Array> = {};
  for (const asset of assetResult.results) files[`covers/${asset.filename}`] = new Uint8Array(asset.data);
  for (const book of legacyResult.results) {
    const decoded = decodeDataUrl(book.coverImage);
    if (decoded) files[`covers/cover-${book.id}.${extension(decoded.mediaType)}`] = decoded.bytes;
  }
  const archive = zipSync(files, { level: 6 });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(archive, { headers: {
    "Cache-Control": "no-store",
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="book-covers-${date}.zip"`,
  } });
}

export async function POST(request: NextRequest) {
  await env.DB.prepare(createAssetsTable).run();
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_ARCHIVE_SIZE) return NextResponse.json({ error: "图片包不能超过 100 MB，请拆分后导入。" }, { status: 413 });
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(buffer)); }
  catch { return NextResponse.json({ error: "所选文件不是有效的 ZIP 图片包。" }, { status: 400 }); }
  const statements = [];
  let imported = 0;
  for (const [path, bytes] of Object.entries(files)) {
    const filename = safeFilename(path);
    const suffix = filename.split(".").pop()?.toLowerCase();
    const mediaType = suffix === "png" ? "image/png" : suffix === "jpg" || suffix === "jpeg" ? "image/jpeg" : suffix === "gif" ? "image/gif" : suffix === "webp" ? "image/webp" : "";
    if (!filename || !mediaType || !bytes.length || bytes.length > MAX_IMAGE_SIZE) continue;
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO cover_assets (filename, media_type, data, created_at) VALUES (?, ?, ?, ?)").bind(filename, mediaType, bytes.buffer, new Date().toISOString()));
    imported += 1;
  }
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  return NextResponse.json({ ok: true, imported });
}
