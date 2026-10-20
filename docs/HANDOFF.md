# dsh-iconic-launcher 交接说明（HANDOFF）

> 写给接手本项目的 AI/开发者。读完这篇就能了解架构、当前状态、踩过的坑和遗留任务。

**文档分工**：`README.md` = 对外说明（用户 / 收录页）；`docs/plugin.md` = 技术细节（路由 / 配置 / 状态）；`docs/HANDOFF.md` = 交接（状态 / 踩坑 / 遗留，即本篇）。

## 项目是什么

DeepSeek Harness（DSH）的**桌面快捷方式图标插件**：在 DSH 设置页里选预设图标或上传
PNG，插件自动**去白底、切多尺寸 ICO**，然后**一键写入桌面快捷方式**。

- 插件 id / npm name：`dsh-iconic-launcher`（仓库根就是包根，**可以** `dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-iconic-launcher`，注意 `--profile` 在 `plugin` 之后）
- 概念 / 口号：**「万图皆 iConic」**（呼应 DSH 的「万物皆插件」：任何图片都能变成图标）；卡片内显示名 **「万图皆 icon」**
- 界面显示名（设置导航）：**`桌面图标`**（client.js 的 `settings.section` label，id `iconic`，order 50）
- 卡片同时挂在两个槽位：`settings.section`（完整展开）与 `settings.plugin.item`（key = `dsh-launcher-icon`，默认折叠、首次展开才挂载）

素材源：`data/1`（浅蓝 16 张）、`data/2`（深紫 15 张）、`data/3`（混搭 12 张）——约 300×300 PNG，
与 `presets/assets/{lightblue,deepblue,mixed}` 三个目录一一对应，另加 `presets/assets/dsh-brand.ico`
（默认组 1 张）。**出厂共 44 个图标，四个组：默认(1) / 浅蓝(16) / 深紫(15) / 混搭(12)**；
第五组「自定义」由 `listCustomPresets()` 在请求时扫描 `customDir` 生成，可能为空。每个 `.ico`
都是 7 个尺寸（256/128/64/48/32/24/16）的成品，host 只负责发字节，不需要运行时栅格化。
（历史坑：拆 tab 后 `mixed/` 目录和 `data/3` 一度没建，混搭图标全留在 `deepblue/` 里 →
混搭 tab 404 裂图；已分离修复。）

## 目标形态：只服务桌面版（2026-10 共识）

**插件只面向 deepseek-harness 官方桌面版（Electron 应用），不再为 `dsh web` 场景保留兼容。**

- 快捷方式的**目标就是桌面应用本身**，不再是 `powershell -Command "dsh web"`。
- 目标路径**运行期解析**，不写死在 `cordis.patch.yml`：桌面外壳以 `ELECTRON_RUN_AS_NODE=1`
  和**应用自身的 exe**（`process.execPath`）spawn 这个 host 进程，所以 host 里的
  `process.execPath` 就是启动器；外壳在另外一些启动路径上还会用
  `DSH_DESKTOP_NODE_EXECUTABLE` 显式点名。解析逻辑在 `launcher.js`，有单测。
  优先级：`DSH_DESKTOP_NODE_EXECUTABLE` > `process.execPath`（仅当 Electron Node 模式且以
  `.exe` 结尾）> `''`。
- 不在桌面应用里运行时解析结果是 `''`，安装路由返回 HTTP 500 `{code:'no-target'}`，
  **宁可失败也不写死链接**，且一个字节都不落盘。
- `shortcutName` 故意等于应用自带的桌面快捷方式名（shipped `cordis.patch.yml` 里是
  `DeepSeek Harness`；schema 默认值是 `DeepSeek Launcher`）：安装图标 = **替换那个快捷方式的外观**，
  而不是并排多出一个同名项。应用更新后安装器会重建自己的快捷方式，图标会丢，重装一次即可。
  （桌面应用自身的 `app.asar` 里**没有任何** `CreateShortcut`/`IShellLink`/`.lnk` 字样，
  所以只有安装器会在更新时碰快捷方式。）

### 本形态真踩过的坑

1. **`shortcut.ps1` 的实参必须具名传，不能位置传。** PowerShell 5.1 的 `-File` 绑定器把
   **以 `-` 开头的裸参数当参数名**，于是 `targetArguments` 的 `-NoProfile …` 直接
   `A parameter cannot be found that matches parameter name …` + exit 1 —— 脚本在任何路径被碰之前
   就挂了，而图标文件已经写好，现场看起来很像"路径问题"。见 `desktop.js` 与
   `test/desktop-argv.test.mjs`。
