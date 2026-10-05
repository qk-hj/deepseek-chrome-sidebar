// Shared by automatic capture and isolated-world scripting injections.
globalThis.readSafeSelection = function () {
  const selection = window.getSelection();
  const editable = node => {
    let element = node?.nodeType === 1 ? node : node?.parentElement;
    while (element) {
      if (element.isContentEditable || element.matches?.('input, textarea')) return true;
      element = element.parentElement || element.getRootNode?.().host;
    }
    return false;
  };
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (editable(active) || editable(selection?.anchorNode) || editable(selection?.focusNode)) return '';
  // A range spanning an editor must not include its unsent contents either.
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    for (const editor of document.querySelectorAll('input, textarea, [contenteditable]')) {
      if ((editor.isContentEditable || editor.matches('input, textarea')) && range.intersectsNode(editor)) return '';
    }
  }
  return selection?.toString().trim() || '';
};
