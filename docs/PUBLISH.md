# 发布到 GitHub

这是整理好的独立仓库目录，不是整个“软件”目录。没有替你创建线上仓库或推送代码。

建议仓库名：`deepseek-chrome-sidebar`。

Description 可粘贴：`Unofficial Chrome sidebar for DeepSeek: selected-text chat, webpage context, long-PDF reading and experimental web search.`

## Recommended: GitHub Desktop

此目录尚未初始化 Git，也没有替你创建提交或绑定线上仓库；不包含其他软件项目的历史。

1. Open **GitHub Desktop** and sign in.
2. Choose **File → Add local repository… → Choose…** and select this folder. If Desktop says this is not a Git repository, click **create a repository here instead**, keep the existing folder location, and click **Create repository**. Keep **Git ignore** and **License** as **None** so the prepared files are not replaced.
3. Review **Changes**. Check that no keys, private documents, browser data or `node_modules` are included.
4. If there are uncommitted changes, enter **Summary**: `Public preview v0.8.3`, then click **Commit to main** (or the actual default branch shown). Desktop may already create the initial commit during repository creation.
5. Click **Publish repository**. Set **Name** to `deepseek-chrome-sidebar`.
6. For a public project, uncheck **Keep this code private**, then click **Publish repository**.

建议 Desktop 或 Git 推送：PDF.js 资源文件较多，GitHub 网页单次上传最多 100 个文件，不宜把整个目录一次拖进去。

## Release

以后重新打包可在仓库根目录运行 `powershell -NoProfile -File scripts/package.ps1`。默认输出到同级 `DeepSeek-Sidebar-Release` 文件夹；不会覆盖已有包，需要另选输出目录或先自行保留旧包。生成源码包和只含扩展/说明的安装包，不把依赖、测试截图或 Git 历史打进去。

1. Open the repository on GitHub → **Releases → Draft a new release**.
2. Choose **Choose a tag → Create new tag**: `v0.8.3`. Target the default branch you just published (normally `main`).
3. Set **Release title**: `v0.8.3 — Reading and reliability fixes`.
4. Paste the text from `docs/RELEASE_NOTES.md` into the description.
5. Attach `DeepSeek-Chrome-Sidebar-v0.8.3.zip` and `SHA256SUMS-v0.8.3.txt` from the sibling **DeepSeek-Sidebar-Release** folder — not the source archive. The 0.8.2 ZIP files are old snapshots; do not attach them to this release.
6. Check **This is a pre-release**, review, then click **Publish release**.

源码应作为仓库文件发布，不要只把源码 ZIP 提交进仓库。测试 PDF、真实聊天截图、Key、npm 缓存和浏览器配置不上传。

发布前确认你愿意以根目录 MIT 许可公开自有代码；第三方文件继续适用各自许可。建议在 **Settings → Code security** 中启用可用的秘密扫描、推送保护及私密漏洞报告功能。

参考：[GitHub 文件上传](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)、[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。
