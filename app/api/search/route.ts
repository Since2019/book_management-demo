import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import singaporeCatalog from "@/data/singapore-tcm-catalog.json";

const CALIS_API =
  "https://opac2.calis.edu.cn/prod-api/opac/codex/ekb/opac/bibliography/simple/instances/1.0";

type RawRecord = Record<string, unknown>;
type SingaporeCatalogRecord = { i: string; t: string; a?: string; e?: string; p?: string; y?: string; c?: string };
type Book = {
  sourceId: string;
  source: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  isbn: string;
  unifiedBookNumber?: string;
  callNumber: string;
  edition: string;
  language: string;
  coverUrl?: string;
  coverCandidates?: string[];
};

const SUPPLEMENTAL_BOOKS: Record<string, Book> = {
  "9787501013685": {
    sourceId: "supplemental-9787501013685",
    source: "本地补充书目",
    title: "郭店楚墓竹简·缁衣",
    author: "《简帛书法选》编辑组",
    publisher: "文物出版社",
    year: "2002",
    isbn: "9787501013685",
    callNumber: "",
    edition: "简帛书法选；平装，54页",
    language: "zh-CN",
  },
  "9787101067187": {
    sourceId: "supplemental-9787101067187",
    source: "本地补充书目",
    title: "甲骨文字释林",
    author: "于省吾",
    publisher: "中华书局",
    year: "2009",
    isbn: "9787101067187",
    callNumber: "K877.14",
    edition: "中国文库·第四辑",
    language: "zh-CN",
  },
  "9787559620828": {
    sourceId: "supplemental-9787559620828",
    source: "本地补充书目",
    title: "甲骨文小字典",
    author: "（日）落合淳思",
    publisher: "北京联合出版公司",
    year: "2018",
    isbn: "9787559620828",
    callNumber: "K877.1-6",
    edition: "刘幸、张浩 译",
    language: "zh-CN",
  },
  // ISBN/title/publisher verified: https://www.jd.com/xinghao/17135784f24c251ac4f9.html
  "9787805430416": {
    sourceId: "supplemental-9787805430416",
    source: "本地补充书目",
    title: "甲金篆隶大字典",
    author: "徐无闻 主编",
    publisher: "四川辞书出版社",
    year: "",
    isbn: "9787805430416",
    callNumber: "",
    edition: "",
    language: "zh-CN",
  },
  "10018·309": {
    sourceId: "supplemental-unified-10018-309",
    source: "本地补充书目",
    title: "读杜心解",
    author: "（清）浦起龙",
    publisher: "中华书局",
    year: "",
    isbn: "10018·309",
    callNumber: "",
    edition: "旧版统一书号",
    language: "zh-CN",
  },
  "7306005081": {
    sourceId: "supplemental-7306005081",
    source: "本地补充书目",
    title: "六莹堂集",
    author: "（清）梁佩兰",
    publisher: "中山大学出版社",
    year: "1992",
    isbn: "7306005081",
    callNumber: "",
    edition: "吕永光点校",
    language: "zh-CN",
  },
  "9786263863972": {
    sourceId: "supplemental-9786263863972",
    source: "本地补充书目",
    title: "嶺海詩蹤",
    author: "黃坤堯",
    publisher: "萬卷樓圖書股份有限公司",
    year: "2026",
    isbn: "9786263863972",
    callNumber: "",
    edition: "初版",
    language: "zh-TW",
  },
  "9787805180434": {
    sourceId: "supplemental-9787805180434",
    source: "本地补充书目",
    title: "文献通考",
    author: "（元）马端临",
    publisher: "浙江古籍出版社",
    year: "2000",
    isbn: "9787805180434",
    callNumber: "",
    edition: "影印本，全二册（套装；原 ISBN 7805180431）",
    language: "zh-CN",
  },
  "7805180431": {
    sourceId: "supplemental-7805180431",
    source: "本地补充书目",
    title: "文献通考",
    author: "（元）马端临",
    publisher: "浙江古籍出版社",
    year: "2000",
    isbn: "7805180431",
    callNumber: "",
    edition: "影印本，全二册（套装）",
    language: "zh-CN",
  },
  "7536303645": {
    sourceId: "supplemental-7536303645",
    source: "本地补充书目",
    title: "观甲诊病",
    author: "覃保霖",
    publisher: "广西民族出版社",
    year: "1988",
    isbn: "7536303645",
    callNumber: "",
    edition: "32开，92页",
    language: "zh-CN",
  },
  "9787536303645": {
    sourceId: "supplemental-9787536303645",
    source: "本地补充书目",
    title: "观甲诊病",
    author: "覃保霖",
    publisher: "广西民族出版社",
    year: "1988",
    isbn: "9787536303645",
    callNumber: "",
    edition: "32开，92页（原 ISBN 7536303645）",
    language: "zh-CN",
  },
};

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("；");
  if (value && typeof value === "object") {
    const item = value as RawRecord;
    return text(item.name ?? item.value ?? item.label ?? "");
  }
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function first(record: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function cleanIsbn(value: string): string {
  return value.replace(/^(?:ISBN|ISMN)[:：]?\s*/i, "").replace(/[^\dXx]/g, "").toUpperCase();
}

function normalizeCatalogText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s·・.,，。:：;；/\\()（）《》〈〉-]+/g, "");
}

