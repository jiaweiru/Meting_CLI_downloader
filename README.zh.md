# Meting Downloader CLI

单文件 CLI，集合 Playwright Cookie 抓取与 `@meting/core` 下载逻辑，用统一入口完成登录、检索与批量下载。  
下载实现参考 [metowolf/Meting](https://github.com/metowolf/Meting)。  
**English version: [README.md](README.md)**

---

## 📦 安装

```bash
cd Meting_CLI_downloader
npm init -y                     # 已有 package.json 可跳过
npm install
npx playwright install chromium # 准备可用浏览器
```

- 依赖 Node.js ≥ 18。
- 运行 `cookie` 前需完成 Playwright Chromium 安装。

---

## 🚀 命令

所有命令统一为 `node cli.mjs <command>`。

| 命令 | 作用 |
| --- | --- |
| `cookie` | 启动 Chromium 登录并导出 Cookie |
| `keywords` | 以关键词批量搜索 + 下载 |

查看帮助：`node cli.mjs keywords --help`

---

## 🔐 Cookie

```bash
node cli.mjs cookie \
  --platform tencent \
  --output cookies/tencent.txt \
  --format header \
  --timeout 1200
```

- `--platform`: `netease / tencent / kugou / baidu / kuwo`
- `--format`: `header`（默认）或 `json`
- `--output`: 保存路径；省略则仅回显
- `--headless`: 是否无头运行（腾讯建议关闭）
- `--timeout`: 等待登录秒数，默认 900

脚本会轮询浏览器 Cookie，捕获到平台所需字段即导出。

---

## 🎧 关键词下载

命令：`node cli.mjs keywords`

参数说明：

- `--keywords`: 必填。多个关键词用空格分隔，逐一发起检索。
- `--artist`: 仅保留该歌手的独唱歌曲（可选）。
- `--limit`: 每个关键词最多下载多少首，默认 30。
- `--platform`: `netease / tencent / kugou / baidu / kuwo`。
- `--cookie` / `--cookie-file`: 任选一种提供登录 Cookie，也可同时携带（字符串优先）。
- `--quality`: 目标码率 kbps，默认 320。
- `--delay`: 每次请求后的间隔毫秒，默认 1000。
- `--output`: 输出目录，默认 `downloads/`。
- `--overwrite`: 是否覆盖同名文件，默认跳过。

> 未携带 Cookie 时以匿名访问，只能抓取公开/低码率资源。

示例：

```bash
node cli.mjs keywords \
  --platform tencent \
  --keywords 孙燕姿 遇见 \
  --artist 孙燕姿 \
  --limit 40 \
  --output ~/Music/tencent
```

行为说明：
- 关键词以空格分隔，可叠加多个条件。
- `--artist` 会过滤非指定歌手的合作曲目。
- `--limit` 控制每组关键词下载上限，默认 30。
- 搜索按 30 条一页抓取，自动翻页直至满足条件或无更多结果。
- 每首歌显示独立进度条，终端同步统计总体完成度。
- 所有关键词结果写入同一目录，若需拆分可多次执行并调整 `--output`。

---

## 📁 项目结构

```
Meting_CLI_downloader/
├── cli.mjs
├── package.json
├── package-lock.json
├── README.md
└── README.zh.md
```

扩展需求可直接修改 `cli.mjs` 中的命令实现。

---

## ✅ 小贴士

- Playwright 找不到浏览器时重新执行 `npx playwright install chromium`。
- 匿名下载无法触及会员曲或高码率，建议先导 Cookie。
- 限流时调高 `--delay` 放慢请求。
- 已自动过滤非法文件名字符，避免写盘失败。

祝下载愉快！🎵
