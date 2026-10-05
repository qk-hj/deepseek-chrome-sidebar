const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { webcrypto } = require('crypto');
const values = {};
let calls = 0, confirms = 0, accept = true, failNext = false, failStorage = false, truncateOnce = false;
const context = {
  crypto: webcrypto, TextEncoder, AbortController,
  document: { addEventListener() {} },
  window: { confirm() { confirms++; return accept; } },
  chrome: { storage: { session: {
    async get(key) { return structuredClone(key === null ? values : { [key]: values[key] }); },
    async set(data) { if (failStorage) throw new Error('quota'); Object.assign(values, structuredClone(data)); },
    async remove(keys) { for (const key of keys) delete values[key]; }
  } } },
  async request(body) {
    calls++;
    assert(!body.messages[1].content.includes('PRIVATE_QUESTION'));
    assert(body.messages[0].content.includes('可复用'));
    if (failNext) { failNext = false; await new Promise(resolve => setTimeout(resolve, 20)); throw new Error('mock failure'); }
    if (truncateOnce) { truncateOnce=false; return {async json(){return {choices:[{message:{content:'残缺笔记'},finish_reason:'length'}]};}}; }
    return { async json() { return { choices: [{ message: { content: '通用笔记，条款见第 1 页。' }, finish_reason: 'stop' }] }; } };
  }
};
vm.createContext(context);
const root = path.join(__dirname, '../DeepSeek-Chrome-Sidebar');
vm.runInContext(fs.readFileSync(path.join(root, 'document-tools.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'sidepanel.js'), 'utf8') +
  '\nsetDocumentActivity = () => {}; showToast = () => {}; postChat = request; confirmReading = async () => { confirmsProxy(); return acceptProxy(); }; el.pdfReadMode={value:"full"}; globalThis.test = { state, scanEntireDocument };', Object.assign(context, { confirmsProxy: () => confirms++, acceptProxy: () => accept }));
const { state, scanEntireDocument: scan } = context.test;
const page = (text = 'a', size = 80000) => ({ totalPages: 1, pages: [{ number: 1, text: text.repeat(size) }] });
const freshSignal = () => { state.abortController = new AbortController(); };
(async () => {
  state.settings.model = 'model-one';
  freshSignal();
  const first = await scan(page(), 'PRIVATE_QUESTION_ONE', 0);
  assert.equal(calls, 3);
  assert(first.includes('有损摘要'));
  freshSignal();
  await scan(page(), 'PRIVATE_QUESTION_TWO', 0);
  assert.equal(calls, 3, 'follow-up must not re-scan');
  state.fullReadCache.clear(); // Simulate reopening the side panel, not Chrome.
  freshSignal();
  await scan(page(), 'PRIVATE_QUESTION_THREE', 0);
  assert.equal(calls, 3, 'session cache must survive panel reopening');
  freshSignal();
  await scan(page('b'), 'PRIVATE_QUESTION_FOUR', 0);
  assert.equal(calls, 6, 'changed document must invalidate cache');
  state.settings.model = 'model-two';
  freshSignal();
  await scan(page('b'), 'PRIVATE_QUESTION_FIVE', 0);
  assert.equal(calls, 9, 'changed model must invalidate cache');

  accept = false;
  freshSignal();
  assert.equal(await scan(page('c', 320000), 0), null);
  assert.equal(confirms, 1);
  assert.equal(calls, 9, 'declining must not send scan requests');
  accept = true;
  freshSignal();
  await scan(page('c', 320000), '', 0);
  assert.equal(confirms, 2);
  assert.equal(calls, 19);
  freshSignal();
  await scan(page('c', 320000), '', 0);
  assert.equal(calls, 19);
  assert.equal(confirms, 2, 'cached scan should not ask for cost confirmation');
  assert(Object.keys(values).filter(key => key.startsWith('fullReadNotes:')).length <= 3);

  failNext = true;
  freshSignal();
  await assert.rejects(scan(page('d', 160000), '', 0), /mock failure/);
  const partial = Object.values(values).find(record => record.notes?.some(note => note === null));
  assert(partial?.notes.filter(Boolean).length > 0, 'completed batches must survive failure');
  const completed = partial.notes.filter(Boolean).length;
  const beforeRetry = calls;
  state.fullReadCache.clear();
  freshSignal();
  await scan(page('d', 160000), '', 0);
  assert.equal(calls - beforeRetry, 5 - completed, 'retry must only read missing batches');

  failStorage = true;
  freshSignal();
  await scan(page('e'), '', 0);
  const beforeReuse = calls;
  freshSignal();
  await scan(page('e'), '', 0);
  assert.equal(calls, beforeReuse, 'memory cache should work even when storage fails');
  truncateOnce=true; freshSignal();const beforeSplit=calls;
  const splitNotes=await scan(page('f',30000),0);
  assert.equal(calls-beforeSplit,3,'one truncated batch must split into exactly two retry requests');
  assert(!splitNotes.includes('残缺笔记'),'truncated notes must not be cached as complete');
  console.log('PASS: follow-up and reopened-panel reuse; content/model invalidation; cost confirmation; bounded cache; failed-batch resume; storage-failure fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