function searchSingaporeCatalog(query: string): Book[] {
  const needle = normalizeCatalogText(query);
  if (!needle) return [];
  return (singaporeCatalog as SingaporeCatalogRecord[])
    .filter((record) => normalizeCatalogText(`${record.t} ${record.a ?? ""} ${record.p ?? ""} ${record.c ?? ""}`).includes(needle))
    .slice(0, 30)
    .map((record) => ({
      sourceId: `singapore-tcm-${record.i}`,
      source: "新加坡中医学院馆藏",
      title: record.t,
      author: record.a ?? "",
      publisher: record.p ?? "",
      year: record.y?.match(/(?:18|19|20)\d{2}/)?.[0] ?? "",
      isbn: "",
      callNumber: record.c ?? "",
      edition: record.e ?? "",
      language: "zh-CN",
    }));
}

function normalizeDoi(value: string): string {
  const normalized = value.trim()
    .replace(/^DOI[:：]?\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  return /^10\.\d{4,9}\/\S+$/i.test(normalized) ? normalized : "";
}

function normalizeIssn(value: string): string {
  const compact = value.replace(/^ISSN[:：]?\s*/i, "").replace(/[^\dXx]/g, "").toUpperCase();
  if (!/^\d{7}[\dX]$/.test(compact)) return "";
  const sum = compact.slice(0, 7).split("")
    .reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  const remainder = (11 - (sum % 11)) % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return compact[7] === expected ? `${compact.slice(0, 4)}-${compact.slice(4)}` : "";
}

function normalizeIsmn(value: string): string {
  const raw = value.trim().replace(/^ISMN[:：]?\s*/i, "").toUpperCase();
  const oldStyle = raw.replace(/[^M\d]/g, "");
  const compact = oldStyle.startsWith("M") ? `9790${oldStyle.slice(1)}` : raw.replace(/\D/g, "");
  return compact.startsWith("9790") && isValidGtin13(compact) ? compact : "";
}

function normalizeUnifiedBookNumber(value: string): string {
  const normalized = value.trim()
    .replace(/^(?:国内)?统一书号[:：]?\s*/i, "")
    .replace(/[•‧∙・.．。\-－—–]/g, "·")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4,6})·(\d{1,6})$/);
  return match ? `${match[1]}·${match[2]}` : "";
}

function isValidGtin13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = value
    .slice(0, 12)
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

