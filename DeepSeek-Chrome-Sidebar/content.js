(() => {
  let timer;
  let lastText = "";
  function capture() {
    const text = globalThis.readSafeSelection();
    // 保留选文，点击侧栏导致失焦时不清空；表单中的输入不作为网页选文。
    const key = location.href + "\n" + text;
    if (!text || key === lastText) return;
    lastText = key;
    chrome.runtime.sendMessage({
      type: "selection-captured",
      text: text.slice(0, 30000),
      title: document.title,
      url: location.href
    }).catch(() => {});
  }
  document.addEventListener("selectionchange", () => {
    clearTimeout(timer);
    timer = setTimeout(capture, 180);
  });
  document.addEventListener("mouseup", capture);
  document.addEventListener("keyup", capture);
})();