2. **`dsh plugin --profile desktop …` 会被 CLI 拒绝**：报
   `profile "desktop" is managed exclusively by the Electron application`。
   desktop profile 只能走桌面应用自己的插件管理界面，或直接改
   `~/.dsh/profiles/desktop/node_modules/<pkg>/` 下的文件。
3. 桌面 host 的 `process.execPath` 是**应用 exe**（`ELECTRON_RUN_AS_NODE=1`），
   `process.versions.electron` 也存在——这两点是在 host 内识别"我在桌面版里"的依据。

## 架构（仓库根 = 包根）

| 文件 | 角色 |
|---|---|
| `index.js` | host 半：cordis function-plugin，**四个** webServer 路由 + settings 命名空间注册；presets 接口附带读自自身 package.json 的 `{name,version,homepage}` meta。`Config` 默认：`shortcutName 'DeepSeek Launcher'`、`targetExecutable ''`、`iconDir ~/.dsh-launcher/icons`、`customDir ''`（生效默认 = `iconDir/custom`）、`desktopDir ~/Desktop`、`allowUpload true` |
| `client.js` | 浏览器半：**no-build**（`window.__ModuleLoader__.load({id, factory})` 形式，不能有顶层 import/export）；卡片**顶部 header**（`.ic-head`）显示名称「万图皆 icon」+ 包名 + `v版本` + 项目主页链接（取自 host meta，缺省回退内联常量 `PLUGIN_REPO_FALLBACK`/`PLUGIN_VERSION_FALLBACK`）|
| `shared.js` | 前后端共享常量（路由前缀、`ICON_SIZES` 白名单、`slugify`、上传上限）|
| `presets.js` | 分组预设目录：`PRESET_GROUPS`（默认/浅蓝/深紫/混搭）+ `listCustomPresets()` 自定义目录扫描 |
| `ico.js` | PNG → ICO 打包（ICONDIR + ICONDIRENTRY，payload 长度**必须 32 位写**）|
| `desktop.js` | 经 `ctx.subprocess` 调 PowerShell 写 .lnk（`-File` + **具名实参**，绝不用 `-Command`）|
| `launcher.js` | 决定快捷方式启动谁：桌面 host 内解析出应用自身 exe，否则 `''`（纯函数，可单测）|
| `shortcut.ps1` | 实际写 .lnk 的脚本（`SHChangeNotify` 通知 Explorer 刷新图标）|
| `cordis.patch.yml` | bundle patch：insert 插件行（id/name/config），只带 `shortcutName: DeepSeek Harness` + `allowUpload: true`，无机器相关路径 |
| `scripts/` | 历史工具链（启动 bat、图标生成、PNG→ICO 批量转换、`SETUP-SHORTCUT.md`），**不进 npm 包**，新装不再需要 |
| `data/` | 素材源（PNG 原始批次 1/2/3，`_removed-presets` 被 git 忽略），**不进 npm 包** |
| `deploy.ps1` / `install.ps1` | 旧 `dsh web` 工作流的部署/安装脚本，**不进 npm 包**，仅存档 |

### 路由（全部先过 `connection.requestRejection`）

| 方法 | kind | 路径 | 作用 |
|---|---|---|---|
| `GET` | exact | `/dsh-launcher-ic/presets` | 预设目录（含运行时扫描的 `自定义` 组）+ target / shortcutName / desktopDir / iconDir / meta |
| `GET` | prefix | `/dsh-launcher-ic/icon` | 预览单个图标 `.ico` 字节，`<group>/<preset>`；前缀路由、**无尾斜杠** |
| `POST` | exact | `/dsh-launcher-ic/install` | 写入/刷新桌面快捷方式 |
| `POST` | exact | `/dsh-launcher-ic/custom-delete` | 删除一个用户上传的自定义图标 |

### 安装写入什么

- 图标落 `%USERPROFILE%\.dsh-launcher\icons\<shortcutBase>.<sha256(bytes)[:10]>.ico`
  （**内容寻址是刻意的**：Explorer 图标缓存按路径命中，换内容就换文件名才会重绘；同 base 的旧文件随后清理）
- 上传先持久化为自定义图标 `…\icons\custom\custom-<slug>-<epoch-ms>.ico`，再打包
- 快捷方式落 `%USERPROFILE%\Desktop\<shortcutBase>.lnk`，`shortcut.ps1` 末尾
  `SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, lnk)`

## Tab 分组结构（代码已实现，GitHub 已推送）

```
默认(1) / 浅蓝(16) / 深紫(15) / 混搭(12) / 自定义(用户上传，目录扫描)
```

## 当前状态（⚠️ 接手者必读）

**代码与安装形态都已是最新，桌面 profile 跑的就是 HEAD 的代码。**

