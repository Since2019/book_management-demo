import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const MAX_IMPORT_BOOKS = 5000;
const MAX_IMPORT_TAGS = 500;
const MAX_IMPORT_BOXES = 2000;

const createBooksTable = `
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
    tags TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    saved_at TEXT NOT NULL
  )
`;

const createTagsTable = `
  CREATE TABLE IF NOT EXISTS tag_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;
const createBoxesTable = `CREATE TABLE IF NOT EXISTS boxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '', location TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
)`;

type ImportedBook = Record<string, unknown>;
type ImportedTag = { id?: unknown; name?: unknown; category?: unknown; color?: unknown };

function text(value: unknown, maxLength = 2000) {
  return String(value ?? "").slice(0, maxLength);
}

function importedTagIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
  if (typeof value !== "string" || !value.trim().startsWith("[")) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

function validSavedAt(value: unknown) {
  const candidate = text(value, 100);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : new Date().toISOString();
}

function validVolumes(value: unknown) {
  return [...new Set(text(value, 1000).split(",").map((volume) => volume.trim()).filter((volume) => ["上", "中", "下"].includes(volume) || /^[1-9]\d{0,2}$/.test(volume)))].join(",");
}

function exportedCoverFilename(id: unknown, value: unknown) {
  const cover = text(value, 1500000);
  if (cover.startsWith("/api/covers/")) return decodeURIComponent(cover.slice("/api/covers/".length));
  const mediaType = /^data:(image\/(?:webp|png|jpeg|gif));base64,/.exec(cover)?.[1];
  if (!mediaType) return "";
  const suffix = mediaType === "image/png" ? "png" : mediaType === "image/jpeg" ? "jpg" : mediaType === "image/gif" ? "gif" : "webp";
  return `cover-${Number(id)}.${suffix}`;
}

function importedCoverRoute(value: unknown) {
  const filename = text(value, 200).replaceAll("\\", "/").split("/").pop() ?? "";
  return filename && filename !== "." && filename !== ".." && !filename.includes("/") && !filename.includes("\\")
    ? `/api/covers/${encodeURIComponent(filename)}`
    : "";
}

async function ready() {
  await env.DB.batch([
    env.DB.prepare(createBooksTable),
    env.DB.prepare(createTagsTable),
    env.DB.prepare(createBoxesTable),
  ]);
  const columns = await env.DB.prepare("PRAGMA table_info(books)").all<{ name: string }>();
  const additions = [];
  if (!columns.results.some((column: { name: string }) => column.name === "storage_location")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN storage_location TEXT NOT NULL DEFAULT ''"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "tags")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN tags TEXT NOT NULL DEFAULT ''"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "box_id")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN box_id INTEGER"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "volume")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN volume TEXT NOT NULL DEFAULT ''"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "note")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN note TEXT NOT NULL DEFAULT ''"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "quantity")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "cover_image")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''"));
  }
  if (!columns.results.some((column: { name: string }) => column.name === "unified_book_number")) {
    additions.push(env.DB.prepare("ALTER TABLE books ADD COLUMN unified_book_number TEXT NOT NULL DEFAULT ''"));
  }
  if (additions.length) await env.DB.batch(additions);
  if (!columns.results.some((column: { name: string }) => column.name === "sort_order")) {
    await env.DB.prepare("ALTER TABLE books ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
    await env.DB.prepare("UPDATE books SET sort_order = -id").run();
  }
}

async function inBatches(statements: ReturnType<typeof env.DB.prepare>[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await env.DB.batch(statements.slice(index, index + 100));
  }
}

export async function GET() {
  await ready();
  const [bookResult, boxResult, tagResult] = await Promise.all([
    env.DB.prepare(`
      SELECT id, source_id AS sourceId, title, author, publisher, year, isbn, unified_book_number AS unifiedBookNumber,
             call_number AS callNumber, edition, language, volume, note, quantity, cover_image AS coverImage,
             storage_location AS storageLocation, box_id AS boxId, tags, sort_order AS sortOrder, saved_at AS savedAt
      FROM books ORDER BY sort_order ASC, id ASC
    `).all(),
    env.DB.prepare(`SELECT id, code, name, category, location, note, created_at AS createdAt FROM boxes ORDER BY id ASC`).all(),
    env.DB.prepare(`
      SELECT id, name, category, color, created_at AS createdAt
      FROM tag_definitions ORDER BY id ASC
    `).all(),
  ]);
  const date = new Date().toISOString().slice(0, 10);
  const exportedBooks = (bookResult.results as Record<string, unknown>[]).map(({ id, coverImage, ...book }) => ({
    ...book,
    coverImage: exportedCoverFilename(id, coverImage),
  }));
  return NextResponse.json({
    format: "book-management-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    books: exportedBooks,
    tags: tagResult.results,
    boxes: boxResult.results,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="book-library-${date}.json"`,
    },
  });
}

