const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../DeepSeek-Chrome-Sidebar');
const server = http.createServer((req, res) => {
  const target = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(require('./browser-options.cjs')());
  try {
    const page = await browser.newPage({viewport:{width:420,height:850}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let modelResponse = {data:[{id:'auto-first',name:'Automatic model'},{id:'future-model'}]};
    let modelStatus = 200;
    let modelRequests = 0;
    await page.route('https://api.deepseek.com/models', async route => {
      modelRequests++;
      await route.fulfill({status:modelStatus,contentType:'application/json',body:JSON.stringify(modelResponse)});
    });
    await page.addInitScript(() => {
      const listeners = [];
      const values = {};
      const empty = {addListener(){}};
      const area = {
        get: async () => ({...values}),
        set: async data => Object.assign(values, data),
        remove: async keys => { for (const key of [].concat(keys)) delete values[key]; }
      };
      globalThis.testSelectedText = '';
      globalThis.testCapture = text => {
        testSelectedText = text;
        listeners.forEach(fn => fn({pendingSelection:{newValue:{id:crypto.randomUUID(),capturedAt:Date.now(),text,title:'课程简介',url:'https://example.org/course'}}},'session'));
      };
      globalThis.chrome = {
        windows:{getCurrent:async()=>({id:1})},
        storage:{local:{...area,get:async()=>({deepseekSettings:{apiKey:'test-placeholder'},...values})},session:area,onChanged:{addListener:fn=>listeners.push(fn)}},
        tabs:{query:async()=>[{id:1,windowId:1,active:true,title:'课程简介',url:'https://example.org/course'}],onActivated:empty,onUpdated:empty,onRemoved:empty},
        scripting:{executeScript:async()=>[{result:{title:'课程简介',url:'https://example.org/course',text:'这是一份课程页面。',selection:testSelectedText}}]}
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/sidepanel.html`);
    await page.waitForFunction(()=>document.querySelector('#pageStatus').textContent.startsWith('当前页面 ·'));
    assert.equal(await page.locator('#connectionStatus').isVisible(), false);
    await page.waitForFunction(()=>state.settings.model === 'auto-first');
    assert.equal(modelRequests, 1, 'Startup discovers models automatically');
    await page.evaluate(()=>refreshModels());
    assert.equal(modelRequests, 1, 'Fresh model cache avoids repeated requests');
    assert.equal(await page.locator('.brand h1').count(), 0);
    await page.screenshot({path:path.join(__dirname, 'ui-empty.png')});
    await page.locator('#promptInput').fill('保留我的草稿');
    await page.locator('#settingsButton').focus();
    await page.evaluate(()=>testCapture('第一段选文\n第二段选文'));
    await page.waitForFunction(()=>document.querySelector('#selectionText').textContent.includes('第一段'));
    assert.equal(await page.evaluate(()=>document.activeElement.id), 'settingsButton', 'Capture must not steal focus');
    assert.equal(await page.locator('#promptInput').inputValue(), '保留我的草稿');
    assert.equal(await page.locator('#toast').getAttribute('class'), 'toast');
    assert.equal(await page.locator('#promptInput').getAttribute('placeholder'), '询问选中内容…');
    await page.locator('#selectionToggle').hover();
    await page.waitForFunction(()=>!document.querySelector('#selectionPreview').classList.contains('hidden'));
    await page.locator('#selectionText').hover();
    assert(await page.locator('#selectionPreview').isVisible());
    await page.locator('#selectionToggle').click();
    await page.locator('.brand-mark').hover();
    assert(await page.locator('#selectionPreview').isVisible(), 'Pinned preview stays open');
    await page.screenshot({path:path.join(__dirname, 'ui-preview.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#selectionPreview').isVisible(), false);
    await page.locator('#settingsButton').focus();
    await page.locator('#selectionToggle').focus();
    assert(await page.locator('#selectionPreview').isVisible(), 'Keyboard focus opens preview');
    await page.keyboard.press('Enter');
    await page.locator('#promptInput').click();
    assert.equal(await page.locator('#selectionPreview').isVisible(), false);
    await page.evaluate(()=>testCapture('新的选文'.repeat(3000)));
    await page.waitForFunction(()=>document.querySelector('#selectionText').textContent.startsWith('新的'));
    assert.equal(await page.locator('#selectionToggle').textContent(), '1 个选中内容');
    for (const colorScheme of ['light','dark']) for (const width of [320,420,560]) {
      await page.emulateMedia({colorScheme});
      await page.setViewportSize({width,height:850});
      await page.locator('#selectionToggle').hover();
      const rect = await page.locator('#selectionPreview').boundingBox();
      assert(rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0);
      assert(await page.locator('#selectionText').evaluate(e=>e.scrollHeight>e.clientHeight));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth), width);
      await page.screenshot({path:path.join(__dirname, `ui-${colorScheme}-${width}.png`)});
    }
    await page.locator('#clearSelectionButton').click();
    assert.equal(await page.locator('#selectionCard').isVisible(), false);
    await page.locator('#refreshPageButton').click();
    await page.waitForFunction(()=>document.querySelector('#pageStatus').textContent.startsWith('当前页面 ·'));
    assert.equal(await page.locator('#selectionCard').isVisible(), false, 'Refresh must not reattach dismissed selection');
    assert.equal(await page.locator('#promptInput').getAttribute('placeholder'), '询问当前页面…');
    await page.evaluate(()=>{ state.settings.apiKey=''; renderConnectionStatus(); setPageError(new Error('当前页面未返回 PDF 正文，可能需要登录或下载文件；请点击选择 PDF。')); });
    assert(await page.locator('#connectionStatus').isVisible());
    await page.locator('#pageError summary').click();
    assert((await page.locator('#pageErrorText').textContent()).includes('登录'));
    await page.evaluate(()=>setPageStatus('当前页面 · 测试'));
    assert.equal(await page.locator('#pageError').isVisible(), false);
    assert(await page.evaluate(() => {
      state.messages = [{role:'user',content:'问题'}, {role:'assistant',content:'第一段',streaming:true}];
      renderMessages();
      const original = el.messages.firstChild;
      const answer = el.messages.lastChild;
      const body = answer.querySelector('.message-body');
      state.messages[1].content += '，第二段';
      updateStreamingMessage(1);
      return original === el.messages.firstChild && answer === el.messages.lastChild && body === answer.querySelector('.message-body') && body.textContent.includes('第二段');
    }), 'Streaming must preserve message containers');
    await page.evaluate(()=>{state.settings.apiKey='test-placeholder';});
    await page.locator('#settingsButton').click();
    await page.waitForFunction(()=>!document.querySelector('#refreshModelsButton').disabled);
    assert.equal(await page.locator('#modelSelect option').count(), 2);
    assert((await page.locator('#modelSelect option').first().textContent()).includes('Automatic model'));
    modelResponse = {data:[{id:'new-model'},{id:'new-model'},{id:null}]};
    await page.locator('#refreshModelsButton').click();
    await page.waitForFunction(()=>document.querySelector('#modelStatus').textContent === '已获取 1 个模型');
    assert.equal(await page.locator('#modelSelect').inputValue(), 'auto-first', 'Never silently change saved selection');
    assert.equal(await page.locator('#modelSelect option').count(), 2, 'Remove old choices; retain selected unavailable model');
    modelStatus = 401;
    modelResponse = {error:{message:'Invalid test key'}};
    await page.locator('#refreshModelsButton').click();
    await page.waitForFunction(()=>!document.querySelector('#refreshModelsButton').disabled);
    assert.equal(await page.locator('#modelSelect').inputValue(), 'auto-first');
    assert((await page.locator('#modelStatus').textContent()).includes('原选择已保留'));
    modelStatus = 200;
    modelResponse = {data:[]};
    await page.locator('#refreshModelsButton').click();
    await page.waitForFunction(()=>document.querySelector('#modelStatus').textContent.includes('未返回可用模型'));
    modelResponse = {data:[{id:'brand-new-model',name:'New name'}]};
    await page.locator('#apiKeyInput').fill('different-test-key');
    await page.waitForFunction(()=>document.querySelector('#modelStatus').textContent === '已获取 1 个模型');
    assert((await page.locator('#modelSelect option').allTextContents()).some(x=>x.includes('brand-new-model')));
    await page.locator('#modelSelect').selectOption('brand-new-model');
    await page.locator('#saveSettingsButton').click();
    assert.equal(await page.evaluate(()=>state.settings.model), 'brand-new-model');
    assert.equal(await page.evaluate(()=>state.settings.apiKey), 'different-test-key');
    let nativeSearches = 0;
    let searchStatus = 200;
    await page.route('https://api.deepseek.com/anthropic/v1/messages', async route => {
      nativeSearches++;
      assert.equal(route.request().postDataJSON().model,'brand-new-model');
      await route.fulfill({status:searchStatus,contentType:'application/json',body:JSON.stringify({content:[
        {type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://example.org/source',title:'Verified test source'}]},
        {type:'text',text:'Search summary'}]})});
    });
    let refuseSearch = false;
    await page.route('https://api.deepseek.com/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (body.thinking?.type === 'enabled' && typeof body.tool_choice === 'object') {
        return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'Thinking mode does not support this tool_choice'}})});
      }
      if (body.thinking?.type === 'enabled' && body.messages.some(m=>m.role==='tool')) {
        assert(body.messages.some(m=>m.role==='assistant' && m.tool_calls?.length && m.reasoning_content === 'test reasoning'));
      }
      const currentTurn = body.messages.slice(body.messages.findLastIndex(m => m.role === 'user'));
      const wantsSearch = !refuseSearch && (body.tool_choice?.function?.name === 'search_web' ||
        (body.tool_choice === 'auto' && body.tools?.some(t=>t.function.name==='search_web') && !currentTurn.some(m=>m.role==='tool')));
      const delta = wantsSearch
        ? {reasoning_content:'test reasoning',tool_calls:[{index:0,id:'web-test',type:'function',function:{name:'search_web',arguments:'{"query":"specific test question"}'}}]}
        : {content:'Test answer'};
      await route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({choices:[{delta}]})}\n\ndata: ${JSON.stringify({choices:[{delta:{},finish_reason:wantsSearch?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`});
    });
    await page.locator('#webSearchToggle').click();
    await page.locator('#promptInput').fill('查一下最新信息');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>!state.isStreaming);
    assert.equal(nativeSearches,1);
    assert.equal(await page.locator('.search-sources').count(),1);
    await page.locator('.search-sources summary').click();
    assert.equal(await page.locator('.search-sources a').getAttribute('href'),'https://example.org/source');
    assert(await page.evaluate(async()=>Object.values(await chrome.storage.local.get(null)).some(chat=>chat?.messages?.some(m=>m.searchSources?.length))), 'Search sources persist with chat');
    searchStatus=400;
    await page.locator('#promptInput').fill('再次联网');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>!state.isStreaming);
    assert((await page.locator('.message.assistant').last().textContent()).includes('联网搜索未完成'));
    await page.locator('#webSearchToggle').click();
    await page.locator('#promptInput').fill('不联网');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>!state.isStreaming);
    assert.equal(nativeSearches,2,'Search off makes no native search calls');
    searchStatus=200;
    await page.evaluate(()=>{state.settings.thinkingEnabled=true;});
    await page.locator('#webSearchToggle').click();
    await page.locator('#promptInput').fill('深度思考并联网搜索');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>!state.isStreaming);
    assert.equal(nativeSearches,3,'Thinking mode auto-selects search without forced tool_choice');
    assert(!(await page.locator('.message.assistant').last().textContent()).includes('Thinking mode does not support'));
    assert.equal(await page.evaluate(()=>state.settings.thinkingEnabled),true,'Do not turn off thinking behind the user');
    refuseSearch=true;
    await page.locator('#promptInput').fill('未调用搜索的测试');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>!state.isStreaming);
    assert.equal(nativeSearches,3);
    assert((await page.locator('.message.assistant').last().textContent()).includes('模型没有调用搜索工具'));
    assert.deepEqual(errors, []);
    console.log('PASS: UI/model/search tests; thinking + search uses auto tool_choice and retains thinking/reasoning; missing search calls cannot claim verification.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
