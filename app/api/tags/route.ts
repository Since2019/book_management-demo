import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const createTagsTable = `
  CREATE TABLE IF NOT EXISTS tag_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

async function ready() {
  await env.DB.prepare(createTagsTable).run();
}

export async function GET() {
  await ready();
  const result = await env.DB.prepare(
    "SELECT id, name, category, color FROM tag_definitions ORDER BY category, id",
  ).all();
  return NextResponse.json({ tags: result.results });
}

export async function POST(request: NextRequest) {
  await ready();
  const body = (await request.json()) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "自定义").trim() || "自定义";
  const color = String(body.color ?? "#6b7280").trim();
  if (!name) return NextResponse.json({ error: "请输入标签名称。" }, { status: 400 });
  try {
    const result = await env.DB.prepare(
      "INSERT INTO tag_definitions (name, category, color, created_at) VALUES (?, ?, ?, ?)",
    ).bind(name, category, color, new Date().toISOString()).run();
    return NextResponse.json({ id: result.meta.last_row_id, name, category, color }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "标签名称已存在。" }, { status: 409 });
  }
}

export async function PUT(request: NextRequest) {
  await ready();
  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "自定义").trim() || "自定义";
  const color = String(body.color ?? "#6b7280").trim();
  if (!Number.isInteger(id) || !name) return NextResponse.json({ error: "标签数据无效。" }, { status: 400 });
  try {
    await env.DB.prepare("UPDATE tag_definitions SET name = ?, category = ?, color = ? WHERE id = ?")
      .bind(name, category, color, id).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "标签名称已存在。" }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  await ready();
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "无效标签。" }, { status: 400 });
  await env.DB.prepare("DELETE FROM tag_definitions WHERE id = ?").bind(id).run();
  return NextResponse.json({ ok: true });
}
