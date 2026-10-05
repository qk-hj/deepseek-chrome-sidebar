const MENU_ID = "ask-with-deepseek";
const activeTabs = new Map();
let focusedWindow;
chrome.tabs.onActivated.addListener(info => { activeTabs.set(info.windowId, info.tabId); });
chrome.tabs.onUpdated.addListener((id, change, tab) => { if (tab.active) activeTabs.set(tab.windowId, id); });
chrome.windows.onFocusChanged.addListener(id => { if (id >= 0) focusedWindow = id; });
chrome.tabs.query({}).then(tabs => {
  for (const tab of tabs) if (tab.active) activeTabs.set(tab.windowId, tab.id);
}).catch(() => {});
chrome.windows.getLastFocused().then(win => { focusedWindow = win.id; }).catch(() => {});
chrome.tabs.onRemoved.addListener(async id => {
  for (const [win, tab] of activeTabs) if (tab === id) activeTabs.delete(win);
  await chrome.storage.session.remove(['deepseekTabChat:', 'deepseekTabParent:', 'deepseekTabInheritedChat:', 'deepseekTabDetached:'].map(prefix => prefix + id));
});

// Persist link ancestry even when the side panel is closed or Chrome omits openerTabId.
chrome.tabs.onCreated.addListener((tab) => {
  if (Number.isInteger(tab.openerTabId)) rememberTabParent(tab.id, tab.openerTabId);
});
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  rememberTabParent(details.tabId, details.sourceTabId);
});

async function rememberTabParent(tabId, parentId) {
  if (tabId === parentId) return;
  const linkedKey = `deepseekTabInheritedChat:${tabId}`;
  const parentKey = `deepseekTabChat:${parentId}`;
  try {
    const data = await chrome.storage.session.get([linkedKey, parentKey]);
    const updates = { [`deepseekTabParent:${tabId}`]: parentId };
    if (!data[linkedKey] && data[parentKey]) updates[linkedKey] = data[parentKey];
    await chrome.storage.session.set(updates);
  } catch (error) { console.error("无法记录链接来源：", error); }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "selection-captured" || !sender.tab?.active) return;
  publishSelection(message);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: MENU_ID,
    title: "用 DeepSeek 提问",
    contexts: ["selection"]
  }, () => { if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message); }));

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("无法设置侧栏行为：", error));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  // open() 必须紧跟用户手势调用，不能放在 await 之后。
  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    console.error("无法打开侧栏：", error);
  });

  publishSelection({
    text: info.selectionText || "",
    title: tab.title || "",
    url: info.pageUrl || tab.url || ""
  });
});

chrome.commands.onCommand.addListener(async (command, commandTab) => {
  if (command !== "open-deepseek-sidebar") return;

  const id = commandTab?.id || activeTabs.get(focusedWindow);
  if (!id && !Number.isInteger(focusedWindow)) return;
  chrome.sidePanel.open(id ? { tabId: id } : { windowId: focusedWindow }).catch((error) => {
    console.error("无法打开侧栏：", error);
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["selection-guard.js"] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.readSafeSelection()
    });
    const text = result?.result?.trim() || "";
    if (text) {
      publishSelection({ text, title: tab.title || "", url: tab.url || "" });
    }
  } catch (error) {
    // chrome:// 等受保护页面不允许注入脚本，侧栏仍然可以正常打开。
    console.debug("当前页面不能读取选中文字：", error);
  }
});

function publishSelection({ text, title, url }) {
  const payload = {
    id: crypto.randomUUID(),
    text: text.trim(),
    title,
    url,
    capturedAt: Date.now()
  };

  chrome.storage.session.set({ pendingSelection: payload }).catch((error) => {
    console.error("无法暂存选中文字：", error);
  });
}
