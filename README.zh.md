# Meting Downloader CLI 使用指南

> 单文件 CLI，整合 Playwright Cookie 抓取与 `@meting/core` 下载功能，支持多平台关键词检索。  
> 下载核心参考并封装自 [metowolf/Meting](https://github.com/metowolf/Meting)。
> **English version: [README.md](README.md)**

---

## 📦 安装

```bash
cd Meting_CLI_downloader
npm init -y                       # 如已存在 package.json 可跳过
npm install
npx playwright install chromium   # 安装可用的 Chromium
```

- 需要 Node.js ≥ 18。
- 在运行 `cookie` 命令之前必须安装 Playwright Chromium。

---

## 🚀 命令总览

所有操作通过 `node cli.mjs <command>` 执行。

| 命令 | 功能 |
| --- | --- |
| `cookie` | 启动 Chromium 登录平台并导出 Cookie |
| `keywords` | 以多个关键词批量搜索并下载歌曲 |

查看帮助：`node cli.mjs keywords --help`

---

## 🔐 Cookie 获取

```bash
node cli.mjs cookie \
  --platform tencent \
  --output cookies/tencent.txt \
  --format header \
  --timeout 1200
```

参数说明：

- `--platform`: `netease / tencent / kugou / baidu / kuwo`
- `--format`: `header`（默认）或 `json`
- `--output`: Cookie 保存路径；省略则只在终端输出
- `--headless`: 是否启用无头浏览器（QQ 音乐建议关闭）
- `--timeout`: 等待登录的秒数（默认 900）

脚本会轮询 Playwright 浏览器的 Cookie，检测到平台所需字段后立即导出。

---

## 🎧 下载模式

关键词下载共用以下参数：

- `--platform`: `netease / tencent / kugou / baidu / kuwo`
- `--cookie`: 可选，直接输入 Cookie 字符串
- `--cookie-file`: 可选，从文件读取 Cookie
- `--quality`: 音频码率（kbps），默认 320
- `--delay`: 每次请求后的固定延迟（毫秒），默认 1000
- `--output`: 下载目录，默认 `downloads/`
- `--overwrite`: 是否覆盖已存在文件（默认跳过）

> 未提供 Cookie 时将以匿名方式访问，仅能获取公开/低码率资源；建议先使用 `cookie` 命令抓取登录信息。

### 🔍 关键词模式

```bash
node cli.mjs keywords \
  --platform tencent \
  --keywords 孙燕姿 遇见 \
  --artist 孙燕姿 \
  --limit 40 \
  --output ~/Music/tencent
```

- `--keywords`: 多个关键词，空格分隔
- `--artist`: 仅保留指定歌手的独唱歌曲
- `--limit`: 每个关键词最多下载多少首
- 下载过程中会为每首歌显示实时进度条，并输出整体进度（已完成/总数），方便掌握任务进展。
- 搜索按 30 条一页（与 Meting 默认一致）发起请求，如需超过 30 首歌曲会自动翻页，直到收集到足够曲目或没有更多结果。
- 多个关键词的结果都会保存到同一个输出目录，如需区分可分批运行并更改 `--output`。

## 📁 目录结构

```
Meting_CLI_downloader/
├── cli.mjs
├── package.json
├── package-lock.json
├── README.md
└── README.zh.md
```

如需扩展功能，可直接修改 `cli.mjs` 中的命令或配置。

---

## ✅ 小贴士

- 若 Playwright 报告缺少浏览器，重新执行 `npx playwright install chromium`。
- 匿名下载可能无法获取会员歌曲或高码率音频，建议携带 Cookie。
- 遇到接口限流可增大 `--delay` 以降低请求频率。
- 程序会自动清洗非法文件名字符，避免保存失败。

祝下载愉快！🎵