export async function POST(request: NextRequest) {
  await ready();
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "文件不是有效的 JSON。" }, { status: 400 });
  }

  if (payload.format !== "book-management-backup" || ![1, 2].includes(Number(payload.version))) {
    return NextResponse.json({ error: "这不是书栈导出的数据文件，或文件版本暂不支持。" }, { status: 400 });
  }
  if (!Array.isArray(payload.books) || !Array.isArray(payload.tags)) {
    return NextResponse.json({ error: "导入文件缺少书籍或标签数据。" }, { status: 400 });
  }
  const importedBoxes = Array.isArray(payload.boxes) ? payload.boxes as Record<string, unknown>[] : [];
  if (
    payload.books.length > MAX_IMPORT_BOOKS
    || payload.tags.length > MAX_IMPORT_TAGS
    || importedBoxes.length > MAX_IMPORT_BOXES
  ) {
    return NextResponse.json({
      error: `单次最多导入 ${MAX_IMPORT_BOOKS} 册书、${MAX_IMPORT_TAGS} 个标签和 ${MAX_IMPORT_BOXES} 个箱子。`,
    }, { status: 400 });
  }
  const existingBoxCodes = new Set((await env.DB.prepare("SELECT code FROM boxes").all<{ code: string }>()).results.map((box) => box.code));
  const boxStatements = importedBoxes.flatMap((box) => {
    const code = text(box.code, 100).trim().toUpperCase(); const name = text(box.name, 200).trim(); const location = text(box.location).trim();
    if (!code || !name || !location || existingBoxCodes.has(code)) return [];
    existingBoxCodes.add(code);
    return [env.DB.prepare("INSERT INTO boxes (code, name, category, location, note, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(code, name, text(box.category, 200), location, text(box.note), validSavedAt(box.createdAt))];
  });
  await inBatches(boxStatements);
  const currentBoxes = await env.DB.prepare("SELECT id, code FROM boxes").all<{ id: number; code: string }>();
  const boxIdByCode = new Map(currentBoxes.results.map((box) => [box.code, box.id]));
  const importedBoxCodeById = new Map(importedBoxes.map((box) => [Number(box.id), text(box.code, 100).trim().toUpperCase()]));
  const importedTags = payload.tags as ImportedTag[];
  const existingTags = await env.DB.prepare("SELECT id, name FROM tag_definitions").all<{ id: number; name: string }>();
  const existingTagNames = new Set(existingTags.results.map((tag: { id: number; name: string }) => tag.name));
  const tagStatements = importedTags.flatMap((tag) => {
    if (!tag || typeof tag !== "object" || Array.isArray(tag)) return [];
    const name = text(tag.name, 100).trim();
    if (!name || existingTagNames.has(name)) return [];
    existingTagNames.add(name);
    return [env.DB.prepare(`
      INSERT OR IGNORE INTO tag_definitions (name, category, color, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(name, text(tag.category, 100) || "自定义", text(tag.color, 20) || "#78658f", new Date().toISOString())];
  });
  await inBatches(tagStatements);

  const currentTags = await env.DB.prepare("SELECT id, name FROM tag_definitions").all<{ id: number; name: string }>();
  const currentTagIdByName = new Map(currentTags.results.map((tag: { id: number; name: string }) => [tag.name, tag.id]));
  const importedTagNameById = new Map<number, string>();
  for (const tag of importedTags) {
    if (!tag || typeof tag !== "object" || Array.isArray(tag)) continue;
    const oldId = Number(tag.id);
    const name = text(tag.name, 100).trim();
    if (Number.isInteger(oldId) && name) importedTagNameById.set(oldId, name);
  }

  const sourceResult = await env.DB.prepare("SELECT source_id AS sourceId FROM books").all<{ sourceId: string }>();
  const sourceIds = new Set(sourceResult.results.map((book: { sourceId: string }) => book.sourceId));
  let skipped = 0;
  const bookStatements = (payload.books as ImportedBook[]).flatMap((book, importIndex) => {
    if (!book || typeof book !== "object" || Array.isArray(book)) {
      skipped += 1;
      return [];
    }
    const title = text(book.title).trim();
    if (!title) {
      skipped += 1;
      return [];
    }
    const importedSourceId = text(book.sourceId, 500).trim();
    const sourceId = importedSourceId || `import-${crypto.randomUUID()}`;
    if (sourceIds.has(sourceId)) {
      skipped += 1;
      return [];
    }
    sourceIds.add(sourceId);
    const mappedTagIds = importedTagIds(book.tags).flatMap((oldId) => {
      const name = importedTagNameById.get(oldId);
      const newId = name ? currentTagIdByName.get(name) : undefined;
      return newId ? [newId] : [];
    });
    const tags = mappedTagIds.length
      ? JSON.stringify([...new Set(mappedTagIds)])
      : (typeof book.tags === "string" && !book.tags.trim().startsWith("[") ? text(book.tags) : "");
    return [env.DB.prepare(`
      INSERT INTO books
        (source_id, title, author, publisher, year, isbn, unified_book_number, call_number, edition,
         language, volume, note, quantity, cover_image, storage_location, tags, box_id, sort_order, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sourceId, title, text(book.author), text(book.publisher), text(book.year, 100),
      text(book.isbn, 100), text(book.unifiedBookNumber, 100), text(book.callNumber, 200), text(book.edition, 200),
      text(book.language, 100), validVolumes(book.volume),
      text(book.note), Math.min(999, Math.max(1, Math.trunc(Number(book.quantity) || 1))),
      importedCoverRoute(book.coverImage),
      text(book.storageLocation), tags,
      boxIdByCode.get(importedBoxCodeById.get(Number(book.boxId)) ?? "") ?? null,
      Number.isFinite(Number(book.sortOrder)) ? Number(book.sortOrder) : importIndex,
      validSavedAt(book.savedAt),
    )];
  });
  await inBatches(bookStatements);

  return NextResponse.json({
    ok: true,
    imported: bookStatements.length,
    skipped,
    tagsCreated: tagStatements.length,
    boxesCreated: boxStatements.length,
  });
}
