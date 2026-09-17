# dsh-iconic-launcher 交接说明（HANDOFF）

> 写给接手本项目的 AI/开发者。读完这篇就能了解架构、当前状态、踩过的坑和遗留任务。

## 项目是什么

DeepSeek Harness（DSH）的**桌面快捷方式图标插件**：在 DSH web 设置页里选预设图标或上传
PNG，插件自动**去白底、切多尺寸 ICO**，然后**一键写入桌面快捷方式**。

- 插件 id / npm name：`dsh-iconic-launcher`（仓库根就是包根，**可以** `dsh plugin add github:SkyblueeeLabs/dsh-iconic-launcher`）
- 界面显示名：`桌面图标`（client.js 的 settings.section label）
- 素材源：`data/1`（浅蓝 16 张）、`data/2`（深紫 15 张）、`data/3`（混搭 12 张）——约 300×300 PNG，
  与 `presets/assets/{lightblue,deepblue,mixed}` 三个目录一一对应。（历史坑：拆 tab 后 `mixed/`
  目录和 `data/3` 一度没建，混搭图标全留在 `deepblue/` 里 → 混搭 tab 404 裂图；已分离修复。）

## 架构（仓库根 = 包根）

| 文件 | 角色 |
|---|---|
| `index.js` | host 半：cordis function-plugin，webServer 路由 + settings 命名空间注册；presets 接口附带读自自身 package.json 的 `{name,version,homepage}` meta |
| `client.js` | 浏览器半：**no-build**（`window.__ModuleLoader__.load({id, factory})` 形式，不能有顶层 import/export）；卡片底部页脚显示项目主页链接 + `v版本`（取自 host meta，缺省回退内联常量 `PLUGIN_REPO_FALLBACK`/`PLUGIN_VERSION_FALLBACK`）|
| `shared.js` | 前后端共享常量（路由前缀、ICON_SIZES 白名单、slugify）|
| `presets.js` | 分组预设目录：`PRESET_GROUPS`（默认/浅蓝/深紫/混搭/自定义）+ 自定义目录扫描 |
| `ico.js` | PNG → ICO 打包（ICONDIR + ICONDIRENTRY，payload 长度**必须 32 位写**）|
| `desktop.js` | 经 `ctx.subprocess` 调 PowerShell 写 .lnk（`-File` 传参，绝不用 `-Command`）|
| `shortcut.ps1` | 实际写 .lnk 的脚本（`SHChangeNotify` 通知 Explorer 刷新图标）|
| `cordis.patch.yml` | bundle patch：insert 插件行（id/name/config）|
| `scripts/` | 开发工具链（启动 bat、图标生成、PNG→ICO 批量转换），**不进 npm 包** |
| `data/` | 素材源 + 废弃图标备份，**不进 npm 包** |

## Tab 分组结构（代码已实现，GitHub 已推送）

```
默认(1) / 浅蓝(16) / 深紫(15) / 混搭(12) / 自定义(用户上传，目录扫描)
```

## 当前状态（⚠️ 接手者必读）

**代码全部完成并推送**（main 分支，commit 2506e84+）。但 **profile 安装形态落后**：

- **本机 profile**（`~/.dsh/profiles/web`）当前跑的是**旧形态**：
  - 依赖：`@dsh-launcher/iconic: file:TEMP tgz`（旧包名 + 旧 4-tab 代码）
  - bundles：`@dsh-launcher/iconic`
  - node_modules 里的文件被手工同步过（client.js/presets.js 是新的，显示名还是旧的）
- **5 tabs + 桌面图标显示名还没生效到本机 profile**（见下面的切换坑）

## 切换 profile 到新版的正确方式（踩坑后得出的可靠路径）

### ⚠️ 三大坑（都真踩过）

1. **`link:` 目录依赖跨盘不可靠**：profile 在 C:、源码在 D:，pnpm 的 link: 会**静默留空目录**，
   插件不加载且无报错。**用 `file:` tarball**（npm pack → 解包复制，跨盘可靠）。
2. **profile package.json 别用链式 String.Replace**：两轮 Replace 叠加会产生重复键 + bundles
   条目丢失。**整文重写**。
3. **PowerShell 处理 `@` 开头目录必须 `-LiteralPath`**（`node_modules\@dsh-launcher\...`），
   普通路径静默失败。

### 推荐切换流程

```powershell
# 1. 打包（源码根）
npm pack   # 产出 dsh-iconic-launcher-<version>.tgz
# 2. 放稳定路径（别放 TEMP）
Move-Item .\dsh-iconic-launcher-*.tgz C:\Users\admin\.dsh\iconic-pack\ -Force
# 3. 停 web（先杀 3080 的 node 进程）
# 4. 安装（官方命令，pnpm add tarball 转发）
dsh plugin add --profile web C:\Users\admin\.dsh\iconic-pack\dsh-iconic-launcher-<version>.tgz
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

1. **把 5 tabs 切换到本机 profile**（按上面流程，一次成功后再动日常 profile）
2. **GitHub git 直装演练**：`dsh plugin add github:SkyblueeeLabs/dsh-iconic-launcher`
   （包已在仓库根，理论上可用，但需在空 profile 演练验证）
3. ~~**自定义图标的删除入口**~~ ✅ **已实现**：新增 `ICONIC_CUSTOM_DELETE_ROUTE`
   （`/dsh-launcher-ic/custom-delete`，POST），host 侧在 `index.js` 注册——走同一信任围栏、
   仅接受 `{ preset: <id> }`、id 必须匹配 `/^[A-Za-z0-9._-]+$/` 且非纯点、目标解析后必须严格落在
   `customDir` 内，`rm(force)` 后返回 `{ ok:true }`。只删用户上传的自定义 `.ico`，出厂预设不可寻址。
   client 侧每个自定义 tile 右上角一个 `×` 删除钮，**两次点击内联确认**（首次变 `✓` 红色 armed，再次
   才真正删；刻意避开 `window.confirm`，嵌入式 webview 常吞掉模态）。删除后刷新目录、清掉对应选中。
   ⚠️ 本机 profile 需按任务 1 的流程重装 tarball 才能拿到这个新能力。
4. **旧提交里的 mojibake**：`8b28ead` 的 commit message 有编码坏字（历史遗留，不改历史）

## 换图标后桌面图标不刷新（Windows 图标缓存）

图标文件名**必须内容寻址**（`<base>.<sha256[:10]>.ico`，已实现）+ 写完后
`SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, lnk)`（shortcut.ps1 已实现）。
判定信号：属性对话框里是新图标、桌面是旧的 ⇒ 图标缓存问题。
