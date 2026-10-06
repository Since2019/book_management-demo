import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function search(q, mode = "isbn", fetchResponse) {
  const source = await readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8");
  const calls = [];
  const context = {
    exports: {}, URL, URLSearchParams, TextEncoder, AbortSignal, btoa,
    require(name) {
      if (name === "next/server") return { NextResponse: { json: (body) => body } };
      if (name === "cloudflare:workers") return { env: {} };
      if (name.endsWith("singapore-tcm-catalog.json")) return { default: [] };
      throw new Error(`Unexpected import: ${name}`);
    },
    async fetch(url, options) {
      calls.push({ url, options });
      if (fetchResponse) return fetchResponse(url, options);
      throw new Error("External catalog unavailable");
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const result = await context.exports.GET({ nextUrl: new URL(`http://localhost/api/search?${new URLSearchParams({ q, mode })}`) });
  return { result, calls };
}

test("uses exact ISBN matches from the Chinese catalog and rejects recommendations", async () => {
  const { result } = await search("9787511361172", "isbn", async (url) => {
    if (url.includes("kongfz.com")) return Response.json({ status: 1, data: { itemResponse: { list: [
      { isbn: "9787511307002", title: "同名不同版本" },
      { isbn: "9787511361172", title: "中华成语探源", author: "朱瑞玟", press: "中国华侨出版社", pubDateText: "2016-09" },
      { isbn: "9787511361172", title: "重复商品" },
    ] } } });
    if (url.includes("douban.com")) return new Response("Not found", { status: 404 });
    if (url.includes("calis.edu.cn")) return Response.json({ status: 504, msg: "验证码验证" });
    if (url.includes("googleapis.com")) return new Response("Rate limited", { status: 429 });
    throw new Error("Offline");
  });
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].title, "中华成语探源");
  assert.equal(result.books[0].source, "孔夫子旧书网");
  assert.ok(!result.unavailable.includes("豆瓣图书"));
  assert.equal(result.sourceErrors.find(e => e.source === "CALIS").type, "VerificationRequired");
  assert.equal(result.sourceErrors.find(e => e.source === "Google Books").status, 429);
});

test("handles numeric CALIS success status and does not treat it as failure", async () => {
  const { result } = await search("9787511361172", "isbn", async (url) => {
    if (url.includes("calis.edu.cn")) return Response.json({ status: 200, data: { instances: [
      { title: "中华成语探源", isbn: "9787511361172" },
    ] } });
    throw new Error("Offline");
  });
  assert.equal(result.books[0].source, "CALIS");
  assert.ok(!result.unavailable.includes("CALIS"));
});

test("does not fabricate an ISBN match when the Chinese catalog has only recommendations", async () => {
  const { result } = await search("9787511361172", "isbn", async (url) => {
    if (url.includes("kongfz.com")) return Response.json({ status: 1, data: { itemResponse: { list: [
      { isbn: "9787511307002", title: "同名不同版本" },
    ] } } });
    throw new Error("Offline");
  });
  assert.equal(result.books[0].source, "待手动编目");
});

test("finds the dictionary by ISBN even when external catalogs fail", async () => {
  for (const q of ["9787805430416", "978-7-80543-041-6\\"]) {
    const { result, calls } = await search(q);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].title, "甲金篆隶大字典");
    assert.equal(result.books[0].isbn, "9787805430416");
    assert.equal(result.normalizedIdentifier, "9787805430416");
    const calis = calls.find(({ url }) => url.includes("calis.edu.cn"));
    assert.equal(atob(JSON.parse(calis.options.body).query), '(bath.isbn="9787805430416*")');
  }
});

test("finds 甲骨文小字典 by ISBN even when external catalogs fail", async () => {
  const { result, calls } = await search("9787559620828");
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].title, "甲骨文小字典");
  assert.equal(result.books[0].author, "（日）落合淳思");
  assert.equal(result.books[0].isbn, "9787559620828");
  const calis = calls.find(({ url }) => url.includes("calis.edu.cn"));
  assert.equal(atob(JSON.parse(calis.options.body).query), '(bath.isbn="9787559620828*")');
});

test("finds 甲骨文字释林 by ISBN even when external catalogs fail", async () => {
  const { result } = await search("9787101067187");
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].title, "甲骨文字释林");
  assert.equal(result.books[0].author, "于省吾");
  assert.equal(result.books[0].publisher, "中华书局");
  assert.equal(result.books[0].year, "2009");
});

test("finds 郭店楚墓竹简·缁衣 by ISBN even when external catalogs fail", async () => {
  const { result } = await search("9787501013685");
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].title, "郭店楚墓竹简·缁衣");
  assert.equal(result.books[0].author, "《简帛书法选》编辑组");
  assert.equal(result.books[0].publisher, "文物出版社");
  assert.equal(result.books[0].year, "2002");
});

test("keyword searches include supplemental titles, authors, and publishers", async () => {
  for (const q of ["甲金篆隶大字典", "《甲金篆隶大字典》", "徐无闻", "四川辞书出版社"]) {
    const { result } = await search(q, "keyword");
    assert.ok(result.books.some((book) => book.isbn === "9787805430416"));
  }
  const { result } = await search("读杜心解", "keyword");
  assert.equal(result.books[0].isbn, "");
  assert.equal(result.books[0].unifiedBookNumber, "10018·309");
  const empty = await search("不存在的测试书目", "keyword");
  assert.equal(empty.result.books.length, 0);
});
