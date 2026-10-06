"use client";

import { useEffect } from "react";
import OpenCC from "opencc-js/cn2t";

export type AppLocale = "zh-CN" | "zh-TW" | "en";

const toTraditionalChinese = OpenCC.Converter({ from: "cn", to: "hk" });

const englishPhrases: Record<string, string> = {
  "搜尋已保存圖書，支援簡繁體": "Search saved books in simplified or traditional Chinese",
  "导入图书、箱子和标签 JSON": "Import books, boxes and tags from JSON",
  "导出图书、箱子和标签 JSON": "Export books, boxes and tags to JSON",
  "单独导出全部图片 ZIP": "Export all images as a ZIP archive",
  "书架还空着": "Your library is empty",
  "从上方检索一条资料，把它保存到这里。": "Search for a book above and save it here.",
  "书栈首页": "Bookstack home",
  "主导航": "Main navigation",
  "功能区导航": "Section navigation",
  "功能区": "Sections",
  "书目检索": "Catalog search",
  "我的书库子菜单": "My library submenu",
  "添加 / 搜索": "Add / search",
  "语言切换": "Language switcher",
  "检索方式": "Search method",
  "书栈": "Bookstack",
  "找一本书，": "Find a book. ",
  "留一份记录。": "Keep the record.",
  "书栈 · 轻量图书管理": "Bookstack · Lightweight library management",
  "书目数据来自 CALIS、豆瓣图书、Open Library 与 Google Books": "Bibliographic data from CALIS, Douban Books, Open Library and Google Books",
  "自动识别 ISBN、ISSN、ISMN、DOI、统一书号和出版物条码，再从 CALIS、Crossref、ISSN Portal 等来源查找对应记录。": "Identify ISBN, ISSN, ISMN, DOI, Unified Book Numbers and publication barcodes, then search trusted catalog sources.",
  "保存过的书目会留在这里，刷新页面也不会丢失。": "Saved books stay here, even after you refresh the page.",
  "用扫码枪扫描箱上条码，或直接输入箱码并回车。": "Scan a box barcode, or enter its code and press Enter.",
  "没有索书号也没关系，只需填写书名即可入库": "No call number needed—just enter a title",
  "找一本书，留一份记录。": "Find a book. Keep the record.",
  "LIBRARY DESK · 中文书目工作台": "LIBRARY DESK · CATALOG WORKSPACE",
  "多来源书目服务": "Multi-source catalog service",
  "输入 ISBN、ISSN、ISMN、DOI 或条码": "Enter ISBN, ISSN, ISMN, DOI or barcode",
  "输入统一书号，例如 10018·309": "Enter a Unified Book Number, e.g. 10018·309",
  "输入索书号，例如 TP311.56": "Enter a call number, e.g. TP311.56",
  "标准编号或出版物条码": "Standard ID or publication barcode",
  "支持图书、期刊、乐谱与学术文献编号": "Supports books, journals, scores and academic publications",
  "支持 1987 年前中文出版物使用的统一书号": "Supports Unified Book Numbers used before 1987",
  "索书号由 CALIS 联合目录查询": "Call numbers are searched through the CALIS catalog",
  "在 CALIS 查看": "View in CALIS",
  "扫描或输入箱码，例如 BOX-A01": "Scan or enter a box code, e.g. BOX-A01",
  "搜索书名、位置或标签（支持简繁体）": "Search title, location or tag",
  "搜寻书名、位置或标签（支援简繁体）": "Search title, location or tag",
  "箱子与条码": "Boxes & barcodes",
  "建议箱码按“区域-架位-序号”编排，例如 BOX-A01-03。留空则自动生成。": "Use an area–shelf–number format such as BOX-A01-03, or leave it blank to generate a code automatically.",
  "正在编辑箱子；修改箱码后需要重新打印并更换箱上的标签。": "You are editing this box. If its code changes, print and replace the box label.",
  "标签可按位置、图书种类或阅读状态分类；每一类可使用独立颜色。": "Organize tags by location, book type or reading status, each with its own color.",
  "还没有标签。用上方的“＋ 添加标签”创建第一个标签。": "No tags yet. Use “+ Add tag” above to create one.",
  "还没有箱子。请先建立第一个箱子。": "No boxes yet. Create your first box above.",
  "这个箱子目前还没有图书。": "This box is currently empty.",
  "暂不归箱（使用下方独立位置）": "No box yet (use location below)",
  "自定义标签": "Custom tags",
  "独立藏储地点": "Standalone location",
  "出版信息 / 备注": "Publication / notes",
  "所属箱 / 位置": "Box / location",
  "书名 / 责任者": "Title / author",
  "标准编号": "Standard ID",
  "统一书号": "Unified Book No.",
  "索书号": "Call number",
  "分类号 / 索书号": "Class / call number",
  "我的书库": "My library",
  "扫码找箱": "Find a box",
  "按箱子": "By box",
  "按分类": "By category",
  "全部箱子": "All boxes",
  "全部分类": "All categories",
  "清除筛选": "Clear filters",
  "按箱子或分类筛选藏书": "Filter books by box or category",
  "筛选我的书库": "Filter my library",
  "箱子": "Box",
  "这个筛选条件下没有藏书。": "No books match these filters.",
  "箱子管理": "Manage boxes",
  "管理箱子": "Manage boxes",
  "管理标签": "Manage tags",
  "标签管理": "Tag manager",
  "检索结果": "Search results",
  "查找书目": "Search catalogs",
  "正在检索…": "Searching…",
  "正在并行查询多个书目来源…": "Searching multiple catalog sources…",
  "直接添加图书": "Add a book manually",
  "馆藏总数": "Total copies",
  "书目记录数": "Catalog records",
  "本月新增": "Added this month",
  "馆藏箱数": "Storage boxes",
  "序号": "No.",
  "照片": "Photo",
  "册别": "Volumes",
  "分类号": "Class No.",
  "标签": "Tags",
  "操作": "Actions",
  "调整表格顺序": "Reorder rows",
  "完成排序": "Finish reordering",
  "按住每行左侧把手拖放": "Drag the handle on the left of a row",
  "拖曳排序": "Drag to reorder",
  "选择完整书库备份文件": "Choose a full library backup",
  "选择图片 ZIP 备份文件": "Choose an image ZIP backup",
  "编辑": "Edit",
  "删除": "Delete",
  "取消": "Cancel",
  "保存中…": "Saving…",
  "保存修改": "Save changes",
  "确认添加一册": "Add copy",
  "保存到书库": "Save to library",
  "编辑馆藏信息": "Edit library record",
  "确认入库信息": "Confirm book details",
  "书名": "Title",
  "作者": "Author",
  "出版社": "Publisher",
  "出版年份": "Year",
  "版本": "Edition",
  "数量": "Quantity",
  "放入箱子": "Storage box",
  "备注": "Notes",
  "选择封面": "Choose cover",
  "箱码": "Box code",
  "箱子名称": "Box name",
  "分类": "Category",
  "存放位置": "Location",
  "建立箱子": "Create box",
  "保存箱子修改": "Save box changes",
  "取消编辑": "Cancel editing",
  "打印全部箱码标签": "Print all box labels",
  "查询箱子": "Find box",
  "已找到": "Found",
  "箱内数量": "Copies in box",
  "箱内图书": "Books in box",
  "未分类": "Uncategorized",
  "未编目": "Not cataloged",
  "待编目": "Not cataloged",
  "未归箱": "No box",
  "未知箱": "Unknown box",
  "无标签": "No tags",
  "未标注": "Not specified",
  "书目来源": "Catalog source",
  "未题名书目": "Untitled record",
  "责任者未标注": "Author not specified",
  "出版": "Published",
  "待补充": "To be added",
  "导入数据": "Import data",
  "导出数据": "Export data",
  "导入图片": "Import images",
  "导出图片": "Export images",
  "导入中…": "Importing…",
  "导出中…": "Exporting…",
  "图片导入中…": "Importing images…",
  "图片导出中…": "Exporting images…",
  "标签名称": "Tag name",
  "颜色": "Color",
  "添加标签": "Add tag",
  "位置": "Location",
  "图书种类": "Book type",
  "阅读状态": "Reading status",
  "自定义": "Custom",
  "检索": "Search",
  "简体中文": "Simplified Chinese",
  "繁体中文": "Traditional Chinese",
  "英文": "English",
};