- 本机 `~/.dsh/profiles/desktop` 的依赖是
  `"dsh-iconic-launcher": "github:SkyblueeeLabs/dsh-iconic-launcher"`（GitHub 直装，非 tarball），
  `dsh.profile.bundles` 已注册该包。
- `node_modules/dsh-iconic-launcher/` 下的文件与仓库 HEAD（`ed70407`）**逐字节一致**
  （index.js / client.js / launcher.js / presets.js / desktop.js / ico.js / shared.js /
  shortcut.ps1 / cordis.patch.yml / package.json 全部 hash 相同）。
- 所以 **5 个 tab、自定义删除、设置导航里的「桌面图标」、卡片顶部「万图皆 icon」标题都是活的**，
  不是"已实现但没装到本机"。
- ⚠️ **唯一的不一致在发布物**：tag `v0.1.1` 指向 `55a5694`（2026-09-18），比 `main`/HEAD `ed70407`
  落后 **4 个提交**。GitHub Release v0.1.1 挂的 `dsh-iconic-launcher-0.1.1.tgz` 因此仍是**旧形态**
  （其 `cordis.patch.yml` 目标是 `powershell.exe` + `-NoProfile -NonInteractive -Command "dsh web"`，
  且**没有 `launcher.js`**）。下载那个 tarball 装上会得到老的 `dsh web` 行为。
  从 GitHub 源装（`github:SkyblueeeLabs/...`）会解析 `main`，是新的。

### 历史（已被取代，留作参考）

桌面版共识之前，插件跑在 `~/.dsh/profiles/web`，快捷方式目标写死为
`powershell -Command "dsh web"`；本机 web profile 一度装的是旧包名
`@dsh-launcher/iconic` 的 `file:` tarball（旧 4-tab 代码 + 旧显示名），node_modules 被手工同步过。
那段历史里的两条经验仍然成立：**跨盘 `link:` 依赖不可靠，用 `file:` tarball**；
**改 `@` 开头目录必须用 `-LiteralPath`**。

## 切换 profile 到新版的正确方式（踩坑后得出的可靠路径）

> 以下是 server profile（`dsh web`）时代的流程，桌面 profile 不适用——CLI 会直接拒绝，
> 必须走客户端插件管理界面（见上文《本形态真踩过的坑》第 2 条）。
> 除"桌面 profile 请走客户端插件管理"外，其余坑对任何 profile 的包替换依旧成立。

### ⚠️ 三大坑（都真踩过）

1. **`link:` 目录依赖跨盘不可靠**：profile 在 C:、源码在 D:，pnpm 的 link: 会**静默留空目录**，
   插件不加载且无报错。**用 `file:` tarball**（npm pack → 解包复制，跨盘可靠）。
2. **profile package.json 别用链式 String.Replace**：两轮 Replace 叠加会产生重复键 + bundles
   条目丢失。**整文重写**。
3. **PowerShell 处理 `@` 开头目录必须 `-LiteralPath`**（`node_modules\@dsh-launcher\...`），
   普通路径静默失败。

### 推荐切换流程（server profile）

```powershell
# 1. 打包（源码根）
npm pack   # 产出 dsh-iconic-launcher-<version>.tgz
# 2. 放稳定路径（别放 TEMP）
Move-Item .\dsh-iconic-launcher-*.tgz C:\Users\admin\.dsh\iconic-pack\ -Force
# 3. 停 web（先杀 3080 的 node 进程）
# 4. 安装（官方命令，pnpm add tarball 转发）
dsh plugin --profile web add C:\Users\admin\.dsh\iconic-pack\dsh-iconic-launcher-<version>.tgz
# 5. 迁移配置：profile 的 cordis.patch.yml 里，插件行 id 改为 dsh-iconic-launcher
#    （config 值 targetExecutable/targetArguments/shortcutName/allowUpload 保持）
# 6. 重启 web，验证：设置导航出现「桌面图标」、5 个 tab、图标缩略图加载
```

### 插件加载机制（调试必备）

- profile 的包注册在**两处**：`package.json` 的 `dependencies` + `dsh.profile.bundles[]`。
- `dsh plugin add` 的本质 = **转发到 profile 目录的 pnpm add**（自动写依赖，bundles 注册按包名）。
- bundle 解析：`createRequire(anchor).resolve.paths(name)`（anchor 先 dsh 安装目录、后 profile
  package.json）→ `node_modules/<name>/package.json` 必须存在。
- patch 的 insert 条目 `name` 会被 **cordis loader require**，**基准 = profile node_modules**——
  name 必须可从那里解析，否则**静默不激活**（无任何报错）。
- **验证 apply 是否被调**：console 会被吞，用**文件探针**（apply 第一行
  `fs.appendFileSync` 写文件）。
