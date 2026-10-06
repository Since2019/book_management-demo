"use client";

import { ChangeEvent, CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import OpenCC from "opencc-js/t2cn";
import { AppLocale, LanguageBridge } from "./LanguageBridge";

type Book = {
  id?: number; sourceId: string; source?: string; title: string; author: string;
  publisher: string; year: string; isbn: string; unifiedBookNumber?: string; callNumber: string;
  edition: string; language: string; volume?: string; note?: string; quantity?: number; coverImage?: string; storageLocation?: string; boxId?: number | null; tags?: string; coverUrl?: string; coverCandidates?: string[]; savedAt?: string;
};

type TagDefinition = { id: number; name: string; category: string; color: string };
type Box = { id: number; code: string; name: string; category: string; location: string; note: string; bookCount?: number };

const defaultBooksPerPage = 20;
const pageSizeOptions = [10, 20, 50, 100] as const;

const code39: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn","K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn","U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw","*":"nwnnwnwnn",
};

function Barcode({ value }: { value: string }) {
  let x = 8; const bars: { x: number; width: number }[] = [];
  for (const char of `*${value.toUpperCase()}*`) { const pattern = code39[char] ?? code39["-"]; [...pattern].forEach((kind, index) => { const width = kind === "w" ? 3 : 1; if (index % 2 === 0) bars.push({ x, width }); x += width + (index === 8 ? 1 : 0); }); }
  return <svg className="barcode" viewBox={`0 0 ${x + 8} 52`} role="img" aria-label={`条形码 ${value}`} preserveAspectRatio="none">{bars.map((bar, index) => <rect key={index} x={bar.x} y="2" width={bar.width} height="38" />)}<text x={(x + 8) / 2} y="50" textAnchor="middle">{value}</text></svg>;
}

const categoryColors: Record<string, string> = {
  "位置": "#2f7d65",
  "图书种类": "#c2683f",
  "阅读状态": "#596b9b",
  "自定义": "#78658f",
};

const boxRowColors = ["#eef6f2", "#f8f1e8", "#eef2f8", "#f7eef3", "#f3f4e8", "#edf5f7", "#f5efe9", "#f0edf7"];

function boxRowStyle(boxId?: number | null): CSSProperties | undefined {
  if (!boxId) return undefined;
  return { "--box-row-color": boxRowColors[Math.abs(boxId) % boxRowColors.length] } as CSSProperties;
}

const toSimplifiedChinese = OpenCC.Converter({ from: "hk", to: "cn" });

function normalizeLibrarySearch(value: string): string {
  return toSimplifiedChinese(value.normalize("NFKC")).toLowerCase().replace(/\s+/g, " ").trim();
}

function tagIds(value?: string): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