const englishEntries = Object.entries(englishPhrases)
  .flatMap(([source, target]) => [[source, target], [toTraditionalChinese(source), target]] as [string, string][])
  .sort(([a], [b]) => b.length - a.length);

function english(value: string): string {
  let result = value;
  for (const [source, target] of englishEntries) result = result.replaceAll(source, target);
  result = result
    .replace(/(\d+) [条條]记录/g, "$1 records")
    .replace(/(\d+) [册冊]/g, "$1 copies")
    .replace(/已有 (\d+) [册冊]/g, "$1 already")
    .replace(/再添加一[册冊]/g, "Add another copy")
    .replace(/第(\d+)[册冊]/g, "Vol. $1");
  if (/^\s*[册冊]\s*$/.test(result)) result = result.replace(/[册冊]/, "copies");
  return result;
}

function translate(value: string, locale: AppLocale): string {
  if (locale === "zh-CN") return value;
  if (locale === "zh-TW") return toTraditionalChinese(value);
  return english(value);
}

type TranslationRecord = { source: string; rendered: string };
const textRecords = new WeakMap<Text, TranslationRecord>();
const attributeRecords = new WeakMap<Element, Map<string, TranslationRecord>>();

export function LanguageBridge({ locale }: { locale: AppLocale }) {
  useEffect(() => {
    const attributes = ["aria-label", "placeholder", "title", "label"];
    let applying = false;

    function apply(root: Node) {
      if (applying) return;
      applying = true;
      const elements: Element[] = root instanceof Element ? [root] : [];
      if (root instanceof Element || root instanceof Document) elements.push(...root.querySelectorAll("*"));

      for (const element of elements) {
        if (element.closest("[data-no-translate]")) continue;
        for (const name of attributes) {
          const current = element.getAttribute(name);
          if (!current) continue;
          const records = attributeRecords.get(element) ?? new Map<string, TranslationRecord>();
          const previous = records.get(name);
          const source = previous && current === previous.rendered ? previous.source : current;
          const rendered = translate(source, locale);
          if (current !== rendered) element.setAttribute(name, rendered);
          records.set(name, { source, rendered });
          attributeRecords.set(element, records);
        }
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        if (!node.parentElement?.closest("[data-no-translate], script, style") && node.data.trim()) {
          const previous = textRecords.get(node);
          const source = previous && node.data === previous.rendered ? previous.source : node.data;
          const rendered = translate(source, locale);
          if (node.data !== rendered) node.data = rendered;
          textRecords.set(node, { source, rendered });
        }
        node = walker.nextNode() as Text | null;
      }
      applying = false;
    }

    apply(document);
    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      for (const mutation of mutations) apply(mutation.type === "characterData" ? mutation.target.parentNode ?? mutation.target : mutation.target);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => observer.disconnect();
  }, [locale]);

  return null;
}