function issnFromSerialBarcode(value: string): string {
  if (!value.startsWith("977") || !isValidGtin13(value)) return "";
  const stem = value.slice(3, 10);
  const sum = stem.split("").reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  const remainder = (11 - (sum % 11)) % 11;
  const checkDigit = remainder === 10 ? "X" : String(remainder);
  return `${stem.slice(0, 4)}-${stem.slice(4)}${checkDigit}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function ciniiAppId(): string {
  return String((env as unknown as { CINII_APP_ID?: string }).CINII_APP_ID ?? "").trim();
}

async function searchCiniiBooks(query: string, exactIsbn = ""): Promise<Book[]> {
  const appid = ciniiAppId();
  if (!appid) return [];

  const params = new URLSearchParams({
    appid,
    format: "json",
    count: "20",
    type: "1",
  });
  if (exactIsbn) params.set("isbn", exactIsbn);
  else params.set("q", query.replace(/[·・•‧∙.．。\-－—–]+/g, " ").replace(/\s+/g, " ").trim());

  const response = await fetch(`https://ci.nii.ac.jp/books/opensearch/search?${params}`, {
    headers: {
      Accept: "application/ld+json, application/json",
      "User-Agent": "Shuzhi-Library/1.0 (CiNii Books search)",
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`CiNii Books HTTP ${response.status}`);
  const payload = (await response.json()) as { "@graph"?: RawRecord[] };
  const channel = payload["@graph"]?.find((entry) => text(entry["@type"]) === "channel") ?? payload["@graph"]?.[0];
  const items = Array.isArray(channel?.items) ? channel.items as RawRecord[] : [];

  return items.map((record, index) => {
    const permalink = text((record.link as RawRecord | undefined)?.["@id"] ?? record["@id"]);
    const ncid = permalink.match(/\/ncid\/([^/?#]+)/i)?.[1] ?? String(index);
    const identifiers = Array.isArray(record["dcterms:hasPart"])
      ? record["dcterms:hasPart"] as RawRecord[]
      : [];
    const foundIsbn = identifiers
      .map((identifier) => text(identifier["@id"]).match(/^urn:isbn:(.+)$/i)?.[1] ?? "")
      .map(cleanIsbn)
      .find(Boolean) ?? exactIsbn;
    const series = Array.isArray(record["dcterms:isPartOf"])
      ? (record["dcterms:isPartOf"] as RawRecord[]).map((part) => text(part["dc:title"])).filter(Boolean).join("；")
      : "";
    return {
      sourceId: `cinii-books-${ncid}`,
      source: "CiNii Books",
      title: text(record.title),
      author: text(record["dc:creator"]),
      publisher: text(record["dc:publisher"]),
      year: text(record["prism:publicationDate"] ?? record["dc:date"]).match(/(?:18|19|20)\d{2}/)?.[0] ?? "",
      isbn: foundIsbn,
      callNumber: "",
      edition: series,
      language: "",
    };
  }).filter((book) => book.title);
}

async function findNdlCover(isbn: string): Promise<string> {
  if (!isbn) return "";
  const url = `https://ndlsearch.ndl.go.jp/thumbnail/${encodeURIComponent(isbn)}.jpg`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Shuzhi-Library/1.0 (book-cover lookup)" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) return "";
  await response.body?.cancel();
  return url;
}

async function searchCalis(q: string, mode: string, serial = false, fieldOverride = ""): Promise<Book[]> {
  const safeQuery = q.replace(/["\\]/g, "");
  const field = fieldOverride || (mode === "callNumber"
    ? "bath.localclassification"
    : serial ? "bath.issn" : "bath.isbn");
  const response = await fetch(CALIS_API, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Referer: "https://opac2.calis.edu.cn/",
    },
    body: JSON.stringify({
      offset: 1,
      limit: 20,
      query: base64Utf8(`(${field}="${safeQuery}*")`),
      sortkey: "",
      lang: "zh-cn",
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`CALIS HTTP ${response.status}`);
  const payload = (await response.json()) as {
    status?: string | number;
    message?: string;
    msg?: string;
    data?: { instances?: RawRecord[] };
    instances?: RawRecord[];
  };
  if (payload.status && String(payload.status) !== "200") {
    const message = payload.message || payload.msg || "";
    if (/验证码/.test(message)) {
      const error = new Error("CALIS 需要在官网完成验证");
      error.name = "VerificationRequired";
      throw error;
    }
    throw new Error(message || `CALIS 状态 ${payload.status}`);
  }
  const records = payload.data?.instances ?? payload.instances ?? [];
  return records
    .map((record, index) => {
      const publication = first(record, ["publication", "publisher", "publishInfo"]);
      const isbn = cleanIsbn(first(record, ["isbn", "identifier", "allIdentifier"]));
      return {
        sourceId:
          first(record, ["rid", "id", "calisid", "calisId"]) ||
          `calis-${isbn || index}-${first(record, ["title"])}`,
        source: "CALIS",
        title: first(record, ["title", "unititle", "showval"]),
        author: first(record, ["contributor", "creator", "author"]),
        publisher: first(record, ["publisher", "publication"]),
        year:
          first(record, ["datepublication", "date", "year"]) ||
          publication.match(/(?:19|20)\d{2}/)?.[0] ||
          "",
        isbn,
        callNumber: first(record, ["classification", "callNumber", "callnumber", "CLC", "clc"]),
        edition: first(record, ["edition", "version"]),
        language: first(record, ["language", "codelanguage", "searchlang"]),
      };
    })
    .filter((book) => book.title);
}

async function searchIssnPortal(issn: string, barcode: string): Promise<Book[]> {
  const response = await fetch(`https://portal.issn.org/resource/ISSN/${encodeURIComponent(issn)}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; ShuzhiLibrary/1.0)",
    },
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`ISSN Portal HTTP ${response.status}`);
  const html = await response.text();
  const field = (key: string) => decodeHtml(
    html.match(new RegExp(`<dd[^>]+data-key=["']${key}["'][^>]*>([\\s\\S]*?)<\\/dd>`, "i"))?.[1] ?? "",
  );
  const properTitle = field("title-proper");
  const variantTitle = field("title-variants");
  const title = variantTitle || properTitle;
  if (!title) return [];
  return [{
    sourceId: `issn-portal-${issn}`,
    source: "ISSN Portal",
    title,
    author: "",
    publisher: field("publisher") || field("country"),
    year: "",
    isbn: barcode,
    callNumber: "",
    edition: `ISSN ${issn}`,
    language: "",
  }];
}

async function searchCrossrefDoi(doi: string): Promise<Book[]> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { "User-Agent": "Shuzhi-Library/1.0 (book-search)" },
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const payload = (await response.json()) as { message?: RawRecord };
  const record = payload.message;
  if (!record) return [];
  const authors = Array.isArray(record.author) ? (record.author as RawRecord[]).map((author) =>
    [text(author.given), text(author.family)].filter(Boolean).join(" "),
  ).filter(Boolean).join("；") : "";
  const published = record.published as { "date-parts"?: number[][] } | undefined;
  const title = text(record.title);
  if (!title) return [];
  return [{
    sourceId: `crossref-doi-${doi}`,
    source: "Crossref",
    title,
    author: authors,
    publisher: text(record.publisher) || text(record["container-title"]),
    year: String(published?.["date-parts"]?.[0]?.[0] ?? ""),
    isbn: doi,
    callNumber: "",
    edition: text(record.type),
    language: text(record.language),
  }];
}

async function searchGoogleBooksByNumber(number: string, label: string): Promise<Book[]> {
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(number)}&maxResults=10`,
    { signal: AbortSignal.timeout(25000) },
  );
  if (!response.ok) throw new Error(`Google Books HTTP ${response.status}`);
  const payload = (await response.json()) as { items?: Array<{ id?: string; volumeInfo?: RawRecord }> };
  return (payload.items ?? []).map((item, index) => {
    const info = item.volumeInfo ?? {};
    const imageLinks = info.imageLinks as RawRecord | undefined;
    return {
      sourceId: `google-${label.toLowerCase()}-${item.id || index}`,
      source: "Google Books",
      title: text(info.title),
      author: text(info.authors),
      publisher: text(info.publisher),
      year: text(info.publishedDate).match(/(?:19|20)\d{2}/)?.[0] ?? "",
      isbn: number,
      callNumber: "",
      edition: label,
      language: text(info.language),
      coverUrl: text(imageLinks?.thumbnail ?? imageLinks?.smallThumbnail).replace(/^http:/, "https:"),
    };
  }).filter((book) => book.title);
}

async function searchOpenLibraryByNumber(number: string, label: string): Promise<Book[]> {
  const response = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(number)}&limit=10&fields=key,title,author_name,publisher,first_publish_year,language,cover_i`,
    {
      headers: { "User-Agent": "Shuzhi-Library/1.0 (book-search)" },
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
  const payload = (await response.json()) as { docs?: RawRecord[] };
  return (payload.docs ?? []).map((record, index) => ({
    sourceId: `openlibrary-${label.toLowerCase()}-${text(record.key) || index}`,
    source: "Open Library",
    title: text(record.title),
    author: text(record.author_name),
    publisher: text(record.publisher),
    year: text(record.first_publish_year),
    isbn: number,
    callNumber: "",
    edition: label,
    language: text(record.language),
    coverUrl: record.cover_i
      ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(text(record.cover_i))}-M.jpg`
      : undefined,
  })).filter((book) => book.title);
}

async function searchInternetArchive(number: string): Promise<Book[]> {
  const compact = number.replace(/\D/g, "");
  const query = `(${JSON.stringify(number)} OR ${JSON.stringify(compact)})`;
  const params = new URLSearchParams({ q: query, rows: "10", output: "json" });
  for (const field of ["identifier", "title", "creator", "publisher", "date", "language"]) {
    params.append("fl[]", field);
  }
  const response = await fetch(`https://archive.org/advancedsearch.php?${params}`, {
    headers: { "User-Agent": "Shuzhi-Library/1.0 (book-search)" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Internet Archive HTTP ${response.status}`);
  const payload = (await response.json()) as { response?: { docs?: RawRecord[] } };
  return (payload.response?.docs ?? []).map((record, index) => ({
    sourceId: `internet-archive-${text(record.identifier) || index}`,
    source: "Internet Archive",
    title: text(record.title),
    author: text(record.creator),
    publisher: text(record.publisher),
    year: text(record.date).match(/(?:18|19|20)\d{2}/)?.[0] ?? "",
    isbn: number,
    callNumber: "",
    edition: "",
    language: text(record.language),
    coverUrl: record.identifier
      ? `https://archive.org/services/img/${encodeURIComponent(text(record.identifier))}`
      : undefined,
  })).filter((book) => book.title);
}

async function searchOpenLibrary(isbn: string): Promise<Book[]> {
  const response = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`,
    {
      headers: { "User-Agent": "Shuzhi-Library/1.0 (book-search)" },
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
  const payload = (await response.json()) as RawRecord;
  const record = payload[`ISBN:${isbn}`] as RawRecord | undefined;
  if (!record) return [];
  const authors = Array.isArray(record.authors)
    ? record.authors.map((item) => text(item)).filter(Boolean).join("；")
    : "";
  const publishers = Array.isArray(record.publishers)
    ? record.publishers.map((item) => text(item)).filter(Boolean).join("；")
    : text(record.publishers);
  const cover = record.cover as RawRecord | undefined;
  return [{
    sourceId: `openlibrary-${isbn}`,
    source: "Open Library",
    title: text(record.title),
    author: authors,
    publisher: publishers,
    year: text(record.publish_date).match(/(?:19|20)\d{2}/)?.[0] ?? "",
    isbn,
    callNumber: "",
    edition: "",
    language: "",
    coverUrl: text(cover?.medium ?? cover?.large ?? cover?.small),
  }].filter((book) => book.title);
}

async function searchGoogleBooks(isbn: string): Promise<Book[]> {
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=10`,
    { signal: AbortSignal.timeout(25000) },
  );
  if (!response.ok) throw new Error(`Google Books HTTP ${response.status}`);
  const payload = (await response.json()) as { items?: Array<{ id?: string; volumeInfo?: RawRecord }> };
  return (payload.items ?? []).map((item, index) => {
    const info = item.volumeInfo ?? {};
    const identifiers = Array.isArray(info.industryIdentifiers)
      ? (info.industryIdentifiers as RawRecord[])
      : [];
    const foundIsbn =
      identifiers.map((entry) => cleanIsbn(text(entry.identifier))).find(Boolean) || isbn;
    const imageLinks = info.imageLinks as RawRecord | undefined;
    return {
      sourceId: `google-${item.id || `${foundIsbn}-${index}`}`,
      source: "Google Books",
      title: text(info.title),
      author: text(info.authors),
      publisher: text(info.publisher),
      year: text(info.publishedDate).match(/(?:19|20)\d{2}/)?.[0] ?? "",
      isbn: foundIsbn,
      callNumber: "",
      edition: "",
      language: text(info.language),
      coverUrl: text(imageLinks?.thumbnail ?? imageLinks?.smallThumbnail).replace(/^http:/, "https:"),
    };
  }).filter((book) => book.title);
}

async function searchDouban(isbn: string): Promise<Book[]> {
  const response = await fetch(`https://book.douban.com/isbn/${encodeURIComponent(isbn)}/`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; ShuzhiLibrary/1.0)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`豆瓣图书 HTTP ${response.status}`);
  const html = await response.text();
  const meta = (property: string) =>
    decodeHtml(
      html.match(new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']*)`, "i"))?.[1] ?? "",
    );
  const info = html.match(/<div\s+id=["']info["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const field = (label: string) =>
    decodeHtml(
      info.match(new RegExp(`<span\\s+class=["']pl["'][^>]*>\\s*${label}\\s*:?\\s*<\\/span>\\s*:?([\\s\\S]*?)<br\\s*\\/?>`, "i"))?.[1] ?? "",
    );
  const title = meta("og:title");
  if (!title) return [];
  const subjectId = response.url.match(/\/subject\/(\d+)/)?.[1] ?? isbn;
  return [{
    sourceId: `douban-${subjectId}`,
    source: "豆瓣图书",
    title,
    author: field("作者").replace(/\s*\/\s*/g, "；"),
    publisher: field("出版社"),
    year: field("出版年").match(/(?:19|20)\d{2}/)?.[0] ?? "",
    isbn: cleanIsbn(field("ISBN")) || isbn,
    callNumber: "",
    edition: "",
    language: "zh",
    coverUrl: meta("og:image"),
  }];
}

async function searchKongfz(isbn: string): Promise<Book[]> {
  const params = new URLSearchParams({ keyword: isbn, page: "1" });
  const response = await fetch(`https://search.kongfz.com/pc-gw/search-web/client/pc/product/keyword/list?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`孔夫子旧书网 HTTP ${response.status}`);
  const payload = await response.json() as {
    status?: number | boolean;
    data?: { itemResponse?: { list?: RawRecord[] } };
  };
  if (payload.status !== 1 && payload.status !== true) throw new Error("孔夫子旧书网查询失败");
  const records = payload.data?.itemResponse?.list;
  if (!Array.isArray(records)) throw new Error("孔夫子旧书网响应格式异常");
  // Keyword results also contain recommendations: only accept the exact edition.
  const matching = records.filter((record) => cleanIsbn(text(record.isbn)) === isbn && text(record.title));
  const record = matching[0];
  if (!record) return [];
  return [{
    sourceId: `kongfz-isbn-${isbn}`,
    source: "孔夫子旧书网",
    title: text(record.title),
    author: text(record.author),
    publisher: text(record.press),
    year: text(record.pubDateText).match(/(?:18|19|20)\d{2}/)?.[0] ?? "",
    isbn,
    callNumber: "",
    edition: "",
    language: "zh-CN",
    coverUrl: text(record.imgBigUrl || record.imgUrl) || undefined,
  }];
}

function taiwanYear(value: string): string {
  const year = value.match(/\d{2,4}/)?.[0];
  if (!year) return "";
  const numeric = Number(year);
  return String(numeric < 1911 ? numeric + 1911 : numeric);
}

async function searchTaiwanNcl(isbn: string): Promise<Book[]> {
  const searchUrl = "https://isbn.ncl.edu.tw/NEW_ISBNNet/H30_SearchBooks.php?Pact=DisplayAll4Simple";
  const response = await fetch(searchUrl, {
    method: "POST",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Referer: "https://isbn.ncl.edu.tw/NEW_ISBNNet/H30_SearchBooks.php?Pact=DisplayAll4Simple",
      "User-Agent": "Mozilla/5.0 (compatible; ShuzhiLibrary/1.0)",
    },
    body: new URLSearchParams({
      FO_SearchField0: "ISBN",
      FO_SearchValue0: isbn,
      FB_clicked: "FB_開始查詢",
      FB_pageSID: "Simple",
      FO_Match: "2",
      "FO_每頁筆數": "10",
      "FO_目前頁數": "1",
      "FO_資料排序": "PubMonth_Pre DESC",
      FB_ListOri: "",
    }).toString(),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`台湾新书资讯网 HTTP ${response.status}`);
  const searchHtml = await response.text();
  if (/顯示查詢結果\s*\(\s*找到\s*0\s*筆/i.test(searchHtml)) return [];

  const href = decodeHtml(
    searchHtml.match(/href=["']([^"']*main_DisplayRecord_Popup\.php[^"']*)["']/i)?.[1] ?? "",
  );
  const detailUrl = href ? new URL(href, searchUrl).toString() : "";
  const detailResponse = detailUrl ? await fetch(detailUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Referer: searchUrl,
      "User-Agent": "Mozilla/5.0 (compatible; ShuzhiLibrary/1.0)",
    },
    signal: AbortSignal.timeout(25000),
  }) : null;
  const html = detailResponse?.ok ? await detailResponse.text() : searchHtml;
  const field = (...labels: string[]) => {
    for (const label of labels) {
      const index = html.toLowerCase().indexOf(label.toLowerCase());
      if (index < 0) continue;
      const following = html.slice(index + label.length, index + label.length + 2000);
      const inline = decodeHtml(following.match(/^[\s：:]*([^<\r\n]+)/)?.[1] ?? "");
      const nextCell = decodeHtml(following.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i)?.[1] ?? "");
      const value = inline || nextCell;
      if (value && value !== label) return value;
    }
    return "";
  };
  const title = field("書名", "题名", "Title");
  if (!title) return [];
  const coverPath = html.match(/<img[^>]+src=["']([^"']*(?:cover|FCKEDITOR_UploadFiles)[^"']*)["']/i)?.[1];
  return [{
    sourceId: `taiwan-ncl-${isbn}`,
    source: "台湾新书资讯网",
    title,
    author: field("作者", "著者", "責任者"),
    publisher: field("出版機構", "出版者", "出版社"),
    year: taiwanYear(field("出版年月", "出版日期")),
    isbn,
    callNumber: field("分類號", "分類號碼"),
    edition: field("版次", "裝訂方式"),
    language: "zh-TW",
    coverUrl: coverPath ? new URL(decodeHtml(coverPath), searchUrl).toString() : undefined,
  }];
}

function mergeBooks(groups: Book[][]): Book[] {
  const merged = new Map<string, Book>();
  for (const book of groups.flat()) {
    const key = book.isbn || `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...book, coverCandidates: book.coverUrl ? [book.coverUrl] : [] });
      continue;
    }
    const preferred = current.source === "CALIS" ? current : book.source === "CALIS" ? book : current;
    const other = preferred === current ? book : current;
    merged.set(key, {
      ...preferred,
      author: preferred.author || other.author,
      publisher: preferred.publisher || other.publisher,
      year: preferred.year || other.year,
      isbn: preferred.isbn || other.isbn,
      callNumber: preferred.callNumber || other.callNumber,
      edition: preferred.edition || other.edition,
      language: preferred.language || other.language,
      coverUrl: preferred.coverUrl || other.coverUrl,
      coverCandidates: [...new Set([
        ...(preferred.coverCandidates ?? []),
        ...(other.coverCandidates ?? []),
        preferred.coverUrl,
        other.coverUrl,
      ].filter((url): url is string => Boolean(url)))],
      source: [...new Set(`${preferred.source}、${other.source}`.split("、"))].join("、"),
    });
  }
  return [...merged.values()];
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedMode = request.nextUrl.searchParams.get("mode");
  const mode = requestedMode === "callNumber" ? "callNumber" : requestedMode === "keyword" ? "keyword" : "isbn";
  if (!q) return NextResponse.json({ error: "请输入标准编号或索书号。" }, { status: 400 });

  const compact = cleanIsbn(q);
  const doi = mode === "isbn" ? normalizeDoi(q) : "";
  const directIssn = mode === "isbn" ? normalizeIssn(q) : "";
  const barcodeIssn = mode === "isbn" ? issnFromSerialBarcode(compact) : "";
  const issn = directIssn || barcodeIssn;
  const ismn = mode === "isbn" ? normalizeIsmn(q) : "";
  const unifiedBookNumber = mode === "isbn" ? normalizeUnifiedBookNumber(q) : "";
  const isbn = !issn && !ismn && !doi && !unifiedBookNumber ? compact : "";
  const genericGtin = mode === "isbn" && !issn && !ismn && isValidGtin13(compact)
    && !compact.startsWith("978") && !compact.startsWith("979");
  const lookupValue = doi || issn || ismn || unifiedBookNumber
    || (mode === "isbn" && (isbn.length === 10 || isbn.length === 13) ? isbn : q);
  const ndlCoverPromise = mode === "isbn" && (isbn.length === 10 || isbn.length === 13)
    ? findNdlCover(isbn).catch(() => "")
    : Promise.resolve("");
  const jobs: Array<{ name: string; promise: Promise<Book[]> }> = [
    {
      name: "CALIS",
      promise: searchCalis(lookupValue, mode === "callNumber" ? "callNumber" : "isbn", Boolean(issn), mode === "keyword" || unifiedBookNumber ? "cql.anywhere" : ""),
    },
  ];
  if (ciniiAppId() && !doi && !issn && !ismn && !genericGtin) {
    const exactCiniiIsbn = mode === "isbn" && (isbn.length === 10 || isbn.length === 13) ? isbn : "";
    const ciniiPromise = searchCiniiBooks(lookupValue, exactCiniiIsbn);
    jobs.push({
      name: "CiNii Books",
      promise: unifiedBookNumber
        ? ciniiPromise.then((books) => books.map((book) => ({ ...book, isbn: "", unifiedBookNumber })))
        : ciniiPromise,
    });
  }
  if (mode === "keyword") {
    const needle = normalizeCatalogText(q);
    const supplemental = needle ? Object.values(SUPPLEMENTAL_BOOKS).filter((book) =>
      normalizeCatalogText(`${book.title} ${book.author} ${book.publisher}`).includes(needle),
    ).map((book) => normalizeUnifiedBookNumber(book.isbn)
      ? { ...book, isbn: "", unifiedBookNumber: book.isbn }
      : book) : [];
    jobs.push(
      { name: "本地补充书目", promise: Promise.resolve(supplemental) },
      { name: "新加坡中医学院馆藏", promise: Promise.resolve(searchSingaporeCatalog(q)) },
      { name: "Internet Archive", promise: searchInternetArchive(q) },
      { name: "Open Library", promise: searchOpenLibraryByNumber(q, "书名/作者") },
      { name: "Google Books", promise: searchGoogleBooksByNumber(q, "书名/作者") },
    );
  } else if (doi) {
    jobs.push({ name: "Crossref", promise: searchCrossrefDoi(doi) });
  } else if (issn) {
    jobs.push({ name: "ISSN Portal", promise: searchIssnPortal(issn, barcodeIssn ? compact : issn) });
  } else if (ismn) {
    jobs.push(
      { name: "Open Library", promise: searchOpenLibraryByNumber(ismn, "ISMN") },
      { name: "Google Books", promise: searchGoogleBooksByNumber(ismn, "ISMN") },
    );
  } else if (unifiedBookNumber) {
    const supplemental = SUPPLEMENTAL_BOOKS[unifiedBookNumber];
    const asUnifiedBookRecords = (promise: Promise<Book[]>) => promise.then((books) => books.map((book) => ({
      ...book,
      isbn: "",
      unifiedBookNumber,
    })));
    if (supplemental) jobs.push({ name: "本地补充书目", promise: Promise.resolve([{ ...supplemental, isbn: "", unifiedBookNumber }]) });
    jobs.push(
      { name: "Internet Archive", promise: asUnifiedBookRecords(searchInternetArchive(unifiedBookNumber)) },
      { name: "Open Library", promise: asUnifiedBookRecords(searchOpenLibraryByNumber(unifiedBookNumber, "统一书号")) },
      { name: "Google Books", promise: asUnifiedBookRecords(searchGoogleBooksByNumber(unifiedBookNumber, "统一书号")) },
    );
  } else if (!genericGtin && mode === "isbn" && (isbn.length === 10 || isbn.length === 13)) {
    const supplemental = SUPPLEMENTAL_BOOKS[isbn];
    if (supplemental) jobs.push({ name: "本地补充书目", promise: Promise.resolve([supplemental]) });
    jobs.push(
      { name: "台湾新书资讯网", promise: searchTaiwanNcl(isbn) },
      { name: "豆瓣图书", promise: searchDouban(isbn) },
      { name: "孔夫子旧书网", promise: searchKongfz(isbn) },
      { name: "Open Library", promise: searchOpenLibrary(isbn) },
      { name: "Google Books", promise: searchGoogleBooks(isbn) },
    );
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const groups: Book[][] = [];
  const unavailable: string[] = [];
  const sourceErrors: Array<{ source: string; type: string; status?: number }> = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") groups.push(result.value);
    else {
      const source = jobs[index].name;
      unavailable.push(source);
      const error = result.reason;
      const status = String(error?.message ?? "").match(/HTTP (\d{3})/);
      sourceErrors.push({
        source,
        type: String(error?.cause?.code || error?.name || "Error"),
        ...(status ? { status: Number(status[1]) } : {}),
      });
    }
  });

  const books = mergeBooks(groups);
  const ndlCover = await ndlCoverPromise;
  if (ndlCover) {
    for (const book of books) {
      if (cleanIsbn(book.isbn) !== isbn) continue;
      book.coverUrl ||= ndlCover;
      book.coverCandidates = [...new Set([...(book.coverCandidates ?? []), ndlCover])];
    }
  }
  const validUncataloguedIsbn = mode === "isbn"
    && !doi && !issn && !ismn && !unifiedBookNumber && !genericGtin
    && ((isbn.length === 13 && /^(?:978|979)/.test(isbn) && isValidGtin13(isbn))
      || isbn.length === 10);
  if (!books.length && validUncataloguedIsbn) {
    books.push({
      sourceId: `manual-isbn-${isbn}`,
      source: "待手动编目",
      title: "未找到公开书目信息",
      author: "",
      publisher: "",
      year: "",
      isbn,
      callNumber: "",
      edition: "",
      language: "",
    });
  }
  if (!books.length && unifiedBookNumber) {
    books.push({
      sourceId: `manual-unified-${unifiedBookNumber.replace(/\D/g, "-")}`,
      source: "待手动编目",
      title: "未找到公开书目信息",
      author: "",
      publisher: "",
      year: "",
      isbn: "",
      unifiedBookNumber,
      callNumber: "",
      edition: "统一书号",
      language: "zh-CN",
    });
  }

  return NextResponse.json({
    books,
    unavailable,
    sourceErrors,
    identifierType: mode === "keyword" ? "KEYWORD" : doi ? "DOI" : issn ? "ISSN" : ismn ? "ISMN" : unifiedBookNumber ? "UNIFIED_BOOK_NUMBER" : genericGtin ? "GTIN" : mode === "callNumber" ? "CALL_NUMBER" : "ISBN",
    normalizedIdentifier: lookupValue,
    sourceUrl: `https://opac2.calis.edu.cn/search?searchType=bibliography&searchField=cql.anywhere&searchWord=${encodeURIComponent(lookupValue)}`,
  });
}