function legacyTags(value?: string): string[] {
  if (!value || value.trim().startsWith("[")) return [];
  return value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

const namedVolumeOptions = ["上", "中", "下"] as const;

function isValidVolume(value: string): boolean {
  return namedVolumeOptions.includes(value as (typeof namedVolumeOptions)[number]) || /^[1-9]\d{0,2}$/.test(value);
}

function selectedVolumes(value?: string): string[] {
  return (value ?? "").split(",").map((volume) => volume.trim()).filter(isValidVolume);
}

function physicalBookCount(book: Pick<Book, "volume" | "quantity">): number {
  const volumeCount = Math.max(1, selectedVolumes(book.volume).length);
  const duplicateCount = Math.max(1, book.quantity ?? 1);
  return volumeCount * duplicateCount;
}

function volumeLabel(value: string): string {
  return /^\d+$/.test(value) ? `第${value}冊` : `${value}冊`;
}

function sortVolumes(volumes: string[]): string[] {
  const namedOrder = new Map<string, number>(namedVolumeOptions.map((volume, index) => [volume, index]));
  return [...new Set(volumes)].sort((a, b) => {
    const aNamed = namedOrder.get(a); const bNamed = namedOrder.get(b);
    if (aNamed !== undefined || bNamed !== undefined) return (aNamed ?? 99) - (bNamed ?? 99);
    return Number(a) - Number(b);
  });
}

function bookSetKey(book: Book): string {
  const isbn = book.isbn.replace(/[^\dXx]/g, "").toUpperCase();
  const storageScope = book.boxId
    ? `box:${book.boxId}`
    : `location:${(book.storageLocation ?? "").trim().toLowerCase()}`;
  if (isbn) return `isbn:${isbn}|${storageScope}`;
  const unifiedBookNumber = (book.unifiedBookNumber ?? "").replace(/[•‧∙・.．。\-－—–]/g, "·").replace(/\s+/g, "");
  if (unifiedBookNumber) return `unified:${unifiedBookNumber}|${storageScope}`;
  const title = book.title.trim().toLowerCase().replace(/\s+/g, "");
  const author = book.author.trim().toLowerCase().replace(/\s+/g, "");
  return `book:${title}|${author}|${storageScope}`;
}

function emptyBook(): Book {
  return {
    sourceId: "manual",
    title: "",
    author: "",
    publisher: "",
    year: "",
    isbn: "",
    unifiedBookNumber: "",
    callNumber: "",
    edition: "",
    language: "",
    volume: "",
    note: "",
    quantity: 1,
    coverImage: "",
    storageLocation: "",
    boxId: null,
    tags: "",
  };
}

function displayedCover(value?: string) {
  if (!value || value.startsWith("data:")) return value ?? "";
  return `${value}${value.includes("?") ? "&" : "?"}v=20260816-2`;
}

function candidateCovers(book: Book): string[] {
  return [...new Set([book.coverUrl, ...(book.coverCandidates ?? [])].filter((url): url is string => Boolean(url)))];
}

const externalImageProviders = ["Google 图片", "百度图片", "淘宝", "京东", "豆瓣读书"];

function externalImageSearchUrl(provider: string, title: string, author: string): string {
  const query = encodeURIComponent([title, author].filter(Boolean).join(" "));
  if (provider === "Google 图片") return `https://www.google.com/search?tbm=isch&q=${query}`;
  if (provider === "百度图片") return `https://image.baidu.com/search/index?tn=baiduimage&word=${query}`;
  if (provider === "淘宝") return `https://s.taobao.com/search?q=${query}`;
  if (provider === "京东") return `https://search.jd.com/Search?keyword=${query}`;
  return `https://search.douban.com/book/subject_search?search_text=${query}`;
}

export default function Home() {
  const [locale, setLocale] = useState<AppLocale>("en");
  const [mode, setMode] = useState<"isbn" | "unifiedBookNumber" | "callNumber" | "keyword">("isbn");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryBoxFilter, setLibraryBoxFilter] = useState("");
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState("");
  const [libraryPage, setLibraryPage] = useState(1);
  const [booksPerPage, setBooksPerPage] = useState(defaultBooksPerPage);
  const [sortingBooks, setSortingBooks] = useState(false);
  const [draggedBookId, setDraggedBookId] = useState<number | null>(null);
  const [libraryInView, setLibraryInView] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [sourceErrors, setSourceErrors] = useState<Array<{ source: string; type: string; status?: number }>>([]);
  const [pendingBook, setPendingBook] = useState<Book | null>(null);
  const [previewBook, setPreviewBook] = useState<Book | null>(null);
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxManagerOpen, setBoxManagerOpen] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [boxCategoryFilter, setBoxCategoryFilter] = useState("");
  const [scannedBox, setScannedBox] = useState<(Box & { books: Pick<Book, "id" | "title" | "author" | "isbn" | "callNumber" | "volume" | "quantity">[] }) | null>(null);
  const [newBox, setNewBox] = useState({ code: "", name: "", category: "", location: "", note: "" });
  const [editingBoxId, setEditingBoxId] = useState<number | null>(null);
  const [transferring, setTransferring] = useState<"import" | "export" | "cover-import" | "cover-export" | "">("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const coverImportInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const librarySectionRef = useRef<HTMLElement>(null);
  const [newTag, setNewTag] = useState({ name: "", category: "图书种类", color: categoryColors["图书种类"] });

  useEffect(() => {
    const savedLocale = localStorage.getItem("bookstack-locale") as AppLocale | null;
    if (savedLocale === "zh-CN" || savedLocale === "zh-TW" || savedLocale === "en") setLocale(savedLocale);
  }, []);

  useEffect(() => {
    localStorage.setItem("bookstack-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const section = librarySectionRef.current;
    if (!section) return;

    function updateLibraryPosition() {
      const bounds = section.getBoundingClientRect();
      const navigationOffset = window.innerWidth < 900 ? 142 : 76;
      setLibraryInView(bounds.top <= navigationOffset && bounds.bottom > navigationOffset);
    }

    updateLibraryPosition();
    window.addEventListener("scroll", updateLibraryPosition, { passive: true });
    window.addEventListener("resize", updateLibraryPosition);
    return () => {
      window.removeEventListener("scroll", updateLibraryPosition);
      window.removeEventListener("resize", updateLibraryPosition);
    };
  }, []);

  async function loadBooks() {
    const response = await fetch("/api/books", { cache: "no-store" });
    if (!response.ok) throw new Error("读取书库失败");
    const data = (await response.json()) as { books?: Book[] };
    setBooks(data.books ?? []);
  }

  async function loadTags() {
    const response = await fetch("/api/tags", { cache: "no-store" });
    if (!response.ok) throw new Error("读取标签失败");
    const data = (await response.json()) as { tags?: TagDefinition[] };
    setTagDefinitions(data.tags ?? []);
  }

  async function loadBoxes() {
    const response = await fetch("/api/boxes", { cache: "no-store" });
    if (!response.ok) throw new Error("读取箱子失败");
    const data = await response.json() as { boxes?: Box[] };
    setBoxes(data.boxes ?? []);
  }

  useEffect(() => {
    Promise.all([loadBooks(), loadTags(), loadBoxes()]).catch(() => setMessage("暂时无法读取馆藏数据，请稍后重试。"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(value: string) {
    setToast("");
    window.setTimeout(() => setToast(value), 0);
  }

  useEffect(() => {
    if (!previewBook && !pendingBook && !boxManagerOpen && !tagManagerOpen) return;

    function closeTopmostDialog(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();

      if (tagManagerOpen) setTagManagerOpen(false);
      else if (boxManagerOpen) setBoxManagerOpen(false);
      else if (previewBook) setPreviewBook(null);
      else if (pendingBook) setPendingBook(null);
    }

    document.addEventListener("keydown", closeTopmostDialog);
    return () => document.removeEventListener("keydown", closeTopmostDialog);
  }, [boxManagerOpen, pendingBook, previewBook, tagManagerOpen]);

  async function scanBox(event: FormEvent) {
    event.preventDefault(); const code = scanCode.trim().toUpperCase(); if (!code) return;
    const response = await fetch(`/api/boxes?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const data = await response.json() as { box?: Box; books?: Book[]; error?: string };
    if (!response.ok || !data.box) { setScannedBox(null); setMessage(data.error || "箱码查询失败。"); return; }
    setScannedBox({ ...data.box, books: data.books ?? [] }); setScanCode(""); setMessage("");
  }

  async function createBox(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/boxes", { method: editingBoxId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newBox, id: editingBoxId }) });
    const data = await response.json() as { code?: string; error?: string };
    if (!response.ok) return setMessage(data.error || (editingBoxId ? "修改箱子失败。" : "新增箱子失败。"));
    await loadBoxes(); setNewBox({ code: "", name: "", category: "", location: "", note: "" }); setEditingBoxId(null); showToast(editingBoxId ? `箱子 ${data.code} 已更新。` : `箱子 ${data.code} 已建立。`);
  }

  function editBox(box: Box) {
    setEditingBoxId(box.id);
    setNewBox({ code: box.code, name: box.name, category: box.category, location: box.location, note: box.note });
    document.querySelector(".box-manager-dialog")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditBox() {
    setEditingBoxId(null);
    setNewBox({ code: "", name: "", category: "", location: "", note: "" });
  }

  async function deleteBox(box: Box) {
    if (!confirm(`删除“${box.name}”？箱内图书不会删除，但会变成未归箱。`)) return;
    const response = await fetch(`/api/boxes?id=${box.id}`, { method: "DELETE" });
    if (response.ok) { await Promise.all([loadBoxes(), loadBooks()]); setMessage(`已删除箱子 ${box.code}。`); }
  }

  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: books.reduce((total, book) => total + physicalBookCount(book), 0),
      records: books.length,
      thisMonth: books.filter((book) => {
        const saved = new Date(book.savedAt ?? 0);
        return saved.getFullYear() === now.getFullYear() && saved.getMonth() === now.getMonth();
      }).length,
      withCallNumber: books.filter((book) => Boolean(book.callNumber)).length,
    };
  }, [books]);

  const filteredBooks = useMemo(() => {
    const needle = normalizeLibrarySearch(libraryQuery);
    return books.filter((book) => {
      const box = boxes.find((item) => item.id === book.boxId);
      const matchesBox = !libraryBoxFilter
        || (libraryBoxFilter === "unboxed" ? !book.boxId : book.boxId === Number(libraryBoxFilter));
      const matchesCategory = !libraryCategoryFilter
        || Boolean(box && (box.category.trim() || "未分类") === libraryCategoryFilter);
      const matchesText = !needle || normalizeLibrarySearch([book.title, book.author, book.isbn, book.unifiedBookNumber, book.callNumber, book.publisher, book.volume, book.note, book.storageLocation,
        ...tagDefinitions.filter((tag) => tagIds(book.tags).includes(tag.id)).map((tag) => `${tag.name} ${tag.category}`),
        ...legacyTags(book.tags),
      ].join(" ")).includes(needle);
      return matchesBox && matchesCategory && matchesText;
    });
  }, [books, boxes, libraryBoxFilter, libraryCategoryFilter, libraryQuery, tagDefinitions]);

  const boxCategories = useMemo(() => [...new Set(boxes.map((box) => box.category.trim() || "未分类"))].sort(), [boxes]);
  const boxFilteredBooks = useMemo(() => {
    if (!boxFilter && !boxCategoryFilter) return [];
    const selectedBoxId = boxFilter ? Number(boxFilter) : null;
    const matchingBoxIds = new Set(boxes.filter((box) =>
      (!selectedBoxId || box.id === selectedBoxId)
      && (!boxCategoryFilter || (box.category.trim() || "未分类") === boxCategoryFilter),
    ).map((box) => box.id));
    return books.filter((book) => book.boxId && matchingBoxIds.has(book.boxId));
  }, [books, boxes, boxCategoryFilter, boxFilter]);

  const libraryPageCount = Math.max(1, Math.ceil(filteredBooks.length / booksPerPage));
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount);
  const pageStart = (currentLibraryPage - 1) * booksPerPage;
  const paginatedBooks = filteredBooks.slice(pageStart, pageStart + booksPerPage);

  const volumesByBookSet = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    for (const book of books) {
      if (!book.volume) continue;
      const key = bookSetKey(book);
      const volumes = grouped.get(key) ?? new Set<string>();
      for (const volume of selectedVolumes(book.volume)) volumes.add(volume);
      grouped.set(key, volumes);
    }
    return grouped;
  }, [books]);

  function toggleBookTag(id: number) {
    if (!pendingBook) return;
    const current = tagIds(pendingBook.tags);
    const next = current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id];
    setPendingBook({ ...pendingBook, tags: JSON.stringify(next) });
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTag),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) return setMessage(data.error || "添加标签失败。");
    await loadTags();
    setNewTag({ ...newTag, name: "" });
    showToast("标签已保存。");
  }

  async function deleteTag(id: number) {
    const response = await fetch(`/api/tags?id=${id}`, { method: "DELETE" });
    if (response.ok) {
      await loadTags();
      setBooks((current) => current.map((book) => ({
        ...book,
        tags: JSON.stringify(tagIds(book.tags).filter((tagId) => tagId !== id)),
      })));
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setMessage(mode === "isbn"
        ? "请输入 ISBN、ISSN、ISMN、DOI 或条码。"
        : mode === "unifiedBookNumber"
          ? "请输入统一书号。"
          : mode === "callNumber" ? "请输入索书号。" : "请输入书名、作者或出版社。");
      return;
    }
    setLoading(true);
    setMessage("");
    setResults([]);
    setUnavailable([]);
    setSourceErrors([]);
    try {
      const response = await fetch(`/api/search?mode=${mode}&q=${encodeURIComponent(query.trim())}`);
      const data = (await response.json()) as { books?: Book[]; unavailable?: string[]; sourceErrors?: Array<{ source: string; type: string; status?: number }>; identifierType?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "检索失败");
      setResults(data.books ?? []);
      setUnavailable(data.unavailable ?? []);
      setSourceErrors(data.sourceErrors ?? []);
      if (!data.books?.length) {
        setMessage(data.identifierType === "GTIN"
          ? "这是有效的普通商品条码，但不是出版物专用编号；当前书目来源没有匹配记录。"
          : mode === "callNumber"
            ? "没有找到匹配记录。索书号目前依赖 CALIS，可稍后重试。"
            : mode === "unifiedBookNumber"
              ? "没有找到匹配的统一书号记录，可使用手动编目。"
              : mode === "keyword" ? "馆藏目录和开放书目来源都没有找到匹配记录，可尝试下方网页深度检索。" : "多个书目来源都没有找到匹配记录，请检查标准编号或条码。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "检索失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function saveBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingBook) return;
    let book = pendingBook;
    setSavingId(String(book.id ?? book.sourceId));
    setMessage("");
    try {
      if (!book.coverImage && book.coverUrl) {
          const coverResponse = await fetch("/api/cover-assets", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: book.coverUrl }),
          });
          const coverData = await coverResponse.json() as { coverImage?: string; error?: string };
          if (!coverResponse.ok || !coverData.coverImage) throw new Error(coverData.error || "封面保存失败。");
          book = { ...book, coverImage: coverData.coverImage };
          setPendingBook(book);
      }
      const editing = Boolean(book.id);
      const response = await fetch("/api/books", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(book),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败");
      await loadBooks();
      const savedMessage = editing ? `《${book.title}》的馆藏信息已更新。` : `《${book.title}》已保存为 ${book.quantity ?? 1} 册馆藏。`;
      showToast(savedMessage);
      setPendingBook(null);
    } catch (error) {
      setMessage(error instanceof Error && error.name === "TimeoutError"
        ? "封面下载超时，请重试、上传图片，或选择先不保存封面。"
        : error instanceof Error ? error.message : "保存失败，请稍后重试。");
    } finally {
      setSavingId("");
    }
  }

  async function deleteBook(book: Book) {
    if (!book.id) return;
    const response = await fetch(`/api/books?id=${book.id}`, { method: "DELETE" });
    if (response.ok) {
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setMessage(`已从书库移除《${book.title}》。`);
    } else setMessage("删除失败，请稍后重试。");
  }

  async function selectCandidateCover(book: Book, coverUrl: string, inDialog = false) {
    if (savingId) return;
    function updateSelection(coverImage: string) {
      const selection = { coverUrl, coverImage };
      if (inDialog) {
        setPendingBook((current) => current && current.sourceId === book.sourceId && current.id === book.id
          ? { ...current, ...selection } : current);
      } else {
        setResults((current) => current.map((item) => item.sourceId === book.sourceId ? { ...item, ...selection } : item));
      }
    }
    // Selection is immediate; remote download success only adds the local asset.
    updateSelection("");
    setSavingId(String(book.id ?? book.sourceId));
    setMessage("");
    try {
      const response = await fetch("/api/cover-assets", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: coverUrl }),
      });
      const data = await response.json() as { coverImage?: string; error?: string };
      if (!response.ok || !data.coverImage) throw new Error(data.error || "封面保存失败，请重试。");
      updateSelection(data.coverImage);
      showToast("候选图片已存入图片库，保存书目后完成关联。");
    } catch (error) {
      setMessage(error instanceof Error && error.name === "TimeoutError"
        ? "封面下载超时，请重试、上传图片，或选择先不保存封面。"
        : error instanceof Error ? error.message : "封面保存失败，请重试。");
    } finally {
      setSavingId("");
    }
  }

  function skipPendingCover() {
    if (savingId) return;
    setPendingBook((current) => current ? { ...current, coverImage: "", coverUrl: "" } : current);
    setMessage("本次将只保存书目信息，之后可在书库补充封面。");
  }

  async function moveBookBefore(targetId: number) {
    if (draggedBookId === null || draggedBookId === targetId) return;
    const previousBooks = books;
    const sourceIndex = books.findIndex((book) => book.id === draggedBookId);
    const targetIndex = books.findIndex((book) => book.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...books];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(reordered.findIndex((book) => book.id === targetId), 0, moved);
    setBooks(reordered);
    setDraggedBookId(null);
    try {
      const response = await fetch("/api/books", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((book) => book.id) }),
      });
      if (!response.ok) throw new Error();
      showToast("馆藏显示顺序已保存。");
    } catch {
      setBooks(previousBooks);
      setMessage("排序保存失败，已恢复原来的顺序。");
    }
  }

  async function compressedCover(file: File): Promise<Blob> {
    if (!file.type.startsWith("image/")) throw new Error("請選擇圖片檔案。");
    if (file.size > 12 * 1024 * 1024) throw new Error("原始圖片不能超過 12 MB。");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败。")), "image/webp", .78));
  }

  async function uploadBookCover(book: Book, file?: File) {
    if (!book.id || !file) return;
    setSavingId(String(book.id)); setMessage("");
    try {
      const compressed = await compressedCover(file);
      const form = new FormData();
      form.append("file", compressed, `${file.name.replace(/\.[^.]*$/, "") || "cover"}.webp`);
      const assetResponse = await fetch("/api/cover-assets", { method: "POST", body: form });
      const assetData = await assetResponse.json() as { coverImage?: string; error?: string };
      if (!assetResponse.ok || !assetData.coverImage) throw new Error(assetData.error || "照片保存失敗。");
      const coverImage = assetData.coverImage;
      const response = await fetch("/api/books", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...book, coverImage }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "照片保存失敗。");
      await loadBooks(); showToast(`《${book.title}》的照片已保存。`);
      setPreviewBook((current) => current?.id === book.id ? { ...book, coverImage } : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "照片保存失敗。"); }
    finally { setSavingId(""); }
  }

  async function uploadPendingCover(file?: File) {
    if (!pendingBook || !file) return;
    const pendingKey = String(pendingBook.id ?? pendingBook.sourceId);
    setSavingId(pendingKey);
    setMessage("");
    try {
      const compressed = await compressedCover(file);
      const form = new FormData();
      form.append("file", compressed, `${file.name.replace(/\.[^.]*$/, "") || "cover"}.webp`);
      const response = await fetch("/api/cover-assets", { method: "POST", body: form });
      const data = await response.json() as { coverImage?: string; error?: string };
      if (!response.ok || !data.coverImage) throw new Error(data.error || "图片上传失败。");
      setPendingBook((current) => current ? { ...current, coverImage: data.coverImage, coverUrl: "" } : current);
      showToast(`《${pendingBook.title}》的待保存封面已更新。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片上传失败。");
    } finally {
      setSavingId("");
    }
  }

  async function exportLibraryData() {
    setTransferring("export");
    setMessage("");
    try {
      const response = await fetch("/api/library-data", { cache: "no-store" });
      if (!response.ok) throw new Error("导出失败，请稍后重试。");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `book-library-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`已导出 ${books.length} 册书、${boxes.length} 个箱子及 ${tagDefinitions.length} 个标签；图片请另行导出。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败，请稍后重试。");
    } finally {
      setTransferring("");
    }
  }

  async function importLibraryData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setMessage("包含照片的导入文件不能超过 50 MB。");
      return;
    }
    setTransferring("import");
    setMessage("");
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new Error("所选文件不是有效的 JSON 数据文件。");
      }
      const response = await fetch("/api/library-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { imported?: number; skipped?: number; tagsCreated?: number; boxesCreated?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "导入失败，请检查文件后重试。");
      await Promise.all([loadBooks(), loadTags(), loadBoxes()]);
      setMessage(`成功导入 ${data.imported ?? 0} 册书、${data.boxesCreated ?? 0} 个箱子，新增 ${data.tagsCreated ?? 0} 个标签${data.skipped ? `；跳过 ${data.skipped} 条重复或无效记录` : ""}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败，请检查文件后重试。");
    } finally {
      setTransferring("");
    }
  }

  async function exportCoverArchive() {
    setTransferring("cover-export"); setMessage("");
    try {
      const response = await fetch("/api/cover-archive", { cache: "no-store" });
      if (!response.ok) throw new Error("图片导出失败，请稍后重试。");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `book-covers-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setMessage("图片 ZIP 已导出；请与书库 JSON 一起保存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "图片导出失败。"); }
    finally { setTransferring(""); }
  }

  async function importCoverArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setTransferring("cover-import"); setMessage("");
    try {
      const response = await fetch("/api/cover-archive", { method: "POST", headers: { "Content-Type": "application/zip" }, body: file });
      const data = await response.json() as { imported?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "图片导入失败。");
      await loadBooks();
      setMessage(`已导入 ${data.imported ?? 0} 张图片。接着导入配套的书库 JSON 即可恢复图片关联。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "图片导入失败。"); }
    finally { setTransferring(""); }
  }

  return (
    <main>
      {toast && <div className="success-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{toast}<button type="button" onClick={() => setToast("")} aria-label="关闭提示">×</button></div>}
      <LanguageBridge locale={locale} />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="书栈首页"><span className="brand-mark">书</span><span>书栈</span></a>
        <nav aria-label="主导航"><a className="active" href="#search">检索</a><a href="#boxes">扫码找箱</a><a href="#library">我的书库</a><button type="button" onClick={() => setBoxManagerOpen(true)}>箱子管理</button></nav>
        <div className="topbar-actions">
          <div className="status"><span />多来源书目服务</div>
          <div className="language-switcher" role="group" aria-label="语言切换" data-no-translate>
            <button type="button" className={locale === "zh-CN" ? "active" : ""} onClick={() => setLocale("zh-CN")} aria-pressed={locale === "zh-CN"} title="简体中文">简</button>
            <button type="button" className={locale === "zh-TW" ? "active" : ""} onClick={() => setLocale("zh-TW")} aria-pressed={locale === "zh-TW"} title="繁體中文">繁</button>
            <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"} title="English">EN</button>
          </div>
        </div>
      </header>

      <aside className="section-rail" aria-label="功能区导航">
        <p>功能区</p>
        <a href="#search"><span>01</span><strong>书目检索</strong></a>
        <a href="#boxes"><span>02</span><strong>扫码找箱</strong></a>
        <a href="#library"><span>03</span><strong>我的书库</strong></a>
        <div className="section-submenu" aria-label="我的书库子菜单">
          <a href="#library">添加 / 搜索</a>
        </div>
        <div className="section-rail-actions">
          <button type="button" onClick={() => setBoxManagerOpen(true)}>箱子管理</button>
          <button type="button" onClick={() => setTagManagerOpen(true)}>标签管理</button>
        </div>
      </aside>

      <section className="hero" id="top">
        <div className="hero-inner">
          <p className="eyebrow">LIBRARY DESK · 中文书目工作台</p>
          <h1>找一本书，<em>留一份记录。</em></h1>
          <p className="hero-copy">自动识别 ISBN、ISSN、ISMN、DOI、统一书号和出版物条码，再从 CALIS、Crossref、ISSN Portal 等来源查找对应记录。</p>
          <form className="search-panel" id="search" onSubmit={handleSearch}>
            <div className="mode-tabs" role="tablist" aria-label="检索方式">
              <button type="button" className={mode === "isbn" ? "selected" : ""} onClick={() => setMode("isbn")}>标准编号</button>
              <button type="button" className={mode === "unifiedBookNumber" ? "selected" : ""} onClick={() => setMode("unifiedBookNumber")}>统一书号</button>
              <button type="button" className={mode === "callNumber" ? "selected" : ""} onClick={() => setMode("callNumber")}>索书号</button>
              <button type="button" className={mode === "keyword" ? "selected" : ""} onClick={() => setMode("keyword")}>书名 / 作者</button>
            </div>
            <div className="search-row">
              <div className="search-input">
                <span aria-hidden="true">⌕</span>
                <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder={mode === "isbn" ? "输入 ISBN、ISSN、ISMN、DOI 或条码" : mode === "unifiedBookNumber" ? "输入统一书号，例如 10018·309" : mode === "callNumber" ? "输入索书号，例如 TP311.56" : "输入书名、作者或出版社，例如 观甲诊病"}
                  aria-label={mode === "isbn" ? "标准编号或出版物条码" : mode === "unifiedBookNumber" ? "统一书号" : mode === "callNumber" ? "索书号" : "书名、作者或出版社"} />
                {query && <button type="button" className="clear-search-button" onClick={() => { setQuery(""); searchInputRef.current?.focus(); }} aria-label="清空搜索内容" title="清空">×</button>}
              </div>
              <button className="primary-button" disabled={loading}>{loading ? "正在检索…" : "查找书目"} <span aria-hidden="true">→</span></button>
            </div>
            <div className="search-hint">
              <span>{mode === "isbn" ? "支持图书、期刊、乐谱与学术文献编号" : mode === "unifiedBookNumber" ? "支持 1987 年前中文出版物使用的统一书号" : mode === "callNumber" ? "索书号由 CALIS 联合目录查询" : "同时检索新加坡中医学院 51,521 条馆藏及多个开放书目源"}</span>
              <a href={`https://opac2.calis.edu.cn/search?searchType=bibliography&searchField=cql.anywhere&searchWord=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">在 CALIS 查看 →</a>
            </div>
            {query.trim() && <div className="deep-search-links"><span>网页深度检索</span><a href={`https://www.google.com/search?q=${encodeURIComponent(`图书 ${query}`)}`} target="_blank" rel="noreferrer">Google</a><a href={`https://www.bing.com/search?q=${encodeURIComponent(`图书 ${query}`)}`} target="_blank" rel="noreferrer">Bing</a><a href={`https://search.worldcat.org/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">WorldCat</a><a href={`https://ndlsearch.ndl.go.jp/en/search?keyword=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">日本国会图书馆</a></div>}
          </form>
        </div>
      </section>

      <section className="workspace">
        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")} aria-label="关闭提示">×</button></div>}
        {unavailable.length > 0 && results.length > 0 && (
          <div className="notice source-notice" role="status"><span>{unavailable.map((source) => {
            const error = sourceErrors.find((item) => item.source === source);
            const reason = error?.type === "VerificationRequired" ? "官网要求验证码"
              : error?.status === 429 ? "请求限流"
              : error?.type === "TimeoutError" ? "连接超时"
              : error?.status ? `服务返回 ${error.status}` : "查询失败";
            return `${source}：${reason}`;
          }).join("；")}。{results.some((book) => book.source !== "待手动编目") ? "以下显示已成功取得的书目。" : "本次未取得书目信息，可稍后重试或手动编目；这不代表这些来源没有收录。"}</span><button onClick={() => setUnavailable([])} aria-label="关闭提示">×</button></div>
        )}

        <section className="box-scan-section" id="boxes">
          <div className="section-heading"><div><p className="kicker">SCAN & LOCATE</p><h2>扫码找箱</h2><p>用扫码枪扫描箱上条码，或直接输入箱码并回车。</p></div><button className="manage-tags-button" type="button" onClick={() => setBoxManagerOpen(true)}>＋ 管理箱子</button></div>
          <form className="box-scan-form" onSubmit={scanBox}><span className="scan-icon">▥</span><input value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="扫描或输入箱码，例如 BOX-A01" aria-label="箱码" autoComplete="off" /><button className="primary-button">查询箱子 →</button></form>
          <div className="box-filter-panel" aria-label="按箱子或分类筛选藏书">
            <label><span>按箱子</span><select value={boxFilter} onChange={(event) => setBoxFilter(event.target.value)}><option value="">全部箱子</option>{boxes.map((box) => <option key={box.id} value={box.id}>{box.code} · {box.name}</option>)}</select></label>
            <label><span>按分类</span><select value={boxCategoryFilter} onChange={(event) => setBoxCategoryFilter(event.target.value)}><option value="">全部分类</option>{boxCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            {(boxFilter || boxCategoryFilter) && <button type="button" onClick={() => { setBoxFilter(""); setBoxCategoryFilter(""); }}>清除筛选</button>}
          </div>
          {(boxFilter || boxCategoryFilter) && <section className="box-filter-results" aria-live="polite">
            <header><div><span>FILTERED COLLECTION</span><h3>{boxFilter ? boxes.find((box) => box.id === Number(boxFilter))?.name : boxCategoryFilter}</h3></div><strong>{boxFilteredBooks.reduce((total, book) => total + physicalBookCount(book), 0)} 册 · {boxFilteredBooks.length} 条记录</strong></header>
            {boxFilteredBooks.length ? <ol>{boxFilteredBooks.map((book) => { const box = boxes.find((item) => item.id === book.boxId); return <li key={book.id}><div><strong>{book.title}</strong><span>{book.author || "责任者未标注"}{selectedVolumes(book.volume).length ? ` · ${selectedVolumes(book.volume).map(volumeLabel).join("、")}` : ""}</span></div><div><b>{box?.name || "未知箱"}</b><small>{box?.location || book.storageLocation || "—"}</small></div><em>{book.callNumber || book.isbn || "未编目"}</em></li>; })}</ol> : <div className="box-filter-empty">这个筛选条件下没有藏书。</div>}
          </section>}
          {scannedBox && <article className="scan-result">
            <div className="box-identity"><span>已找到</span><h3>{scannedBox.name}</h3><Barcode value={scannedBox.code} /></div>
            <dl><div><dt>存放位置</dt><dd>{scannedBox.location}</dd></div><div><dt>分类</dt><dd>{scannedBox.category || "未分类"}</dd></div><div><dt>箱内数量</dt><dd>{scannedBox.books.reduce((total, book) => total + (book.quantity ?? 1), 0)} 册</dd></div><div><dt>备注</dt><dd>{scannedBox.note || "—"}</dd></div></dl>
            <div className="box-book-list"><strong>箱内图书</strong>{scannedBox.books.length ? <ol>{scannedBox.books.map((book) => <li key={book.id}><span>{book.title}{selectedVolumes(book.volume).length ? `（${selectedVolumes(book.volume).map(volumeLabel).join("、")}）` : ""}{(book.quantity ?? 1) > 1 ? ` ×${book.quantity}` : ""}</span><small>{book.callNumber || book.isbn || book.author || "未编目"}</small></li>)}</ol> : <p>这个箱子目前还没有图书。</p>}</div>
          </article>}
        </section>

        {(loading || results.length > 0) && (
          <div className="result-section">
            <div className="section-heading"><div><p className="kicker">SEARCH RESULT</p><h2>检索结果</h2></div>{!loading && <span>{results.length} 条记录</span>}</div>
            {loading ? <div className="loading-card"><span className="spinner" />正在并行查询多个书目来源…</div> : (
              <div className="result-grid">
                {results.map((book, index) => {
                  const copies = books.filter((item) => book.isbn ? item.isbn === book.isbn : book.unifiedBookNumber ? item.unifiedBookNumber === book.unifiedBookNumber : false).reduce((total, item) => total + (item.quantity ?? 1), 0);
                  const covers = candidateCovers(book);
                  return (
                    <article className="book-card" key={book.sourceId}>
                      <div className="search-cover-column">
                        <strong>封面选择</strong>
                        {book.coverUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img className="book-cover" src={book.coverUrl} alt={`《${book.title}》当前选中封面`} />
                          : <div className={`book-spine spine-${index % 4}`}><span>{(book.title || "书").slice(0, 1)}</span><small>{book.year || "BOOK"}</small></div>}
                        {covers.length ? <div className="search-cover-options" role="group" aria-label={`选择《${book.title}》的入库封面`}>
                          {covers.map((url, coverIndex) => <button type="button" key={url} className={book.coverUrl === url ? "selected" : ""} aria-pressed={book.coverUrl === url} disabled={Boolean(savingId)} onClick={() => void selectCandidateCover(book, url)} title={`选择候选封面 ${coverIndex + 1}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`候选封面 ${coverIndex + 1}`} />
                            {book.coverUrl === url && <span aria-hidden="true">✓</span>}
                          </button>)}
                        </div> : <small className="no-cover-candidates">暂无候选封面</small>}
                        {covers.length > 0 && <small className="selected-cover-note">选图后自动存入图片库，保存书目后关联</small>}
                        <div className="external-image-links compact"><span>外部找图</span>{externalImageProviders.map((provider) => <a key={provider} href={externalImageSearchUrl(provider, book.title, book.author)} target="_blank" rel="noreferrer">{provider}</a>)}</div>
                      </div>
                      <div className="book-detail">
                        <div className="book-title-row"><span className="record-tag">{book.source || "书目来源"}</span><span className="record-no">#{String(index + 1).padStart(2, "0")}</span></div>
                        <h3>{book.title || "未题名书目"}</h3>
                        <p className="author">{book.author || "责任者未标注"}</p>
                        <dl>
                          <div><dt>出版</dt><dd>{[book.publisher, book.year].filter(Boolean).join(" · ") || "—"}</dd></div>
                          <div><dt>{book.unifiedBookNumber ? "统一书号" : "标准编号"}</dt><dd>{book.isbn || book.unifiedBookNumber || "—"}</dd></div>
                          <div><dt>分类号</dt><dd>{book.callNumber || "待补充"}</dd></div>
                        </dl>
                        <button className="save-button" disabled={savingId === book.sourceId} onClick={() => setPendingBook({ ...book, storageLocation: "", tags: "" })}>
                          {savingId === book.sourceId ? "保存中…" : copies ? `＋ 再添加一册（已有 ${copies} 册）` : "＋ 保存到书库"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <section className="library-section" id="library" ref={librarySectionRef}>
          <div className="section-heading library-heading">
            <div><p className="kicker">MY COLLECTION</p><h2>我的书库</h2><p>保存过的书目会留在这里，刷新页面也不会丢失。</p></div>
            <div className="library-tools">
              <label className="library-search"><span>⌕</span><input value={libraryQuery} onChange={(event) => { setLibraryQuery(event.target.value); setLibraryPage(1); }} placeholder="搜尋書名、位置或標籤（支援簡繁體）" aria-label="搜尋已保存圖書，支援簡繁體" /></label>
              <input ref={importInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={importLibraryData} aria-label="选择完整书库备份文件" />
              <input ref={coverImportInputRef} className="sr-only" type="file" accept=".zip,application/zip" onChange={importCoverArchive} aria-label="选择图片 ZIP 备份文件" />
              <button className="data-button" type="button" disabled={Boolean(transferring)} onClick={() => importInputRef.current?.click()} title="导入图书、箱子和标签 JSON">{transferring === "import" ? "导入中…" : "导入数据"}</button>
              <button className="data-button" type="button" disabled={Boolean(transferring)} onClick={exportLibraryData} title="导出图书、箱子和标签 JSON">{transferring === "export" ? "导出中…" : "导出数据"}</button>
              <button className="data-button" type="button" disabled={Boolean(transferring)} onClick={() => coverImportInputRef.current?.click()} title="导入图片 ZIP">{transferring === "cover-import" ? "图片导入中…" : "导入图片"}</button>
              <button className="data-button" type="button" disabled={Boolean(transferring)} onClick={exportCoverArchive} title="单独导出全部图片 ZIP">{transferring === "cover-export" ? "图片导出中…" : "导出图片"}</button>
              <button className="manage-tags-button" onClick={() => setTagManagerOpen(true)}>管理标签</button>
            </div>
          </div>
          <div className="library-filter-bar" aria-label="筛选我的书库">
            <label><span>箱子</span><select value={libraryBoxFilter} onChange={(event) => { setLibraryBoxFilter(event.target.value); setLibraryPage(1); }}><option value="">全部箱子</option><option value="unboxed">未归箱</option>{boxes.map((box) => <option key={box.id} value={box.id}>{box.code} · {box.name}</option>)}</select></label>
            <label><span>分类</span><select value={libraryCategoryFilter} onChange={(event) => { setLibraryCategoryFilter(event.target.value); setLibraryPage(1); }}><option value="">全部分类</option>{boxCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            {(libraryBoxFilter || libraryCategoryFilter) && <button type="button" onClick={() => { setLibraryBoxFilter(""); setLibraryCategoryFilter(""); setLibraryPage(1); }}>清除筛选</button>}
            <strong>{filteredBooks.length} 条记录</strong>
          </div>
          <button className="manual-book-card" type="button" onClick={() => setPendingBook(emptyBook())}>
            <span aria-hidden="true">＋</span>
            <strong>直接添加图书</strong>
            <small>没有索书号也没关系，只需填写书名即可入库</small>
          </button>
          <div className="stats-grid">
            <div><strong>{String(stats.total).padStart(2, "0")}</strong><span>馆藏总数</span></div>
            <div><strong>{String(stats.records).padStart(2, "0")}</strong><span>书目记录数</span></div>
            <div><strong>{String(stats.thisMonth).padStart(2, "0")}</strong><span>本月新增</span></div>
            <div><strong>{String(boxes.length).padStart(2, "0")}</strong><span>馆藏箱数</span></div>
          </div>
          {filteredBooks.length ? (
            <>
              <div className="table-sort-toolbar">
                <button type="button" className={sortingBooks ? "sorting" : ""} onClick={() => { setSortingBooks((current) => !current); setDraggedBookId(null); }}>
                  {sortingBooks ? "✓ 完成排序" : "↕ 调整表格顺序"}
                </button>
                {sortingBooks && <span>按住每行左侧把手拖放</span>}
              </div>
              <div className="library-table-wrap"><table>
                <thead><tr><th>序号</th>{sortingBooks && <th className="drag-column"><span className="sr-only">拖曳排序</span></th>}<th>照片</th><th>书名 / 责任者</th><th>册别</th><th>标准编号 / 统一书号</th><th>分类号</th><th>所属箱 / 位置</th><th>标签</th><th>出版信息 / 备注</th><th><span className="sr-only">操作</span></th></tr></thead>
                <tbody>{paginatedBooks.map((book, index) => (
                <tr key={book.id} draggable={sortingBooks} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(book.id ?? "")); setDraggedBookId(book.id ?? null); }} onDragEnd={() => setDraggedBookId(null)} onDragOver={(event) => { if (sortingBooks) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { event.preventDefault(); if (book.id) void moveBookBefore(book.id); }} className={`${book.boxId ? "box-group-row " : ""}${draggedBookId === book.id ? "dragging" : ""}${sortingBooks ? "sortable-row" : ""}`} style={boxRowStyle(book.boxId)}>
                  <td className="record-index">{pageStart + index + 1}</td>
                  {sortingBooks && <td className="drag-column"><button type="button" className="drag-handle" aria-label={`拖曳《${book.title}》调整顺序`} tabIndex={-1}>⠿</button></td>}
                  <td>{book.coverImage ? <button className="cover-upload cover-preview-trigger" type="button" title="查看大圖" onClick={() => setPreviewBook(book)}><img src={displayedCover(book.coverImage)} alt={`《${book.title}》照片`} /></button> : <label className={`cover-upload${savingId === String(book.id) ? " saving" : ""}`} title="上傳照片"><span>＋<small>照片</small></span><input type="file" accept="image/*" disabled={Boolean(savingId)} onChange={(event) => { void uploadBookCover(book, event.target.files?.[0]); event.target.value = ""; }} /></label>}</td>
                  <td><strong>{book.title}{(book.quantity ?? 1) > 1 && <b className="quantity-badge">×{book.quantity}</b>}</strong><span>{book.author || "—"}</span></td>
                  <td><div className="volume-tags" aria-label="這套書已收錄的冊別">{sortVolumes([...(volumesByBookSet.get(bookSetKey(book)) ?? [])]).map((volume) => {
                    const current = selectedVolumes(book.volume).includes(volume);
                    return <span key={volume} className={`present${current ? " current" : ""}`} title={`已收錄${volumeLabel(volume)}`}>{volumeLabel(volume)}</span>;
                  })}{!volumesByBookSet.get(bookSetKey(book))?.size && <em>未標註</em>}</div></td>
                  <td className="mono">{book.isbn || book.unifiedBookNumber || "—"}</td>
                  <td><span className="call-number">{book.callNumber || "待编目"}</span></td>
                  <td>{book.boxId ? <><strong>{boxes.find((box) => box.id === book.boxId)?.name || "未知箱"}</strong><span>{boxes.find((box) => box.id === book.boxId)?.location}</span></> : (book.storageLocation || "未归箱")}</td>
                  <td><div className="tag-list">{tagDefinitions.filter((tag) => tagIds(book.tags).includes(tag.id)).map((tag) => <span key={tag.id} style={{ backgroundColor: `${tag.color}1f`, color: tag.color }}>{tag.name}</span>)}{legacyTags(book.tags).map((tag) => <span key={tag}>{tag}</span>)}{!tagDefinitions.some((tag) => tagIds(book.tags).includes(tag.id)) && !legacyTags(book.tags).length && <em>无标签</em>}</div></td>
                  <td>{[book.publisher, book.year].filter(Boolean).join(" · ") || "—"}{book.note && <span className="book-note">{book.note}</span>}</td>
                  <td><div className="row-actions"><button className="edit-button" onClick={() => setPendingBook({ ...book })} aria-label={`编辑《${book.title}》`}>编辑</button><button className="delete-button" onClick={() => deleteBook(book)} aria-label={`删除《${book.title}》`}>删除</button></div></td>
                </tr>
                ))}</tbody>
              </table></div>
              <nav className={`library-pagination${libraryInView ? " docked" : ""}`} aria-label="書目分頁">
                <div className="pagination-summary">
                  <span>第 {currentLibraryPage} / {libraryPageCount} 頁 · 共 {filteredBooks.length} 條</span>
                  <label>每頁顯示
                    <select value={booksPerPage} onChange={(event) => { setBooksPerPage(Number(event.target.value)); setLibraryPage(1); }}>
                      {pageSizeOptions.map((size) => <option key={size} value={size}>{size} 條</option>)}
                    </select>
                  </label>
                </div>
                <div>
                  <button type="button" disabled={currentLibraryPage === 1} onClick={() => setLibraryPage(currentLibraryPage - 1)}>← 上一頁</button>
                  <button type="button" disabled={currentLibraryPage === libraryPageCount} onClick={() => setLibraryPage(currentLibraryPage + 1)}>下一頁 →</button>
                </div>
              </nav>
            </>
          ) : (
            <div className="empty-state"><span>◇</span><h3>{books.length ? "没有匹配的馆藏" : "书架还空着"}</h3><p>{books.length ? "试试书名、作者、标准编号或索书号。" : "从上方检索一条资料，把它保存到这里。"}</p></div>
          )}
        </section>
      </section>
      {previewBook?.coverImage && (
        <div className="modal-backdrop cover-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPreviewBook(null); }}>
          <section className="cover-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cover-preview-title">
            <div className="dialog-heading"><div><p className="kicker">BOOK PHOTO</p><h2 id="cover-preview-title">{previewBook.title}</h2></div><button type="button" onClick={() => setPreviewBook(null)} aria-label="關閉照片預覽">×</button></div>
            <div className="cover-preview-image"><img src={displayedCover(previewBook.coverImage)} alt={`《${previewBook.title}》大圖`} /></div>
            <div className="cover-preview-actions"><span>{previewBook.author || "作者未標註"}</span><label className="primary-button"><input type="file" accept="image/*" disabled={Boolean(savingId)} onChange={(event) => { void uploadBookCover(previewBook, event.target.files?.[0]); event.target.value = ""; }} />{savingId ? "保存中…" : "更換圖片"}</label></div>
          </section>
        </div>
      )}
      {pendingBook && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setPendingBook(null);
        }}>
          <section className="catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
            <div className="dialog-heading">
              <div><p className="kicker">CATALOG RECORD</p><h2 id="catalog-title">{pendingBook.id ? "编辑馆藏信息" : "确认入库信息"}</h2></div>
              <button type="button" onClick={() => setPendingBook(null)} aria-label="关闭入库表单">×</button>
            </div>
            <p className="dialog-copy">{pendingBook.id ? "修改这册图书的编目、位置和标签。" : "保存前可修改书目信息；同一种书可以作为多册馆藏分别保存。"}</p>
            <form className="catalog-form" onSubmit={saveBook}>
              <fieldset className="wide dialog-cover-manager"><legend>封面图片</legend>
                <div className="dialog-cover-current">
                  {pendingBook.coverImage || pendingBook.coverUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={pendingBook.coverImage ? displayedCover(pendingBook.coverImage) : pendingBook.coverUrl} alt={`《${pendingBook.title}》当前封面`} />
                    : <div className="dialog-cover-empty"><span>书</span><small>暂无封面</small></div>}
                  <div><strong>当前待保存图片</strong><p>{pendingBook.coverImage ? "本地图片已上传，保存表单后关联到馆藏。" : pendingBook.coverUrl ? "网络图片将在保存馆藏时下载到本地。" : "可上传照片、选择候选图或到其他网站寻找。"}</p><label className="dialog-cover-upload"><input type="file" accept="image/*" disabled={Boolean(savingId)} onChange={(event) => { void uploadPendingCover(event.target.files?.[0]); event.target.value = ""; }} />{savingId ? "上传中…" : "浏览并上传图片"}</label></div>
                </div>
                {(pendingBook.coverCandidates?.length ?? 0) > 0 && <div className="dialog-cover-candidates"><strong>候选封面</strong><div>{pendingBook.coverCandidates!.map((url, index) => <button type="button" key={url} className={pendingBook.coverUrl === url ? "selected" : ""} disabled={Boolean(savingId)} onClick={() => void selectCandidateCover(pendingBook, url, true)} aria-pressed={pendingBook.coverUrl === url} aria-label={`选择候选封面 ${index + 1}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={`候选封面 ${index + 1}`} />{pendingBook.coverUrl === url && <span aria-hidden="true">✓</span>}</button>)}</div></div>}
                {message && <p role="alert">{message}</p>}
                <div className="external-image-links"><strong>到其他网站找图</strong><p>仅使用书名和作者名生成搜索词；点击后在新页面自行浏览。</p><div>{externalImageProviders.map((provider) => <a key={provider} href={externalImageSearchUrl(provider, pendingBook.title, pendingBook.author)} target="_blank" rel="noreferrer">{provider} ↗</a>)}</div></div>
              </fieldset>
              <label className="wide">书名<span>*</span><input autoFocus required value={pendingBook.title} onChange={(event) => setPendingBook({ ...pendingBook, title: event.target.value })} /></label>
              <label>作者<input value={pendingBook.author} onChange={(event) => setPendingBook({ ...pendingBook, author: event.target.value })} /></label>
              <label>出版社<input value={pendingBook.publisher} onChange={(event) => setPendingBook({ ...pendingBook, publisher: event.target.value })} /></label>
              <label>出版年份<input value={pendingBook.year} onChange={(event) => setPendingBook({ ...pendingBook, year: event.target.value })} /></label>
              <label>标准编号<input value={pendingBook.isbn} onChange={(event) => setPendingBook({ ...pendingBook, isbn: event.target.value })} /></label>
              <label>统一书号<input value={pendingBook.unifiedBookNumber ?? ""} onChange={(event) => setPendingBook({ ...pendingBook, unifiedBookNumber: event.target.value })} placeholder="例如 14200·100" /><small>用于 1987 年前出版物，与 ISBN 分开保存</small></label>
              <label>分类号 / 索书号<input value={pendingBook.callNumber} onChange={(event) => setPendingBook({ ...pendingBook, callNumber: event.target.value })} placeholder="例如 H178" /></label>
              <label>版本<input value={pendingBook.edition} onChange={(event) => setPendingBook({ ...pendingBook, edition: event.target.value })} /></label>
              <fieldset className="volume-picker"><legend>冊別（可多選）</legend><div>{sortVolumes([...namedVolumeOptions, "1", "2", "3", ...selectedVolumes(pendingBook.volume)]).map((volume) => { const selected = selectedVolumes(pendingBook.volume).includes(volume); return <button type="button" key={volume} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => { const current = selectedVolumes(pendingBook.volume); const next = selected ? current.filter((item) => item !== volume) : [...current, volume]; setPendingBook({ ...pendingBook, volume: sortVolumes(next).join(",") }); }}>{volumeLabel(volume)}</button>; })}<button type="button" className="add-volume" onClick={() => { const current = selectedVolumes(pendingBook.volume); const numbered = current.filter((volume) => /^\d+$/.test(volume)).map(Number); const nextNumber = Math.max(3, ...numbered) + 1; setPendingBook({ ...pendingBook, volume: sortVolumes([...current, String(nextNumber)]).join(",") }); }}>＋ 新增一冊</button></div><small>可同時選擇多冊；「＋」會自動加入下一個冊號</small></fieldset>
              <label>數量<input type="number" min="1" max="999" step="1" value={pendingBook.quantity ?? 1} onChange={(event) => setPendingBook({ ...pendingBook, quantity: Math.min(999, Math.max(1, Number(event.target.value) || 1)) })} /><small>相同書籍有多本時可直接填寫數量</small></label>
              <label className="wide">放入箱子<select value={pendingBook.boxId ?? ""} onChange={(event) => setPendingBook({ ...pendingBook, boxId: event.target.value ? Number(event.target.value) : null })}><option value="">暂不归箱（使用下方独立位置）</option>{boxes.map((box) => <option key={box.id} value={box.id}>{box.code} · {box.name} · {box.location}</option>)}</select><small>选择箱子后，扫码箱码即可看到本书及箱子位置。</small></label>
              <label className="wide">独立藏储地点<input value={pendingBook.storageLocation ?? ""} onChange={(event) => setPendingBook({ ...pendingBook, storageLocation: event.target.value })} placeholder="未归箱图书可填写，例如 三楼 A区 03架" /></label>
              <label className="wide">备注<textarea value={pendingBook.note ?? ""} onChange={(event) => setPendingBook({ ...pendingBook, note: event.target.value })} placeholder="选填：品相、缺页、签名或其他说明" rows={3} /></label>
              <div className="wide book-tag-picker">
                <div className="tag-picker-title"><strong>自定义标签</strong><button type="button" onClick={() => setTagManagerOpen(true)}>管理标签</button></div>
                {tagDefinitions.length ? (
                  <div className="tag-groups">{Object.entries(Object.groupBy(tagDefinitions, (tag) => tag.category)).map(([category, tags]) => (
                    <div className="tag-group" key={category}><small>{category}</small><div>{tags?.map((tag) => {
                      const selected = tagIds(pendingBook.tags).includes(tag.id);
                      return <button type="button" key={tag.id} className={selected ? "tag-option selected" : "tag-option"} style={{ borderColor: tag.color, color: tag.color, backgroundColor: selected ? `${tag.color}1f` : "transparent" }} onClick={() => toggleBookTag(tag.id)}><b>{selected ? "−" : "+"}</b>{tag.name}</button>;
                    })}</div></div>
                  ))}</div>
                ) : <p className="no-tags">还没有标签，请先打开“管理标签”创建。</p>}
              </div>
              <div className="dialog-actions">
                {(pendingBook.coverImage || pendingBook.coverUrl) && <button type="button" className="cancel-button" disabled={Boolean(savingId)} onClick={skipPendingCover}>先不保存封面</button>}
                <button type="button" className="cancel-button" onClick={() => setPendingBook(null)}>取消</button>
                <button type="submit" className="primary-button dialog-save" disabled={Boolean(savingId)}>{savingId ? "保存中…" : pendingBook.id ? "保存修改" : "确认添加一册"}</button>
              </div>
              {message && <p className="wide" role="alert">{message}</p>}
            </form>
          </section>
        </div>
      )}
      {boxManagerOpen && (
        <div className="modal-backdrop box-manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setBoxManagerOpen(false); }}>
          <section className="catalog-dialog box-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="box-manager-title">
            <div className="dialog-heading"><div><p className="kicker">BOX REGISTER</p><h2 id="box-manager-title">箱子与条码</h2></div><button type="button" onClick={() => setBoxManagerOpen(false)} aria-label="关闭箱子管理">×</button></div>
            <p className="dialog-copy">{editingBoxId ? "正在编辑箱子；修改箱码后需要重新打印并更换箱上的标签。" : "建议箱码按“区域-架位-序号”编排，例如 BOX-A01-03。留空则自动生成。"}</p>
            <form className="new-box-form" onSubmit={createBox}>
              <label>箱码<input value={newBox.code} onChange={(event) => setNewBox({ ...newBox, code: event.target.value.toUpperCase() })} placeholder="BOX-A01-03（可留空）" /></label>
              <label>箱子名称<span>*</span><input required value={newBox.name} onChange={(event) => setNewBox({ ...newBox, name: event.target.value })} placeholder="文学类 03 箱" /></label>
              <label>分类<input value={newBox.category} onChange={(event) => setNewBox({ ...newBox, category: event.target.value })} placeholder="文学 / 历史 / 工具书" /></label>
              <label>存放位置<span>*</span><input required value={newBox.location} onChange={(event) => setNewBox({ ...newBox, location: event.target.value })} placeholder="仓库 A区 01架 2层" /></label>
              <label className="wide">备注<input value={newBox.note} onChange={(event) => setNewBox({ ...newBox, note: event.target.value })} placeholder="选填：年代、责任人或整理说明" /></label>
              <div className="wide box-form-actions">{editingBoxId && <button type="button" className="cancel-button" onClick={cancelEditBox}>取消编辑</button>}<button className="primary-button">{editingBoxId ? "保存箱子修改" : "＋ 建立箱子"}</button></div>
            </form>
            <div className="box-labels">
              {boxes.map((box) => <article className={`box-label${editingBoxId === box.id ? " editing" : ""}`} key={box.id}><div className="label-copy"><span>{box.category || "综合馆藏"}</span><h3>{box.name}</h3><p>{box.location}</p></div><Barcode value={box.code} /><footer><span>{box.bookCount ?? 0} 册</span><div className="box-card-actions no-print"><button type="button" className="edit-button" onClick={() => editBox(box)}>编辑</button><button type="button" className="delete-button" onClick={() => deleteBox(box)}>删除</button></div></footer></article>)}
              {!boxes.length && <div className="empty-tags">还没有箱子。请先建立第一个箱子。</div>}
            </div>
            {boxes.length > 0 && <div className="dialog-actions no-print"><button type="button" className="primary-button" onClick={() => window.print()}>打印全部箱码标签</button></div>}
          </section>
        </div>
      )}
      {tagManagerOpen && (
        <div className="modal-backdrop tag-manager-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setTagManagerOpen(false);
        }}>
          <section className="catalog-dialog tag-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-manager-title">
            <div className="dialog-heading">
              <div><p className="kicker">TAG MANAGER</p><h2 id="tag-manager-title">标签管理</h2></div>
              <button type="button" onClick={() => setTagManagerOpen(false)} aria-label="关闭标签管理">×</button>
            </div>
            <p className="dialog-copy">标签可按位置、图书种类或阅读状态分类；每一类可使用独立颜色。</p>
            <form className="new-tag-form" onSubmit={createTag}>
              <label>标签名称<input required value={newTag.name} onChange={(event) => setNewTag({ ...newTag, name: event.target.value })} placeholder="例如 书房、语言学、待读" /></label>
              <label>分类<select value={newTag.category} onChange={(event) => { const category = event.target.value; setNewTag({ ...newTag, category, color: categoryColors[category] ?? newTag.color }); }}><option>位置</option><option>图书种类</option><option>阅读状态</option><option>自定义</option></select></label>
              <label>颜色<span className="color-control"><input type="color" value={newTag.color} onChange={(event) => setNewTag({ ...newTag, color: event.target.value })} /><code>{newTag.color}</code></span></label>
              <button className="primary-button" type="submit">＋ 添加标签</button>
            </form>
            <div className="managed-tags">
              {Object.entries(Object.groupBy(tagDefinitions, (tag) => tag.category)).map(([category, tags]) => (
                <div className="managed-group" key={category}><h3>{category}<span>{tags?.length ?? 0}</span></h3><div>{tags?.map((tag) => <span className="managed-tag" key={tag.id} style={{ backgroundColor: `${tag.color}1f`, color: tag.color }}><i style={{ backgroundColor: tag.color }} />{tag.name}<button type="button" onClick={() => deleteTag(tag.id)} aria-label={`删除标签${tag.name}`}>−</button></span>)}</div></div>
              ))}
              {!tagDefinitions.length && <div className="empty-tags">还没有标签。用上方的“＋ 添加标签”创建第一个标签。</div>}
            </div>
          </section>
        </div>
      )}
      <footer><span>书栈 · 轻量图书管理</span><span>书目数据来自 CALIS、豆瓣图书、Open Library 与 Google Books</span></footer>
    </main>
  );
}
