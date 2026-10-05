import { getDocument, GlobalWorkerOptions } from "./vendor/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;
export const MAX_PDF_BYTES = 60 * 1024 * 1024;

export async function extractPdf(buffer, onProgress = () => {}, signal) {
  signal?.throwIfAborted();
  if (buffer.byteLength > MAX_PDF_BYTES) throw new Error("PDF 超过 60 MB，请换一个较小的文件。");
  const task = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    cMapUrl: new URL("./vendor/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("./vendor/standard_fonts/", import.meta.url).href
  });
  const abort = () => { task.destroy().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    const pages = [];
    let length = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      signal?.throwIfAborted();
      onProgress(n, pdf.numPages);
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      signal?.throwIfAborted();
      const text = content.items.map((item) => typeof item.str === "string"
        ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
      pages.push({ number: n, text });
      length += text.length;
      page.cleanup();
    }
    const fullText = pages.map(page => `[PDF 第 ${page.number} 页]\n${page.text}`).join("\n\n");
    // Keep every page locally. The initial model context is only an entry point,
    // not a limit on which pages it can subsequently search/read.
    const text = length <= 180000 ? fullText
      : pages.slice(0, 3).map(page => `[PDF 第 ${page.number} 页]\n${page.text.slice(0, 7000)}`).join("\n\n");
    if (pages.reduce((count, page) => count + page.text.trim().length, 0) < 30) {
      throw new Error("这份 PDF 没有可提取的文字，可能是扫描件；目前还需要 OCR。");
    }
    return { text, pages, totalPages: pdf.numPages, pagesRead: pdf.numPages,
      indexed: true, large: length > 180000, totalCharacters: length };
  } catch (error) {
    signal?.throwIfAborted();
    if (error.name === "PasswordException") throw new Error("PDF 有密码保护，请先解锁再读取。");
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
}
