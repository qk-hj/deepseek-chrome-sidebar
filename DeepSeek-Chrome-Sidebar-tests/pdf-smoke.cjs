// Run: npm run test:pdf -- <18-page SeqAcademy PDF> [456-page Erasmus guide PDF]
// Uses an isolated Chrome profile and a fake API response. No real key is used.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../DeepSeek-Chrome-Sidebar');
const paper = process.argv[2];
const longPaper = process.argv[3];
if (!paper) throw new Error('Supply the test PDF path');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/test-paper.pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(paper).pipe(res);
    return;
  }
  const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end(); return;
  }
  const ext = path.extname(target);
  res.setHeader('Content-Type', ({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css'})[ext] || 'application/octet-stream');
  // Same CSP restrictions as an MV3 extension: no eval, no remote executable code.
  if (ext === '.html') res.setHeader('Content-Security-Policy', "script-src 'self'; object-src 'self'");
  fs.createReadStream(target).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(require('./browser-options.cjs')());
  try {
    const page = await browser.newPage({viewport:{width:420,height:850}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    let readingTest = null;
    await page.route('https://api.deepseek.com/models', route => route.fulfill({contentType:'application/json',body:JSON.stringify({data:[{id:'deepseek-flash'},{id:'deepseek-v4-pro'}]})}));
    await page.route('https://api.deepseek.com/chat/completions', async route => {
      const fulfill = route.fulfill.bind(route);
      route.fulfill = options => {
        if (options.contentType === 'text/event-stream' && !options.body.includes('finish_reason')) {
          const reason = options.body.includes('tool_calls') ? 'tool_calls' : 'stop';
          options.body = options.body.replace('data: [DONE]', `data: ${JSON.stringify({choices:[{delta:{},finish_reason:reason}]})}\n\ndata: [DONE]`);
        }
        return fulfill(options);
      };
      const body = route.request().postDataJSON();
      requests.push(body);
      if (readingTest?.mode === 'tools') {
        const step = readingTest.step++;
        if (step === 0) {
          // Arguments intentionally split across chunks to exercise tool-call streaming.
          await route.fulfill({contentType:'text/event-stream',body:
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"find","function":{"name":"search_document","arguments":"{\\"query\\":\\"elig"}}]}}]}\n\n' +
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ibility\\"}"}}]}}]}\n\ndata: [DONE]\n\n'});
        } else if (step === 1) {
          assert(body.messages.some(m=>m.role==='tool' && JSON.parse(m.content).searchedPages===456));
          await route.fulfill({contentType:'text/event-stream',body:'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"read-tail","function":{"name":"read_document_pages","arguments":"{\\"start_page\\":400,\\"end_page\\":401}"}}]}}]}\n\ndata: [DONE]\n\n'});
        } else {
          const tail = body.messages.find(m=>m.role==='tool' && m.tool_call_id==='read-tail');
          assert(tail && JSON.parse(tail.content).text.includes('[PDF 第 400 页]'));
          await route.fulfill({contentType:'text/event-stream',body:'data: {"choices":[{"delta":{"content":"第 400 页已读取（测试响应）。"}}]}\n\ndata: [DONE]\n\n'});
        }
        return;
      }
      if (readingTest?.mode === 'full' && body.stream === false) {
        readingTest.batches.push(body.messages.at(-1).content);
        await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'本批原文已检查（测试笔记）。'}}]})});
        return;
      }
      await route.fulfill({contentType:'text/event-stream',body:'data: {"choices":[{"delta":{"content":"作者单位见第 1 页。"}}]}\n\ndata: [DONE]\n\n'});
    });
    await page.addInitScript(({base}) => {
      globalThis.testTab = {id:1, active:true, url:base + '/test-paper.pdf',title:'SeqAcademy'};
      const empty = {addListener(){}};
      const values = JSON.parse(sessionStorage.getItem('testSession') || '{}');
      globalThis.testEvents = {activated: [], updated: []};
      const local = {
        get: async key => {
          const saved = JSON.parse(localStorage.getItem('testExtensionStorage') || '{}');
          const all = {deepseekSettings:{apiKey:'test-placeholder'}, ...saved};
          if (key === null) return all;
          return Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, all[k]]));
        },
        set: async v => localStorage.setItem('testExtensionStorage', JSON.stringify({...JSON.parse(localStorage.getItem('testExtensionStorage') || '{}'), ...v})),
        remove: async k => {
          const saved = JSON.parse(localStorage.getItem('testExtensionStorage') || '{}');
          delete saved[k]; localStorage.setItem('testExtensionStorage', JSON.stringify(saved));
        }
      };
      globalThis.chrome = {
        windows:{getCurrent:async()=>({id:1})},
        tabs:{query:async()=>[globalThis.testTab],update:async()=>{throw new Error('History must never navigate tabs');},
          onActivated:{addListener:fn=>testEvents.activated.push(fn)},onUpdated:{addListener:fn=>testEvents.updated.push(fn)},onRemoved:empty},
        extension:{isAllowedFileSchemeAccess:async()=>false},
        scripting:{executeScript:async()=>[{result:{title:'其他网页',url:globalThis.testTab.url,text:'新页面内容',selection:''}}]},
        storage:{onChanged:empty,local,session:{get:async()=>values,
          set:async v=>{Object.assign(values,v);sessionStorage.setItem('testSession',JSON.stringify(values));},
          remove:async k=>{delete values[k];sessionStorage.setItem('testSession',JSON.stringify(values));}}}
      };
    }, {base});
    await page.goto(base + '/sidepanel.html');
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.startsWith('PDF ·'), {timeout:60000});
    assert.match(await page.locator('#pageStatus').textContent(), /18 页/);
    const parseStop=await page.evaluate(async base=>{
      const module=await pdfModule();const buffer=await(await fetch(base+'/test-paper.pdf')).arrayBuffer();const controller=new AbortController();
      try {await module.extractPdf(buffer,n=>{if(n===2) controller.abort();},controller.signal);return 'not stopped';}
      catch(error){return error.name;}
    },base);
    assert.equal(parseStop,'AbortError','Real PDF.js parse must stop');
    await page.route('**/slow-stop.pdf',async route=>{await new Promise(resolve=>setTimeout(resolve,100));await route.fulfill({contentType:'application/pdf',body:fs.readFileSync(paper)}).catch(()=>{});});
    const downloadStop=await page.evaluate(async base=>{
      const controller=new AbortController();setTimeout(()=>controller.abort(),20);
      try {await readPdfUrl(base+'/slow-stop.pdf','Slow PDF',true,state.refreshSequence,controller.signal);return 'not stopped';}
      catch(error){return error.name;}
    },base);
    assert.equal(downloadStop,'AbortError','PDF download must stop');
    await page.locator('#promptInput').fill('第一作者来自什么单位？');
    await page.locator('#sendButton').click();
    await page.waitForFunction(() => document.querySelector('.message.assistant')?.textContent.includes('作者单位见第 1 页'));
    assert.equal(requests.length, 1);
    const content = requests[0].messages.at(-1).content;
    for (const text of ['[PDF 第 1 页]', '[PDF 第 18 页]', 'Syed Hussain', 'National Institute of Diabetes', 'National Institutes of Health']) assert(content.includes(text), text);
    await page.waitForFunction(() => !document.querySelector('#promptInput').disabled);
    await page.evaluate(base => { testTab.id = 2; testTab.url = base + '/other';
      testEvents.activated.forEach(fn=>fn({tabId:2,windowId:1})); }, base);
    await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === '新对话');
    await page.locator('#promptInput').fill('新页面说了什么');
    await page.locator('#sendButton').click();
    await page.waitForFunction(() => !document.querySelector('#promptInput').disabled);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].messages.length, 2, 'Old paper conversation must not enter new-page request');
    // Returning to the original document restores its own messages and context.
    await page.evaluate(base => { testTab.id = 1; testTab.url = base + '/test-paper.pdf'; }, base);
    await page.locator('#refreshPageButton').click();
    await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === '第一作者来自什么单位？');
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.startsWith('PDF ·'));
    assert.equal(await page.locator('.message').count(), 2);
    await page.locator('#newChatButton').click();
    await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === '新对话');
    assert.equal(await page.locator('.message').count(), 0);
    await page.locator('#historyButton').click();
    await page.locator('.history-item').filter({hasText:'第一作者来自什么单位？'}).locator('.history-open').click();
    assert.equal(await page.locator('.message').count(), 2, 'New chat must preserve old chat');
    await page.locator('#historyButton').click();
    await page.locator('.history-item').filter({hasText:'第一作者来自什么单位？'}).locator('[data-action="rename"]').click();
    await page.locator('#renameInput').fill('SeqAcademy 作者与单位');
    await page.locator('#renameForm button[type="submit"]').click();
    assert.equal(await page.locator('#chatTitle').textContent(), 'SeqAcademy 作者与单位');
    // Unsent conversations must never appear in history.
    assert.equal(await page.locator('.history-item').filter({hasText:'新对话'}).count(), 0);
    assert.equal(await page.locator('.history-item').count(), 2);
    await page.evaluate(async () => {
      const chat = state.store.create({url:testTab.url,title:'删除测试'});
      chat.title = '只删除这一条';
      chat.messages = [{role:'user',content:'测试问题'},{role:'assistant',content:'测试回答'}];
      await state.store.save(chat);
      renderHistory();
    });
    const disposable = page.locator('.history-item').filter({hasText:'只删除这一条'});
    await disposable.locator('[data-action="delete"]').click();
    await disposable.locator('[data-action="delete"]').click();
    assert.equal(await page.locator('.history-item').count(), 2);
    await page.screenshot({path:path.join(__dirname, 'history-preview.png')});
    await page.locator('#closeHistoryButton').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.startsWith('PDF ·'));
    assert.equal(await page.locator('#chatTitle').textContent(), 'SeqAcademy 作者与单位');
    assert.equal(await page.locator('.message').count(), 2, 'Stored chat must survive sidebar reload');
    // Same-tab links, including a different domain, continue the existing discussion.
    const departmentUrl = 'https://biology.example.edu/faculty';
    await page.evaluate(url => { testTab.url = url;
      testEvents.updated.forEach(fn=>fn(1,{status:'complete'}, {...testTab,windowId:1})); }, departmentUrl);
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.includes('当前页面 ·'));
    assert.equal(await page.locator('#chatTitle').textContent(), 'SeqAcademy 作者与单位');
    assert.equal(await page.locator('.message').count(), 2, 'Same-tab navigation must preserve chat');
    await page.locator('#promptInput').fill('结合前面的讨论分析这个生科院页面');
    await page.locator('#sendButton').click();
    await page.waitForFunction(() => !document.querySelector('#promptInput').disabled);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].messages.length, 4, 'Earlier questions/answers must accompany same-tab navigation');
    assert(requests[2].messages.at(-1).content.includes(departmentUrl));
    assert(requests[2].messages[1].content.includes('第一作者来自什么单位'));
    await page.locator('#historyButton').click();
    await page.locator('.history-item').filter({hasText:'新页面说了什么'}).locator('.history-open').click();
    assert.equal(await page.evaluate(() => testTab.url), departmentUrl, 'History restore must leave webpage untouched');
    assert.equal(await page.locator('#chatTitle').textContent(), '新页面说了什么');
    assert.equal(await page.locator('.message').count(), 2);
    await page.locator('#historyButton').click();
    await page.locator('.history-item').filter({hasText:'SeqAcademy 作者与单位'}).locator('.history-open').click();
    assert.equal(await page.evaluate(() => testTab.url), departmentUrl);
    assert.equal(await page.locator('.message').count(), 4);
    await page.evaluate(() => { testTab.url = 'file:///C:/test.pdf'; });
    await page.locator('#refreshPageButton').click();
    await page.waitForFunction(() => document.querySelector('#pageErrorText').textContent.includes('Allow access to file URLs'));
    await page.locator('#promptInput').fill('这个作者是谁');
    await page.locator('#sendButton').click();
    await page.waitForFunction(() => !document.querySelector('#promptInput').disabled);
    assert.equal(requests.length, 3, 'Unreadable document must not send stale context');
    // Manual file selection works without file:// access and persists for follow-up questions.
    await page.locator('#pdfFileInput').setInputFiles(paper);
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.startsWith('PDF ·'), {timeout:60000});
    await page.locator('#promptInput').fill('这篇论文第一作者的单位');
    await page.locator('#sendButton').click();
    await page.waitForFunction(() => !document.querySelector('#promptInput').disabled);
    assert.equal(requests.length, 4);
    assert(requests[3].messages.at(-1).content.includes('National Institute of Diabetes'));
    // A link-opened child inherits the parent chat, and its replies appear on return.
    const parentCount = await page.locator('.message').count();
    await page.evaluate(() => {
      testTab = {id:3,openerTabId:1,active:true,url:'https://biology.example.edu/lab',title:'实验室'};
      testEvents.activated.forEach(fn=>fn({tabId:3,windowId:1}));
    });
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.includes('当前页面 ·'));
    assert.equal(await page.locator('.message').count(), parentCount, 'Link child inherits parent history');
    await page.locator('#promptInput').fill('接着讨论这个实验室');
    await page.locator('#sendButton').click();
    await page.waitForFunction(() => !document.querySelector('#promptInput').disabled);
    assert.equal(requests.length, 5);
    assert.equal(requests[4].messages.length, parentCount + 2);
    await page.evaluate(() => {
      testTab = {id:1,active:true,url:'https://biology.example.edu/faculty',title:'生科院'};
      testEvents.activated.forEach(fn=>fn({tabId:1,windowId:1}));
    });
    await page.waitForFunction(count => document.querySelectorAll('.message').length === count, parentCount + 2);
    assert((await page.locator('#messages').textContent()).includes('接着讨论这个实验室'));
    // A grandchild continues the same chat; a manually opened unrelated tab does not.
    await page.evaluate(() => {
      testTab = {id:4,openerTabId:3,active:true,url:'https://external.example.org/paper',title:'论文链接'};
      testEvents.activated.forEach(fn=>fn({tabId:4,windowId:1}));
    });
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.includes('当前页面 ·'));
    assert.equal(await page.locator('.message').count(), parentCount + 2);
    await page.evaluate(() => {
      testTab = {id:5,active:true,url:'https://other.example.org/',title:'手动新标签页'};
      testEvents.activated.forEach(fn=>fn({tabId:5,windowId:1}));
    });
    await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === '新对话');
    assert.equal(await page.locator('.message').count(), 0);
    // Navigation ancestry covers target=_blank when openerTabId is omitted.
    await page.evaluate(async () => {
      const session = await chrome.storage.session.get(null);
      await chrome.storage.session.set({'deepseekTabParent:6':1,'deepseekTabInheritedChat:6':session['deepseekTabChat:1']});
      testTab = {id:6,active:true,url:'https://another.example.edu/',title:'无 opener 的链接'};
      testEvents.activated.forEach(fn=>fn({tabId:6,windowId:1}));
    });
    await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === 'SeqAcademy 作者与单位');
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.includes('当前页面 ·'));
    assert.equal(await page.locator('.message').count(), parentCount + 2);
    await page.locator('#newChatButton').click();
    await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === '新对话');
    await page.locator('#refreshPageButton').click();
    await page.waitForFunction(() => document.querySelector('#pageStatus').textContent.includes('当前页面 ·'));
    assert.equal(await page.locator('.message').count(), 0, 'Explicit new chat must not be re-inherited');
    if (longPaper) {
      await page.locator('#pdfFileInput').setInputFiles(longPaper);
      await page.waitForFunction(() => {
        const text = document.querySelector('#pageStatus').textContent;
        return text.startsWith('PDF ·') && text.includes('456 页');
      }, {timeout:120000});
      assert.equal(await page.evaluate(() => state.page.pages.length), 456);
      assert((await page.evaluate(() => state.page.pages.at(-1).text)).trim().length > 0);
      assert(!(await page.locator('#pageStatus').textContent()).includes('仅读取前'));
      readingTest = {mode:'tools',step:0};
      await page.locator('#promptInput').fill('请检查后面章节的申请条件');
      await page.locator('#sendButton').click();
      await page.waitForFunction(() => !document.querySelector('#promptInput').disabled, {timeout:60000});
      assert.equal(readingTest.step,3);
      assert((await page.locator('#messages').textContent()).includes('第 400 页已读取'));
      // Full mode must send EVERY batch, including the very last page, before final answer.
      readingTest = {mode:'full',batches:[]};
      await page.locator('#pdfReadMode').selectOption('full');
      await page.locator('#promptInput').fill('通读全部指南并整理申请条件');
      await page.locator('#sendButton').click();
      await page.locator('#readingDialog').waitFor({state:'visible'});
      await page.locator('#confirmReadingButton').click();
      await page.waitForFunction(() => !document.querySelector('#promptInput').disabled, {timeout:120000});
      const covered = readingTest.batches.join('\n');
      for (let n=1;n<=456;n++) assert(covered.includes(`[PDF 第 ${n} 页]`), `Full scan missed page ${n}`);
      const lastRequest = requests.at(-1);
      assert(lastRequest.messages.some(m=>m.content?.includes('全部 456 页已分批建立通用阅读笔记')));
      console.log(`PASS: real 456-page guide fully indexed; streamed tool arguments; full-document search; page 400 read on demand; full scan covers all 456 pages in ${readingTest.batches.length} batches.`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: link-opened child/grandchild inherit conversation; child follow-up reaches API and parent; manual tabs stay separate; navigation ancestry handles missing opener; explicit new chat stays independent; PDF/history/no-navigation regression checks.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
