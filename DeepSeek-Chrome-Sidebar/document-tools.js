const PDF_TOOL_SPECS = [
  { type: "function", function: { name: "search_document",
    description: "搜索当前 PDF 所有页（包括末尾）。可用英文关键词搜索英文文件；不同关键词会同时检索，返回相关页码和片段。必要时更换关键词、读取邻页。",
    parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 12 } }, required: ["query"] } } },
  { type: "function", function: { name: "read_document_pages",
    description: "读取 PDF 指定页的正文。页码从 1 开始，每次最多 8 页。长页按 offset 继续读取，输出明确标注剩余内容。",
    parameters: { type: "object", properties: { start_page: { type: "integer" }, end_page: { type: "integer" }, offset: { type: "integer", minimum: 0 } }, required: ["start_page"] } } },
  { type: "function", function: { name: "document_overview",
    description: "查看全文件页数与分布在整份 PDF 中的章节线索。线索不是全文，不能据此断言未抽样页没有相关内容。",
    parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "read_entire_document",
    description: "当用户要求通读全文、比较整份文件或局部检索无法覆盖问题时使用。将所有页面分批交给模型阅读并汇总，耗时与 API 费用较高。具体局部问题优先搜索和按页读。",
    parameters: { type: "object", properties: {} } } }
];

function documentOverview(page) {
  const pages = page.pages || [];
  const step = Math.max(1, Math.ceil(pages.length / 140));
  const lines = pages.filter((_, i) => i % step === 0 || i === pages.length - 1)
    .map(p => `[第 ${p.number} 页] ${p.text.replace(/\s+/g, " ").slice(0, 140)}`);
  return `共 ${pages.length} 页，全部已在本机索引；以下是章节线索采样，不是全文。\n${lines.join("\n")}`;
}

function searchDocument(page, query, limit = 8) {
  const terms = [...new Set(String(query || "").toLowerCase().split(/[\s,，;；|]+/).filter(Boolean))].slice(0, 12);
  if (!terms.length) return { error: "请提供搜索关键词。" };
  const hits = [];
  for (const p of page.pages || []) {
    const normalized = p.text.toLowerCase();
    let score = 0;
    let first = -1;
    for (const term of terms) {
      let offset = normalized.indexOf(term);
      if (offset < 0) continue;
      score += 10;
      if (first < 0 || offset < first) first = offset;
      for (let count = 0; offset >= 0 && count < 10; count++) {
        score++;
        offset = normalized.indexOf(term, offset + term.length);
      }
    }
    if (score) hits.push({ page: p.number, score,
      snippet: p.text.slice(Math.max(0, first - 250), first + 1000) });
  }
  hits.sort((a, b) => b.score - a.score || a.page - b.page);
  const count = Math.max(1, Math.min(Number(limit) || 8, 12));
  return { searchedPages: page.pages.length, totalHits: hits.length, hits: hits.slice(0, count),
    note: hits.length ? "请按页读取正文确认条件和例外；搜索命中不是完整正文。" : "未找到匹配；请改用文档语言的关键词、同义词或章节概览。" };
}

function readDocumentPages(page, start, end = start, offset = 0) {
  start = Math.trunc(Number(start)); end = Math.trunc(Number(end ?? start));
  offset = Math.max(0, Math.trunc(Number(offset) || 0));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start || start > page.pages.length) {
    return { error: `页码需在 1–${page.pages.length} 内。` };
  }
  const actualEnd = Math.min(end, start + 7, page.pages.length);
  const text = page.pages.slice(start - 1, actualEnd).map(p => `[PDF 第 ${p.number} 页]\n${p.text}`).join("\n\n");
  return { start_page: start, end_page: actualEnd, text: text.slice(offset, offset + 35000),
    next_offset: offset + 35000 < text.length ? offset + 35000 : null,
    remaining_pages: end > actualEnd ? `本次仅读到 ${actualEnd} 页，下一次从 ${actualEnd + 1} 页继续。` : null };
}

function fullDocumentBatches(page, maxChars = 35000) {
  const batches = [];
  let text = "";
  for (const p of page.pages) {
    const label = `[PDF 第 ${p.number} 页]\n`;
    const capacity = maxChars - label.length - 2;
    for (let offset = 0; offset < Math.max(1, p.text.length); offset += capacity) {
      const part = label + p.text.slice(offset, offset + capacity) + "\n\n";
      if (text && text.length + part.length > maxChars) { batches.push(text); text = ""; }
      text += part;
    }
  }
  if (text) batches.push(text);
  return batches;
}
