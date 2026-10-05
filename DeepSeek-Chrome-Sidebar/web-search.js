// Official DeepSeek Anthropic-compatible server-side search. No third-party keys.
const WEB_SEARCH_TOOL = { type: "function", function: {
  name: "search_web",
  description: "搜索互联网以核实最新信息或补充当前网页/PDF。提供简短搜索问题，结果是搜索摘要而非已读取所有原网页。",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
} };

async function searchWeb(query, { apiKey, model, signal }) {
  if (typeof query !== "string" || !query.trim()) throw new Error("搜索问题不能为空。");
  const response = await fetch("https://api.deepseek.com/anthropic/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    body: JSON.stringify({ model, max_tokens: 2500, stream: false, reasoning: { effort: "none" },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: `请必须调用网页搜索工具，搜索并核实以下问题。用简短中文总结搜索发现，引用真实来源。不要只依靠训练知识回答。问题：${query.trim().slice(0, 1500)}` }]
    })
  });
  if (!response.ok) {
    // Do not repeat server bodies that might contain user data or credentials.
    throw new Error(`官方联网搜索请求失败（HTTP ${response.status}）。此接口可能不支持当前模型或搜索工具。`);
  }
  const data = await response.json();
  if (data.stop_reason === "max_tokens") throw new Error("搜索摘要被截断，请缩小搜索问题后重试。");
  const blocks = Array.isArray(data.content) ? data.content : [];
  const sources = new Map();
  let searched = false;
  let toolError = false;
  const addSource = (source, cited = false) => {
    try {
      const url = new URL(source.url);
      if (!['https:', 'http:'].includes(url.protocol)) return;
      sources.set(url.href, { title: String(source.title || url.hostname).slice(0, 300), url: url.href, cited: cited || sources.get(url.href)?.cited || false });
    } catch { /* Ignore malformed and unsafe result links. */ }
  };
  for (const block of blocks) {
    if (block.type === "web_search_tool_result") {
      searched = true;
      if (!Array.isArray(block.content)) toolError = true;
      for (const result of Array.isArray(block.content) ? block.content : []) {
        if (result.type === 'web_search_tool_result_error') toolError = true;
        if (result.type === 'web_search_result') addSource(result);
      }
    }
    for (const citation of Array.isArray(block.citations) ? block.citations : []) addSource(citation, true);
  }
  if (!searched || toolError || !sources.size) throw new Error("未取得可核查的联网搜索结果。官方兼容接口是否可用仍需实际验证；不会将普通回答当成联网结果。");
  return { query: query.slice(0, 1500), summary: blocks.filter(b => b.type === 'text').map(b => b.text || '').join('\n').slice(0, 12000),
    sources: [...sources.values()].slice(0, 20), note: "这是官方搜索工具产生的摘要和来源链接，不表示插件已完整读取这些网页。" };
}

// Presentation only: retain full retrieval context, but display/store five useful references.
function selectSearchSources(sources, answer = "") {
  const unique = new Map();
  const plainAnswer = String(answer).replace(/\\/g, "");
  const canonical = url => {
    const key = new URL(url);
    key.hash = "";
    for (const name of [...key.searchParams.keys()]) {
      if (/^utm_/i.test(name) || ['fbclid', 'gclid', 'authuser'].includes(name)) key.searchParams.delete(name);
    }
    key.searchParams.sort();
    return key.href;
  };
  const mentioned = new Set();
  for (const link of plainAnswer.match(/https?:\/\/[^\s<>"'\]\)]+/g) || []) {
    try { mentioned.add(canonical(link)); } catch { /* Not a valid link. */ }
  }
  for (const source of Array.isArray(sources) ? sources : []) {
    try {
      const url = new URL(source.url);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const key = canonical(url.href);
      const cited = Boolean(source.cited) || mentioned.has(key);
      const candidate = { ...source, cited };
      const previous = unique.get(key);
      if (!previous || (cited && !previous.cited)) unique.set(key, candidate);
    } catch { /* Old histories may contain malformed URLs. */ }
  }
  return [...unique.values()].sort((a, b) => Number(b.cited) - Number(a.cited)).slice(0, 5);
}
