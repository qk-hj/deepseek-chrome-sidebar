const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let request;
let status = 200;
let data;
const context = { URL, AbortSignal, Map, fetch: async (url, options) => {
  request = {url, ...options};
  return {ok:status===200,status,json:async()=>data};
} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../DeepSeek-Chrome-Sidebar/web-search.js'),'utf8'),context);
(async()=>{
  const options = {apiKey:'fake-test-key',model:'new-model',signal:new AbortController().signal};
  data = {content:[{type:'web_search_tool_result',content:[
    {type:'web_search_result',url:'https://example.org/paper',title:'Paper'},
    {type:'web_search_result',url:'javascript:alert(1)',title:'Unsafe'}]},
    {type:'text',text:'Summary',citations:[{url:'https://example.org/paper',title:'Paper'}]}]};
  const result = await context.searchWeb('test question',options);
  assert.equal(result.sources.length,1);
  assert.equal(result.summary,'Summary');
  assert.equal(JSON.parse(request.body).model,'new-model');
  assert.equal(request.headers['x-api-key'],'fake-test-key');
  assert.equal(JSON.parse(request.body).tools[0].max_uses,3);
  const references = Array.from({length:30},(_,i)=>({title:`Source ${i}`,url:`https://example.org/page/${i}`}));
  references.push({title:'Tracked duplicate',url:'https://example.org/page/0?utm_source=test#1'});
  references.push({title:'Fragment duplicate',url:'https://example.org/page/0#two'});
  references.push({title:'Unsafe',url:'javascript:alert(1)'});
  const picked = context.selectSearchSources(references,'Use [Source 29](https://example.org/page/29).');
  assert.equal(picked.length,5);
  assert.equal(picked[0].url,'https://example.org/page/29');
  assert.equal(context.selectSearchSources(references.slice(0,2)).length,2,'Do not pad sparse sources');
  assert.equal(context.selectSearchSources(references.filter(x=>x.url.includes('/0'))).length,1,'Tracking and fragments deduplicate');
  assert.equal(context.selectSearchSources(null).length,0);
  status=400;
  await assert.rejects(context.searchWeb('test',options),/HTTP 400/);
  status=200;data={content:[{type:'text',text:'Unverified answer'}]};
  await assert.rejects(context.searchWeb('test',options),/未取得可核查/);
  data={content:[{type:'web_search_tool_result',content:{type:'web_search_tool_result_error'}}]};
  await assert.rejects(context.searchWeb('test',options),/未取得可核查/);
  await assert.rejects(context.searchWeb('',options),/不能为空/);
  console.log('PASS: native search adapter request, verified results only, safe links, deduplication, unsupported HTTP and no-results failures. API mocked, not a live capability verification.');
})().catch(e=>{console.error(e);process.exitCode=1;});
