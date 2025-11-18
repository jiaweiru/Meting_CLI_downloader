# Meting Downloader CLI

Single-file CLI that combines Playwright cookie capture with the `@meting/core` downloader.  
Download core is adapted from and built atop [metowolf/Meting](https://github.com/metowolf/Meting).  
**中文说明请见 [README.zh.md](README.zh.md)。**

---

## Installation

```bash
cd Meting_CLI_downloader
npm init -y                       # if you cloned only the sources
npm install
npx playwright install chromium   # install a compatible Chromium build
```

- Requires Node.js ≥ 18.
- Playwright must have Chromium installed before the `cookie` command can launch a browser.

---

## Command Overview

All actions run through `node cli.mjs <command>`.

| Command | Description |
| --- | --- |
| `cookie` | Launch Chromium, log into a platform, and export cookies |
| `keywords` | Search multiple keywords and download matching songs |
| `album` | Download full albums by ID or keyword search |

Show help for any command with e.g. `node cli.mjs keywords --help`.

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

## Download Modes

Shared options for every download command:

- `--platform`: `netease / tencent / kugou / baidu / kuwo`
- `--cookie`: optional inline cookie string
- `--cookie-file`: optional path to a cookie file
- `--quality`: bitrate in kbps (default 320)
- `--delay`: fixed delay after each request in ms (default 1000)
- `--output`: download directory (default `downloads/`)
- `--overwrite`: overwrite existing files instead of skipping

> Without cookies, all API calls are anonymous and may return only public/low-bitrate content. Supply cookies to access full catalogs and premium bitrates.

### Keyword Mode

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
- `--limit`: maximum songs per keyword
- All results are stored in the same output folder. Use separate runs/output paths if you prefer per-keyword directories.

### Album Mode

```bash
node cli.mjs album \
  --platform netease \
  --album-query "林俊杰 因你而在" "周杰伦 七里香" \
  --album-id 12345678 \
  --limit 25
```

- `--album-id`: supply one or more known album IDs/MIDs.
- `--album-query`: search by keyword when the ID is unknown; multiple queries are resolved sequentially (NetEase uses `type=10`, Tencent parses `album.list` entries).
- `--limit`: cap the number of tracks downloaded per album.

---

## Project Structure

```
Meting_CLI_downloader/
├── cli.mjs      # main CLI entry point
├── package.json
├── package-lock.json
└── README*.md
```

Extend the CLI by editing `cli.mjs` to add new commands or tweak options.

---

## Tips

- Re-run `npx playwright install chromium` if Playwright reports a missing browser binary.
- Anonymous downloads may fail on premium content; capture cookies with the `cookie` command for the best results.
- Increase `--delay` if you encounter throttling or need to slow down requests.
- The script sanitizes filenames automatically, replacing illegal characters before saving tracks.

Happy downloading! 🎵
