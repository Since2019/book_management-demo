import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const createAssetsTable = `CREATE TABLE IF NOT EXISTS cover_assets (
  filename TEXT PRIMARY KEY, media_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL
)`;

export async function GET(_request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  await env.DB.prepare(createAssetsTable).run();
  const params = await context.params;
  let filename: string;
  try {
    filename = decodeURIComponent(params.filename);
  } catch {
    return new Response("Invalid cover filename", { status: 400 });
  }
  if (!filename || filename.length > 200 || filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") {
    return new Response("Invalid cover filename", { status: 400 });
  }
  const asset = await env.DB.prepare("SELECT media_type AS mediaType, data FROM cover_assets WHERE filename = ?")
    .bind(filename).first<{ mediaType: string; data: ArrayBuffer | number[] }>();
  if (!asset) return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  const bytes = Array.isArray(asset.data) ? Uint8Array.from(asset.data) : new Uint8Array(asset.data);
  if (!bytes.byteLength) return NextResponse.json({ error: "图片数据为空。" }, { status: 404 });
  return new Response(bytes, { headers: { "Content-Type": asset.mediaType, "Content-Length": String(bytes.byteLength), "Cache-Control": "no-store" } });
}
