const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const callbacks = {};
const event = name => ({addListener(fn) { callbacks[name] = fn; }});
const session = { 'deepseekTabChat:1': 'original-chat' };
const context = {
  console, crypto: require('crypto').webcrypto,
  chrome: {
    tabs: { query:async()=>[], onCreated: event('created'), onActivated:event('activated'),onUpdated:event('updated'),onRemoved:event('removed') },
    windows: {onFocusChanged:event('focus'),getLastFocused:async()=>({id:1})},
    webNavigation: { onCreatedNavigationTarget: event('navigation') },
    runtime: { onMessage: event('message'), onInstalled: event('installed') },
    contextMenus: { onClicked: event('menu') },
    commands: { onCommand: event('command') },
    storage: { session: {
      get: async keys => Object.fromEntries(keys.map(key => [key, session[key]])),
      set: async values => Object.assign(session, values),
      remove: async keys => { for (const key of keys) delete session[key]; }
    } }
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../DeepSeek-Chrome-Sidebar/background.js'), 'utf8'), context);
(async () => {
  callbacks.created({id:2,openerTabId:1});
  await new Promise(setImmediate);
  assert.equal(session['deepseekTabParent:2'], 1);
  assert.equal(session['deepseekTabInheritedChat:2'], 'original-chat');
  // Navigation-target event is the fallback when noopener hides the opener property.
  callbacks.navigation({tabId:3,sourceTabId:1});
  await new Promise(setImmediate);
  assert.equal(session['deepseekTabParent:3'], 1);
  assert.equal(session['deepseekTabInheritedChat:3'], 'original-chat');
  callbacks.created({id:4});
  await new Promise(setImmediate);
  assert.equal(session['deepseekTabParent:4'], undefined);
  session['deepseekTabChat:1'] = 'later-parent-chat';
  callbacks.navigation({tabId:2,sourceTabId:1});
  await new Promise(setImmediate);
  assert.equal(session['deepseekTabInheritedChat:2'], 'original-chat', 'Keep the conversation from link-open time');
  console.log('PASS: service-worker tab creation, navigation-target fallback, manual-tab separation, original-chat snapshot retained.');
})().catch(error => { console.error(error); process.exitCode = 1; });
