# Meting Downloader CLI

Single-file CLI that unifies Playwright cookie capture with the `@meting/core` downloader so you can log in, search, and bulk-download from one entry point.  
Download logic is adapted from [metowolf/Meting](https://github.com/metowolf/Meting).  
**中文说明请见 [README.zh.md](README.zh.md)。**

---

## Installation

```bash
cd Meting_CLI_downloader
npm init -y                     # skip if package.json already exists
npm install
npx playwright install chromium # ensure Chromium is available
```

- Requires Node.js ≥ 18.
- Install Playwright Chromium before running the `cookie` command.

---

## Commands

All commands use `node cli.mjs <command>`.

| Command | Description |
| --- | --- |
| `cookie` | Launch Chromium, log in, and export cookies |
| `keywords` | Search multiple keywords and download the matches |

Show help with `node cli.mjs keywords --help`.

---

## Cookie Capture

```bash
node cli.mjs cookie \
  --platform tencent \
  --output cookies/tencent.txt \
  --format header \
  --timeout 1200
```

Options:

- `--platform`: one of `netease / tencent / kugou / baidu / kuwo`
- `--format`: `header` (default) or `json`
- `--output`: path to save the cookie string; omit to print only
- `--headless`: run Chromium headless (not recommended for Tencent)
- `--timeout`: seconds to wait for login (default 900)

The CLI polls Playwright cookies until the required keys for the chosen platform appear, then exports them.

---

## Keyword Downloads

Command: `node cli.mjs keywords`

Options:

- `--keywords`: required. Provide multiple keywords separated by spaces; each is searched independently.
- `--artist`: keep only solo tracks performed by the given artist (optional).
- `--limit`: maximum downloads per keyword, default 30.
- `--platform`: one of `netease / tencent / kugou / baidu / kuwo`.
- `--cookie` / `--cookie-file`: inject cookies inline or from disk (both allowed; inline string takes precedence).
- `--quality`: target bitrate in kbps, default 320.
- `--delay`: delay between requests in milliseconds, default 1000.
- `--output`: destination directory, default `downloads/`.
- `--overwrite`: overwrite existing files instead of skipping.

> Without cookies the CLI uses anonymous requests, which usually return only public or low bitrate tracks.

Example:

```bash
node cli.mjs keywords \
  --platform tencent \
  --keywords "孙燕姿" "遇见" \
  --artist "孙燕姿" \
  --limit 40 \
  --output ~/Music/tencent
```

- `--keywords`: space-separated keyword list
- `--artist`: keep only songs where the artist list contains exactly the given name
- Keywords are space-separated; combine multiple terms as needed.
- `--artist` filters out collaborations that don't match the exact artist name.
- Pagination happens in blocks of 30 tracks (Meting's default) until enough results are collected or the API is exhausted.
- Every song has its own progress bar plus a global `completed/total` counter for the batch.
- All keywords write into the same directory; run multiple batches with different `--output` paths if you prefer per-keyword folders.

## Project Structure

```
Meting_CLI_downloader/
├── cli.mjs
├── package.json
├── package-lock.json
├── README.md
└── README.zh.md
```

Extend the CLI by editing `cli.mjs` to add new commands or tweak options.

---

## Tips

- Re-run `npx playwright install chromium` if Playwright reports a missing browser binary.
- Anonymous downloads may fail on premium content; capture cookies with the `cookie` command for the best results.
- Increase `--delay` if you encounter throttling or need to slow down requests.
- The script sanitizes filenames automatically, replacing illegal characters before saving tracks.

Happy downloading! 🎵
