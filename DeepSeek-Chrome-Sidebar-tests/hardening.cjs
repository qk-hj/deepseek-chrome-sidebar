const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../DeepSeek-Chrome-Sidebar');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Content-Security-Policy', "script-src 'self'; object-src 'self'");
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch(require('./browser-options.cjs')());
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.addInitScript(() => {
      const area = name => ({
        async get(key) { const all=JSON.parse(localStorage.getItem(name)||'{}'); return key===null ? all : Object.fromEntries([].concat(key).map(k=>[k,all[k]])); },
        async set(data) { if (name==='local' && globalThis.failSave) throw new Error('mock storage full'); localStorage.setItem(name,JSON.stringify({...await this.get(null),...data})); },
        async remove(keys) { const all=await this.get(null); for(const key of [].concat(keys)) delete all[key]; localStorage.setItem(name,JSON.stringify(all)); }
      });
      const local=area('local'), session=area('session'), empty={addListener(){}};
      if(!localStorage.getItem('local')) localStorage.setItem('local',JSON.stringify({deepseekSettings:{apiKey:'test-only-placeholder',model:'mock-model',thinkingEnabled:true}}));
      globalThis.testDocument={title:'测试页面',url:'https://example.org/test',text:'测试正文。',selection:''};
      globalThis.readDelay=0;
      globalThis.chrome={
        windows:{getCurrent:async()=>({id:1})},storage:{local,session,onChanged:empty},
        tabs:{query:async()=>[{id:1,windowId:1,active:true,url:testDocument.url,title:testDocument.title}],onActivated:empty,onUpdated:empty,onRemoved:empty},
        scripting:{executeScript:async()=>{if(readDelay) await new Promise(r=>setTimeout(r,readDelay)); return [{result:testDocument}];}}
      };
    });
    await page.route('https://api.deepseek.com/models', route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:[{id:'mock-model'}]})}));
    await page.route('https://api.deepseek.com/anthropic/v1/messages', route=>{
      assert.equal(route.request().postDataJSON().reasoning.effort,'none');
      return route.fulfill({contentType:'application/json',body:JSON.stringify({content:[{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://example.org/source',title:'Source'}]},{type:'text',text:'搜索摘要'}]})});
    });
    const requests=[];
    let finish='stop', serial=0, scanned=0;
    await page.route('https://api.deepseek.com/chat/completions', async route=>{
      const body=route.request().postDataJSON(); requests.push(body);
      if(!body.stream) { scanned++; return route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'完整测试笔记'}}]})}); }
      if(body.tools && body.thinking.type==='enabled') for(const m of body.messages.filter(m=>m.role==='assistant')) assert.equal(typeof m.reasoning_content,'string','Every assistant subturn must carry reasoning');
      const turn=body.messages.slice(body.messages.findLastIndex(m=>m.role==='user'));
      const tool=body.tools?.[0]?.function.name;
      const wantsTool=tool && !turn.some(m=>m.role==='tool');
      const id=`call-${++serial}`;
      const delta=wantsTool ? {reasoning_content:`reasoning-${id}`,tool_calls:[{index:0,id,type:'function',function:{name:tool,arguments:JSON.stringify(tool==='search_web'?{query:'test'}:{query:'测试'})}}]} : {reasoning_content:`final-${id}`,content:'完整测试回答'};
      await route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({choices:[{delta}]})}\n\ndata: ${JSON.stringify({choices:[{delta:{},finish_reason:wantsTool?'tool_calls':finish}]})}\n\ndata: [DONE]\n\n`});
    });
    const ready=()=>page.waitForFunction(()=>!state.isStreaming && state.page);
    const send=async text=>{await page.locator('#promptInput').fill(text);await page.locator('#sendButton').click();await page.waitForFunction(()=>!state.isStreaming);};
    await page.goto(base+'/sidepanel.html'); await ready();
    // A page-controlled foreign PDF cannot be fetched before approval.
    await page.evaluate(()=>{testDocument.pdfUrl='https://foreign.invalid/private.pdf';});
    await page.locator('#refreshPageButton').click();await page.locator('#readingDialog').waitFor({state:'visible'});
    await page.locator('#cancelReadingButton').click();await page.waitForFunction(()=>!state.isStreaming);
    assert((await page.locator('#pageErrorText').textContent()).includes('已取消'));
    await page.evaluate(()=>{delete testDocument.pdfUrl;});await page.locator('#refreshPageButton').click();await ready();
    await page.locator('#webSearchToggle').click();
    await send('第一次联网'); await send('第二次联网');
    assert(requests.at(-1).messages.filter(m=>m.role==='assistant').length>=3);
    const saved=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('local'))).find(v=>v?.messages?.some(m=>m.apiTurns)));
    assert(saved.messages.filter(m=>m.role==='assistant').every(m=>m.apiTurns.some(t=>t.reasoning_content?.startsWith('final-'))));
    await page.reload(); await ready(); await page.locator('#webSearchToggle').click(); await send('恢复历史后继续联网');
    assert(requests.at(-1).messages.some(m=>m.reasoning_content?.startsWith('reasoning-')));
    await page.locator('#webSearchToggle').click();
    await page.evaluate(()=>{testDocument={...testDocument,kind:'pdf',totalPages:10,large:true,text:'入口页',pages:Array.from({length:10},(_,i)=>({number:i+1,text:'测试'.repeat(18000)}))};});
    await page.locator('#refreshPageButton').click(); await ready();
    await send('第一次 PDF 思考'); await send('第二次 PDF 思考');
    await page.reload(); await ready();
    // Restore the same synthetic PDF as a reopened document.
    await page.evaluate(()=>{testDocument={...testDocument,kind:'pdf',totalPages:10,large:true,text:'入口页',pages:Array.from({length:10},(_,i)=>({number:i+1,text:'测试'.repeat(18000)}))};});
    await page.locator('#refreshPageButton').click(); await ready(); await send('恢复历史后 PDF 思考');
    await page.locator('#pdfReadMode').selectOption('full');
    await page.locator('#promptInput').fill('全文分析');await page.locator('#sendButton').click();
    await page.locator('#readingDialog').waitFor({state:'visible'}); await page.locator('#cancelReadingButton').click(); await page.waitForFunction(()=>!state.isStreaming);
    assert.equal(scanned,0); assert.equal(await page.locator('#pdfReadMode').inputValue(),'auto');
    assert(!(await page.locator('.message.assistant').last().textContent()).includes('已取消全文扫描'));
    finish='length'; await send('模拟输出截断'); assert((await page.locator('.message.assistant').last().textContent()).includes('输出上限')); finish='stop';
    await page.evaluate(()=>{readDelay=1000;});
    const before=requests.length;
    await page.locator('#promptInput').fill('停止读取仍保留草稿');await page.locator('#sendButton').click();
    await page.waitForFunction(()=>!!state.abortController);await page.locator('#sendButton').click();await page.waitForFunction(()=>!state.isStreaming);
    assert.equal(requests.length,before);assert.equal(await page.locator('#promptInput').inputValue(),'停止读取仍保留草稿');
    await page.evaluate(()=>{readDelay=0;failSave=true;});await send('保存失败测试');
    assert(await page.locator('#saveWarning').isVisible());await page.locator('#manageStorageButton').click();assert(await page.locator('#historyDialog').isVisible());await page.locator('#closeHistoryButton').click();
    await page.evaluate(()=>{failSave=false;});await send('保存恢复');assert(!(await page.locator('#saveWarning').isVisible()));
    const budgetCheck=await page.evaluate(()=>{
      const wire=requestHistory([{role:'user',content:'older'},{role:'assistant',content:'older reply',apiTurns:[{role:'assistant',content:'x'.repeat(120000),reasoning_content:'retained verbatim'}]},{role:'user',content:'latest'}],true);
      return wire.length===1 && wire[0].content==='latest' && limitedMaterial('x'.repeat(20000),12000).includes('后续已省略');
    });assert(budgetCheck,'budget must drop whole old turns and mark truncated material');
    assert.equal(await page.evaluate(()=>renderMarkdown('@@CODE_BLOCK_0@@\n\n```js\nhello\n```').includes('undefined')),false);
    // Exercise the real selection guard in DOM, rather than the extension API mock.
    const selectionPage=await browser.newPage();await selectionPage.goto(base+'/sidepanel.html');
    await selectionPage.addScriptTag({url:base+'/selection-guard.js'});
    for(const attribute of ['','plaintext-only','true']) {
      await selectionPage.evaluate(attribute=>{document.body.replaceChildren();const editor=document.createElement('div');editor.setAttribute('contenteditable',attribute);editor.textContent='未发送的私密内容';document.body.append(editor);editor.focus();const r=document.createRange();r.selectNodeContents(editor);window.getSelection().removeAllRanges();window.getSelection().addRange(r);},attribute);
      assert.equal(await selectionPage.evaluate(()=>readSafeSelection()),'');
    }
    await selectionPage.evaluate(()=>{document.body.replaceChildren();const p=document.createElement('p');p.textContent='普通网页选文';document.body.append(p);const r=document.createRange();r.selectNodeContents(p);window.getSelection().removeAllRanges();window.getSelection().addRange(r);});
    assert.equal(await selectionPage.evaluate(()=>readSafeSelection()),'普通网页选文');
    assert.deepEqual(errors,[]);
    console.log('PASS: thinking + search/PDF follow-up and history reload; in-panel cancellation; stopped read retains draft; output truncation; persistent save warning; editor privacy; placeholder safety. API mocked.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
