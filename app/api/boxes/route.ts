import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const createTable = `CREATE TABLE IF NOT EXISTS boxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
)`;

async function ready() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '', publisher TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
    isbn TEXT NOT NULL DEFAULT '', call_number TEXT NOT NULL DEFAULT '', edition TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, storage_location TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
    saved_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(createTable).run();
  const columns = await env.DB.prepare("PRAGMA table_info(books)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "box_id")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN box_id INTEGER").run();
  }
  if (!columns.results.some((column) => column.name === "volume")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN volume TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "quantity")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1").run();
  }
}

export async function GET(request: NextRequest) {
  await ready();
  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (code) {
    const box = await env.DB.prepare(`SELECT id, code, name, category, location, note, created_at AS createdAt FROM boxes WHERE code = ?`).bind(code).first();
    if (!box) return NextResponse.json({ error: "没有找到这个箱码。" }, { status: 404 });
    const books = await env.DB.prepare(`SELECT id, title, author, isbn, call_number AS callNumber, volume, quantity FROM books WHERE box_id = ? ORDER BY call_number, title, volume`).bind(box.id).all();
    return NextResponse.json({ box, books: books.results });
  }
  const result = await env.DB.prepare(`SELECT b.id, b.code, b.name, b.category, b.location, b.note, b.created_at AS createdAt, COALESCE(SUM(k.quantity), 0) AS bookCount FROM boxes b LEFT JOIN books k ON k.box_id = b.id GROUP BY b.id ORDER BY b.code`).all();
  return NextResponse.json({ boxes: result.results });
}

export async function POST(request: NextRequest) {
  await ready();
  const value = await request.json() as Record<string, unknown>;
  const name = String(value.name ?? "").trim();
  const location = String(value.location ?? "").trim();
  const requested = String(value.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const code = requested || `BOX-${Date.now().toString(36).toUpperCase()}`;
  if (!name || !location) return NextResponse.json({ error: "请填写箱子名称和存放位置。" }, { status: 400 });
  try {
    await env.DB.prepare(`INSERT INTO boxes (code, name, category, location, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(code, name, String(value.category ?? "").trim(), location, String(value.note ?? "").trim(), new Date().toISOString()).run();
    return NextResponse.json({ ok: true, code }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "箱码已存在，请换一个箱码。" }, { status: 409 });
  }
}

export async function PUT(request: NextRequest) {
  await ready();
  const value = await request.json() as Record<string, unknown>;
  const id = Number(value.id);
  const code = String(value.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const name = String(value.name ?? "").trim();
  const location = String(value.location ?? "").trim();
  if (!Number.isInteger(id) || !code || !name || !location) {
    return NextResponse.json({ error: "请填写有效的箱码、箱子名称和存放位置。" }, { status: 400 });
  }
  try {
    const result = await env.DB.prepare(`
      UPDATE boxes SET code = ?, name = ?, category = ?, location = ?, note = ? WHERE id = ?
    `).bind(code, name, String(value.category ?? "").trim(), location, String(value.note ?? "").trim(), id).run();
    if (!result.meta.changes) return NextResponse.json({ error: "没有找到这个箱子。" }, { status: 404 });
    return NextResponse.json({ ok: true, code });
  } catch {
    return NextResponse.json({ error: "箱码已存在，请换一个箱码。" }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  await ready();
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "无效箱子。" }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("UPDATE books SET box_id = NULL WHERE box_id = ?").bind(id),
    env.DB.prepare("DELETE FROM boxes WHERE id = ?").bind(id),
  ]);
  return NextResponse.json({ ok: true });
}
