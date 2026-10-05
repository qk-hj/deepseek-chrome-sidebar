const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname,'..');
const extension = path.join(root,'DeepSeek-Chrome-Sidebar');
const manifest = JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')).version);
for (const name of ['docs/RELEASE_NOTES.md','docs/PUBLISH.md','CHANGELOG.md','DeepSeek-Chrome-Sidebar/README.md']) assert(fs.readFileSync(path.join(root,name),'utf8').includes(manifest.version),`Missing current version: ${name}`);
for(const icon of Object.values(manifest.icons)) assert(fs.existsSync(path.join(extension,icon)),icon);
for(const name of ['LICENSE','PRIVACY.md','THIRD_PARTY_NOTICES.md','README.md']) assert(fs.existsSync(path.join(root,name)),name);
for(const name of ['vendor/LICENSE','vendor/NOTICE.md','vendor/cmaps/LICENSE','vendor/standard_fonts/LICENSE_FOXIT','vendor/standard_fonts/LICENSE_LIBERATION']) assert(fs.existsSync(path.join(extension,name)),name);
let files = 0;
function walk(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if(['.git','node_modules','dist','test-results','playwright-report'].includes(entry.name)) continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) { walk(file); continue; }
    files++;
    const relative=path.relative(root,file);
    assert(!/\.(pdf|zip|pem|key)$/i.test(entry.name),`Private/release artifact must not be in source: ${relative}`);
    if(!/\.(js|cjs|mjs|md|html|css|json|svg|yml|ps1)$/i.test(entry.name) && !['.gitignore','.gitattributes'].includes(entry.name) && !entry.name.startsWith('LICENSE')) continue;
    const text=fs.readFileSync(file,'utf8');
    assert(!/sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),`Possible credential: ${relative}`);
    assert(!/[A-Z]:[\\/]Users[\\/]/i.test(text),`Personal absolute path: ${relative}`);
  }
}
walk(root);
console.log(`PASS: ${files} source files checked; manifest/assets/notices consistent, no common credential patterns, personal user paths or private PDF/release artifacts. Not a complete security audit.`);
