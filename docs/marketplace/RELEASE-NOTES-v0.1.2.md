## dsh-iconic-launcher v0.1.2

第一个与 **desktop-client-only** 代码形态一致的发布。`v0.1.1` 的 tarball 仍是旧的
`dsh web` 形态（快捷方式目标是 `powershell -Command "dsh web"`，且缺 `launcher.js`），
请升级到本版本。

### 变更

* **支持 PNG / JPEG / WebP 上传**。浏览器 `createImageBitmap` 解码，每帧统一重编码为
  PNG，因此 host 侧无需任何栅格化依赖（`sharp` 并不需要），`isPng` 帧校验依然成立。
* **修复大图卡死**：工作画布此前对像素尺寸**没有任何上限**（只校验 1 MiB 文件大小），
  一个 1 MiB 的 8000×8000 解码后是 6400 万像素，flood fill 会占用数百 MB 并冻结标签页。
  现在长边上限 1024，超出**降采样而非拒绝**。
* **补齐 6 个 `.d.ts`**（`index` / `shared` / `ico` / `desktop` / `launcher` / `presets`），
  此前 `package.json` 已声明却未随包发布。
* 移除死代码 `ICONIC_VERSION`；同步客户端版本兜底常量（原先仍写着 0.1.1）。
* 测试从 8 个增至 **19 个**，覆盖 ICO 目录布局（含 >64 KiB 的 32 位长度回归）与预设目录完整性。
* 文档：围绕项目初衷重写 README，修正 `docs/plugin.md` 与 `docs/HANDOFF.md` 的过期事实。

### 安装

```
github:SkyblueeeLabs/dsh-iconic-launcher
```

离线：下载下方的 `dsh-iconic-launcher-<version>.tgz`。

### 要求

Windows 10/11 · PowerShell 5.1+ · 运行中的 DeepSeek Harness 桌面客户端。
