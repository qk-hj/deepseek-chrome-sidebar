// Isolated real extension origin/storage/CSP. No personal profile or real API key.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const root=path.resolve(__dirname,'../DeepSeek-Chrome-Sidebar');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'deepseek-extension-test-'));
  const options=require('./browser-options.cjs')();
  const context=await chromium.launchPersistentContext(profile,{...options,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  try {
    let id=context.serviceWorkers()[0] ? new URL(context.serviceWorkers()[0].url()).host : null;
    if(!id) {
      const cdp=await context.browser().newBrowserCDPSession();
      id=(await cdp.send('Extensions.loadUnpacked',{path:root})).id;
    }
    const page=await context.newPage();
    await page.goto(`chrome-extension://${id}/sidepanel.html`);
    await page.waitForFunction(()=>!!state.store && !state.isStreaming);
    const confirmed=page.evaluate(()=>confirmReading('真实扩展中的读取费用确认',new AbortController().signal));
    await page.locator('#readingDialog').waitFor({state:'visible'});await page.locator('#confirmReadingButton').click();assert.equal(await confirmed,true);
    const cancelled=page.evaluate(()=>confirmReading('取消读取测试',new AbortController().signal));
    await page.locator('#readingDialog').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await cancelled,false);
    assert.equal(await page.evaluate(()=>chrome.runtime.getManifest().version),'0.8.3');
    await page.evaluate(()=>{const button=document.createElement('button');button.id='open-native-test';button.textContent='Open native panel';button.addEventListener('click',()=>chrome.sidePanel.open({windowId:state.windowId}));document.body.append(button);});
    await page.locator('#open-native-test').click();
    await page.waitForFunction(()=>chrome.extension.getViews().some(view=>view!==window && typeof view.confirmReading==='function'),{timeout:10000});
    const nativeAccepted=await page.evaluate(async()=>{
      const view=chrome.extension.getViews().find(view=>view!==window && view.document.querySelector('#readingDialog'));
      const pending=view.confirmReading('原生侧栏中的确认测试',new AbortController().signal);
      if(!view.document.querySelector('#readingDialog').open) throw new Error('Native panel dialog did not open');
      view.document.querySelector('#confirmReadingButton').click();return pending;
    });
    assert.equal(nativeAccepted,true);
    console.log('PASS: actual unpacked 0.8.3 Chrome APIs/storage/CSP; confirmation/Escape cancellation; confirmation in real native side-panel container. No live API call.');
  } finally {await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
