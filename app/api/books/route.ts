import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const createTable = `
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    publisher TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    isbn TEXT NOT NULL DEFAULT '',
    unified_book_number TEXT NOT NULL DEFAULT '',
    call_number TEXT NOT NULL DEFAULT '',
    edition TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    volume TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    cover_image TEXT NOT NULL DEFAULT '',
    storage_location TEXT NOT NULL DEFAULT '',
    box_id INTEGER,
    tags TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    saved_at TEXT NOT NULL
  )
`;

async function ready() {
  await env.DB.prepare(createTable).run();
  const columns = await env.DB.prepare("PRAGMA table_info(books)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "storage_location")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN storage_location TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "tags")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN tags TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "box_id")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN box_id INTEGER").run();
  }
  if (!columns.results.some((column) => column.name === "volume")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN volume TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "note")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN note TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "quantity")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!columns.results.some((column) => column.name === "cover_image")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "unified_book_number")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN unified_book_number TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "sort_order")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
    await env.DB.prepare("UPDATE books SET sort_order = -id").run();
  }
}

const selectBooks = `
  SELECT id, source_id AS sourceId, title, author, publisher, year, isbn, unified_book_number AS unifiedBookNumber,
         call_number AS callNumber, edition, language, volume, note, quantity, cover_image AS coverImage,
         storage_location AS storageLocation, box_id AS boxId, tags, saved_at AS savedAt
  FROM books ORDER BY sort_order ASC, id DESC
`;

function coverRoute(value: unknown) {
  const route = String(value ?? "");
  if (!route.startsWith("/api/covers/")) return "";
  try {
    const filename = decodeURIComponent(route.slice("/api/covers/".length));
    if (!filename || filename.length > 200 || filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") return "";
    return `/api/covers/${encodeURIComponent(filename)}`;
  } catch {
    return "";
  }
}

function fields(book: Record<string, unknown>) {
  const volumes = String(book.volume ?? "").split(",").map((volume) => volume.trim()).filter((volume) => ["上", "中", "下"].includes(volume) || /^[1-9]\d{0,2}$/.test(volume));
  return [
    String(book.title ?? "").trim(),
    String(book.author ?? ""),
    String(book.publisher ?? ""),
    String(book.year ?? ""),
    String(book.isbn ?? ""),
    String(book.unifiedBookNumber ?? "").trim().replace(/[•‧∙・.．。\-－—–]/g, "·").replace(/\s+/g, "").slice(0, 100),
    String(book.callNumber ?? ""),
    String(book.edition ?? ""),
    String(book.language ?? ""),
    [...new Set(volumes)].join(","),
    String(book.note ?? ""),
    Math.min(999, Math.max(1, Math.trunc(Number(book.quantity) || 1))),
    String(book.coverImage ?? "").startsWith("data:image/")
      ? String(book.coverImage).slice(0, 1500000)
      : coverRoute(book.coverImage),
    String(book.storageLocation ?? ""),
    String(book.tags ?? ""),
    book.boxId === null || book.boxId === undefined || book.boxId === "" ? null : Number(book.boxId),
  ];
}

export async function GET() {
  await ready();
  const result = await env.DB.prepare(selectBooks).all();
  return NextResponse.json({ books: result.results });
}

export async function POST(request: NextRequest) {
  await ready();
  const book = (await request.json()) as Record<string, unknown>;
  const title = String(book.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "请填写书名。" }, { status: 400 });

  const originalSourceId = String(book.sourceId ?? "manual").trim() || "manual";
  const copySourceId = `${originalSourceId}-${crypto.randomUUID()}`;
  const nextOrder = await env.DB.prepare("SELECT COALESCE(MIN(sort_order), 1) - 1 AS value FROM books").first<{ value: number }>();
  await env.DB.prepare(`
    INSERT INTO books
      (source_id, title, author, publisher, year, isbn, unified_book_number, call_number, edition,
       language, volume, note, quantity, cover_image, storage_location, tags, box_id, sort_order, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(copySourceId, ...fields(book), nextOrder?.value ?? 0, new Date().toISOString()).run();
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  await ready();
  const body = (await request.json()) as { orderedIds?: unknown };
  const orderedIds = Array.isArray(body.orderedIds)
    ? [...new Set(body.orderedIds.map(Number).filter(Number.isInteger))]
    : [];
  if (!orderedIds.length || orderedIds.length > 5000) {
    return NextResponse.json({ error: "馆藏排序资料无效。" }, { status: 400 });
  }
  for (let index = 0; index < orderedIds.length; index += 100) {
    await env.DB.batch(orderedIds.slice(index, index + 100).map((id, offset) =>
      env.DB.prepare("UPDATE books SET sort_order = ? WHERE id = ?").bind(index + offset, id),
    ));
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  await ready();
  const book = (await request.json()) as Record<string, unknown>;
  const id = Number(book.id);
  const title = String(book.title ?? "").trim();
  if (!Number.isInteger(id) || !title) {
    return NextResponse.json({ error: "馆藏记录或书名无效。" }, { status: 400 });
  }
  const result = await env.DB.prepare(`
    UPDATE books SET title = ?, author = ?, publisher = ?, year = ?, isbn = ?, unified_book_number = ?,
      call_number = ?, edition = ?, language = ?, volume = ?, note = ?, quantity = ?, cover_image = ?, storage_location = ?, tags = ?, box_id = ?
    WHERE id = ?
  `).bind(...fields(book), id).run();
  if (!result.meta.changes) return NextResponse.json({ error: "没有找到这条馆藏。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  await ready();
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "无效记录。" }, { status: 400 });
  await env.DB.prepare("DELETE FROM books WHERE id = ?").bind(id).run();
  return NextResponse.json({ ok: true });
}
