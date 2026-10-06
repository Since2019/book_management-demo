import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("candidate images from catalog hosts persist bytes in the database", async () => {
  const db = new DatabaseSync(":memory:");
  const context = {
    exports: {}, URL, File, AbortSignal, crypto,
    require(name) {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "cloudflare:workers") return { env: { DB: {
        prepare(sql) {
          let args = [];
          return {
            bind(...values) { args = values.map(v => v instanceof ArrayBuffer ? new Uint8Array(v) : v); return this; },
            async run() { return db.prepare(sql).run(...args); },
            async first() { return db.prepare(sql).get(...args); },
          };
        },
      } } };
      throw new Error(name);
    },
    async fetch(url) {
      assert.equal(url.protocol, "https:");
      const response = new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
      Object.defineProperty(response, "url", { value: String(url) });
      return response;
    },
  };
  vm.runInNewContext(compile(await readFile(new URL("../app/api/cover-assets/route.ts", import.meta.url), "utf8")), context);
  try {
    for (const url of ["https://www0.kfzimg.com/sw/kfz-cos/kfzimg/ebccbdfd/be45e37234ce08f5_n.jpg", "http://book.kongfz.com/a.png", "https://www.kongfz.cn/b.png", "https://ndlsearch.ndl.go.jp/thumbnail/123.jpg"]) {
      const response = await context.exports.POST(new Request("http://localhost/api/cover-assets", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      }));
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      const row = db.prepare("SELECT data FROM cover_assets WHERE filename = ?").get(decodeURIComponent(body.coverImage.slice("/api/covers/".length)));
      assert.deepEqual([...row.data], [137, 80, 78, 71]);
    }
    const rejected = await context.exports.POST(new Request("http://localhost/api/cover-assets", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://kongfz.com.example.org/a.png" }),
    }));
    assert.equal(rejected.status, 400);
  } finally { db.close(); }
});

test("failed cover download keeps the form and never saves a book without its selected cover", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const handler = page.slice(page.indexOf("  async function saveBook("), page.indexOf("  async function deleteBook("));
  const calls = [];
  let pending = { sourceId: "example", title: "Test", coverUrl: "https://book.kongfz.com/a.png" };
  let message = "";
  const context = {
    AbortSignal, pendingBook: pending, setSavingId() {}, setMessage(value) { message = value; },
    setPendingBook(value) { pending = value; },
    async fetch(url) { calls.push(url); return Response.json({ error: "下载失败" }, { status: 400 }); },
    async loadBooks() {}, showToast() {},
  };
  vm.runInNewContext(compile(handler), context);
  await context.saveBook({ preventDefault() {} });
  assert.deepEqual(calls, ["/api/cover-assets"]);
  assert.equal(pending.title, "Test");
  assert.equal(message, "下载失败");
});

test("selecting a candidate saves its asset immediately and book save retains the local reference", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const selection = page.slice(page.indexOf("  async function selectCandidateCover("), page.indexOf("  async function moveBookBefore("));
  const save = page.slice(page.indexOf("  async function saveBook("), page.indexOf("  async function deleteBook("));
  const calls = [];
  const context = {
    AbortSignal, savingId: "", pendingBook: { sourceId: "example", title: "Test", coverImage: "/api/covers/old.png" },
    setSavingId(value) { context.savingId = value; }, setMessage() {}, showToast() {},
    setPendingBook(value) { context.pendingBook = typeof value === "function" ? value(context.pendingBook) : value; },
    async loadBooks() {},
    async fetch(url, options) {
      calls.push({ url, body: JSON.parse(options.body) });
      return Response.json(url === "/api/cover-assets" ? { coverImage: "/api/covers/new.png" } : { ok: true });
    },
  };
  vm.runInNewContext(compile(selection + save), context);
  const selecting = context.selectCandidateCover(context.pendingBook, "https://book.kongfz.com/new.png", true);
  assert.equal(context.pendingBook.coverUrl, "https://book.kongfz.com/new.png");
  assert.equal(context.pendingBook.coverImage, "");
  await selecting;
  assert.equal(context.pendingBook.coverImage, "/api/covers/new.png");
  await context.saveBook({ preventDefault() {} });
  assert.deepEqual(calls.map(call => call.url), ["/api/cover-assets", "/api/books"]);
  assert.equal(calls[1].body.coverImage, "/api/covers/new.png");
  assert.equal(context.pendingBook, null);
});

test("timed out selection unlocks saving and explicit skip allows book persistence", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const selection = page.slice(page.indexOf("  async function selectCandidateCover("), page.indexOf("  async function moveBookBefore("));
  const save = page.slice(page.indexOf("  async function saveBook("), page.indexOf("  async function deleteBook("));
  let message = "";
  const saved = [];
  const context = {
    Error, AbortSignal: { timeout(ms) { assert.equal(ms, 15000); return AbortSignal.abort(); } },
    savingId: "", pendingBook: { sourceId: "example", title: "Test", coverUrl: "https://book.kongfz.com/image.png", note: "保留备注" },
    setSavingId(value) { context.savingId = value; },
    setMessage(value) { message = value; }, showToast() {},
    setPendingBook(value) { context.pendingBook = typeof value === "function" ? value(context.pendingBook) : value; },
    async loadBooks() {},
    async fetch(url, options) {
      if (url === "/api/cover-assets") {
        assert.ok(options.signal);
        // Simulate the browser aborting a stalled request at its deadline.
        throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      }
      saved.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    },
  };
  vm.runInNewContext(compile(selection + save), context);
  await context.selectCandidateCover(context.pendingBook, context.pendingBook.coverUrl, true);
  assert.equal(context.savingId, "");
  assert.match(message, /超时/);
  context.skipPendingCover();
  await context.saveBook({ preventDefault() {} });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].coverImage, "");
  assert.equal(saved[0].coverUrl, "");
  assert.equal(saved[0].note, "保留备注");
  assert.equal(context.pendingBook, null);
  assert.match(page.slice(page.indexOf('<form className="catalog-form"'), page.indexOf('{boxManagerOpen &&')), /role="alert"/);
});
