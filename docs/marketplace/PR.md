# awesome-dsh-plugin 收录 PR

> 状态：`dsh-plugin` topic 已加 ✓；`dsh.bundle`/`peerDependencies`/`homepage`/`repository`/截图 均已就位 ✓；
> 唯一等待项 = GitHub 建仓满 1 天（CI 门槛）。达标后：fork `awesome-dsh-plugin/awesome-dsh-plugin` →
> 新增 `data/plugins/SkyblueeeLabs__dsh-iconic-launcher.yml`（内容见仓库内
> `docs/marketplace/SkyblueeeLabs__dsh-iconic-launcher.yml`）→ 用下面的标题与正文提 PR。
> 提 PR 前先 `git push origin main`（远端需能看到本仓库的截图与投稿文件）。

---

## Title / 标题

```
Add SkyblueeeLabs/dsh-iconic-launcher (ui)
```

## Body / 正文

Adds one entry: `data/plugins/SkyblueeeLabs__dsh-iconic-launcher.yml`.

### Entry

```yaml
url: https://github.com/SkyblueeeLabs/dsh-iconic-launcher
name: SkyblueeeLabs/dsh-iconic-launcher
category: ui
description:
  en: 'Customize the DeepSeek Harness desktop shortcut icon: pick a preset or upload an image, auto-remove the white backdrop, build a multi-size ICO, and write the shortcut in one click.'
  zh: '自定义 DeepSeek Harness 桌面快捷方式图标：选预设或上传图片，自动去除白底、生成多尺寸 ICO，一键写入桌面快捷方式。'
```

### Checklist

- ✅ `dsh.bundle` manifest declared in `package.json` (`dsh.bundle.patch` → `./cordis.patch.yml`); installs via `dsh plugin add github:SkyblueeeLabs/dsh-iconic-launcher`.
- ✅ `cordis.patch.yml` at repo root with an `insert` entry (`id`/`name`).
- ✅ Real, working code — no-build plain JS; host half (`index.js`) + browser settings card (`client.js`).
- ✅ Official `@deepseek-ai/*` declared as `peerDependencies`, not `dependencies`.
- ✅ `dsh-plugin` topic added to the repository.
- ✅ Screenshots declared in-repo (`screenshots.json` + `assets/screenshots/`), covering all five tabs.
- ✅ Repo older than 1 day.

### Description ↔ code (accuracy)

Every claim maps to code:

- *pick a preset* → `presets.js` `PRESET_GROUPS` (default / lightblue 16 / deep-purple 15 / mixed 12).
- *upload an image* → `allowUpload` + browser canvas pipeline in `client.js` (`pngToFrames`), validated host-side in `index.js`.
- *auto-remove the white backdrop* → `knockOutWhiteBackdrop()` (border flood-fill + rim re-alpha).
- *build a multi-size ICO* → `ico.js` `buildIco()` over `ICON_SIZES = [256,128,64,48,32,24,16]`.
- *write the shortcut in one click* → install route → `desktop.js` `writeShortcut()` → `.lnk` via `shortcut.ps1`.

### Category

Filed under `ui` because it ships a first-class settings surface (a nav section + plugin card) inside the DeepSeek Harness web app. Happy to be re-filed if a maintainer thinks another category fits better.

---

新增一条收录：`data/plugins/SkyblueeeLabs__dsh-iconic-launcher.yml`。

**收录要点**：`package.json` 已声明 `dsh.bundle` manifest（`dsh.bundle.patch` → `./cordis.patch.yml`），可用 `dsh plugin add github:SkyblueeeLabs/dsh-iconic-launcher` 安装；官方包用 `peerDependencies` 声明；已为仓库加 `dsh-plugin` topic；截图在本仓库内声明（`screenshots.json` + `assets/screenshots/`，覆盖五个分组）。

**描述与代码逐条对应**（确保属实）：预设选择 → `presets.js`；图片上传 → `client.js` 画布管线 + `index.js` 校验；自动去白底 → `knockOutWhiteBackdrop()`；多尺寸 ICO → `ico.js` `buildIco()`（256/128/64/48/32/24/16）；一键写快捷方式 → `desktop.js` `writeShortcut()` 经 `shortcut.ps1` 生成 `.lnk`。

**分类**：因其在 DeepSeek Harness web 内提供一级设置界面（导航项 + 插件卡片），归入 `ui`；若维护者认为有更贴切的分类，接受调整。