- **CDP 验证脚本**（Edge headless + 9222）：**重启 web 后必须从最新启动日志读 token**（token 每次变）；
  截图前 `Emulation.setDeviceMetricsOverride` 设视口，否则内容被裁掉误判排版。

## 遗留任务

1. ~~把 5 tabs 切换到本机 profile~~ ✅ **已完成（2026-09-18）**：GitHub 直装闭环，
   本机 desktop profile 跑的就是当前代码（逐文件与 HEAD 一致）。
2. ~~GitHub git 直装演练~~ ✅ **已完成（2026-09-18）**：`dsh plugin --profile web add github:SkyblueeeLabs/dsh-iconic-launcher`
   成功，装出的文件与当时 main `55a5694` 逐文件 IDENTICAL；`dsh plugin --profile web rm dsh-iconic-launcher`
   卸载也确认（`rm` 不会清 `cordis.patch.yml` 里残留的插件 config，属预期）。
   详见 `.workbuddy/memory/2026-09-18.md`。
3. ~~**自定义图标的删除入口**~~ ✅ **已实现**：新增 `ICONIC_CUSTOM_DELETE_ROUTE`
   （`/dsh-launcher-ic/custom-delete`，POST），host 侧在 `index.js` 注册——走同一信任围栏、
   仅接受 `{ preset: <id> }`、id 必须匹配 `/^[A-Za-z0-9._-]+$/` 且非纯点、目标解析后必须严格落在
   `customDir` 内，`rm(force)` 后返回 `{ ok:true }`。只删用户上传的自定义 `.ico`，出厂预设不可寻址。
   client 侧每个自定义 tile 右上角一个 `×` 删除钮，**两次点击内联确认**（首次变 `✓` 红色 armed，再次
   才真正删；刻意避开 `window.confirm`，嵌入式 webview 常吞掉模态）。删除后刷新目录、清掉对应选中。
4. **发 v0.1.2，让 Release tarball 与"只服务桌面版"的代码一致**：tag `v0.1.1`
   （`55a5694`）落后 main 4 个提交，其 Release 附件仍是旧的 `dsh web` 形态且缺
   `launcher.js`。**代码侧已完成**：`package.json` 版本已是 `0.1.2`，并补上了
   原先声明却缺失的 6 个 `.d.ts`（`index`/`shared`/`ico`/`desktop`/`launcher`/`presets`），
   删掉了 `files` 里匹配不到任何文件的 `presets/*.js`、`presets/*.d.ts` 两个 glob，
   加了 `engines.node >= 20`。
   **仍需手动执行的（本机 `.git` 不可写，沙箱拦截）**：`git add`/`commit` → `npm pack` →
   重建 tag 与 Release。注意 tag 删除重建时 push 报 "already exists" 是误导性的
   （tag 对象哈希每次都变），本地 `git tag -d` 与远端 `git push :refs/tags` 要**分开**执行。
5. ~~**非 PNG 上传（JPEG/WebP）**~~ ✅ **已实现（v0.1.2）**：**不需要 `sharp`**——这是原先的误判。
   浏览器侧 `createImageBitmap` 原生就能解码 PNG/JPEG/WebP，且每一帧都用
   `toDataURL('image/png')` 重新编码，所以 host 的 `ico.js isPng` 校验对象是**浏览器产出的 PNG 帧**，
   而不是用户选的文件，host 侧一行都不用改。改动只有：`accept` 放开到三种格式、
   `pngToFrames` 更名 `imageToFrames`、解码失败时给明确提示。
   **同一轮还修了一个真 bug**：原先对画布长边**没有任何上限**，`MAX_UPLOAD_BASE64` 只管文件字节数。
   一个 1 MiB 的 8000×8000 图解码后是 6400 万像素，`knockOutWhiteBackdrop` 的 flood fill 要分配
   同尺寸 visited 数组，实测 36M 像素就要约 2 秒 + 数百 MB，会把标签页卡死。现在 `MAX_SOURCE_SIDE = 1024`
   （= 最大图标 256 的 4 倍），超出**降采样而非拒绝**。
6. **记住上次选择**：`index.js` 的 settings schema 里注册了 `lastPreset` / `lastShortcut`，
   但 `client.js` **从未读写**它们——刷新页面后选中的图标会丢。待实现。
7. **旧提交里的 mojibake**：`8b28ead` 的 commit message 有编码坏字（历史遗留，不改历史）

## 换图标后桌面图标不刷新（Windows 图标缓存）

图标文件名**必须内容寻址**（`<base>.<sha256[:10]>.ico`，已实现）+ 写完后
`SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, lnk)`（shortcut.ps1 已实现）。
判定信号：属性对话框里是新图标、桌面是旧的 ⇒ 图标缓存问题。
