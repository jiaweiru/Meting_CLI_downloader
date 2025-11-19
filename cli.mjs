#!/usr/bin/env node
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { chromium } from "playwright";
import { Command, InvalidOptionArgumentError } from "commander";
import Meting from "@meting/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OUTPUT = path.join(__dirname, "downloads");

const COOKIE_PLATFORMS = {
  netease: {
    url: "https://music.163.com/",
    domain: ".163.com",
    required: ["MUSIC_U"],
    tips: "请登录网易云~",
  },
  tencent: {
    url: "https://y.qq.com/",
    domain: ".qq.com",
    required: ["uin"],
    tips: "请登录QQ音乐~",
  },
  kugou: {
    url: "https://www.kugou.com/",
    domain: ".kugou.com",
    required: [],
    tips: "请登录酷狗音乐~",
  },
  baidu: {
    url: "https://music.baidu.com/",
    domain: ".baidu.com",
    required: ["BDUSS"],
    tips: "请登录百度音乐~",
  },
  kuwo: {
    url: "https://www.kuwo.cn/",
    domain: ".kuwo.cn",
    required: [],
    tips: "请登录酷我音乐~",
  },
};

const SUPPORTED_PLATFORMS = ["netease", "tencent", "kugou", "baidu", "kuwo"];

const program = new Command().description(
  "🥰 Meting Downloader CLI"
);

program
  .command("cookie")
  .description("📲 Log in to Music Platform to Get Cookies")
  .requiredOption(
    "--platform <id>",
    `🎶 Platform: ${Object.keys(COOKIE_PLATFORMS).join("/")}`,
    ensureCookiePlatform
  )
  .option("--format <type>", "📄 Output format: header or json", validateCookieFormat, "header")
  .option("--output <file>", "🗂️ Save cookies to a local file")
  .option("--timeout <sec>", "⏲️ Maximum login wait time (seconds)", parseInteger("timeout"), 900)
  .option("--headless", "🖥️ Run browser in headless mode", false)
  .action(async (options) => {
    try {
      await runCookieFlow(options);
    } catch (err) {
      fail(err);
    }
  });

const keywordCommand = program
  .command("keywords")
  .description("🔍 Batch download songs using multiple search keywords")
  .requiredOption("--keywords <words...>", "📝 List of search keywords")
  .option("--artist <name>", "🎤 Keep only songs solo-performed by the specified artist")
  .option("--limit <n>", "🔢 Maximum number of songs per keyword", parseInteger("limit"), 30);
attachDownloadOptions(keywordCommand);
keywordCommand.action((options) => runDownload(options, runKeywordMode));

const albumCommand = program
  .command("album")
  .description("💿 Download a full album by ID or keyword search")
  .option("--album-id <id...>", "🆔 Album ID/MID")
  .option(
    "--album-query <text...>",
    "🔍 Album keyword search）"
  )
  .option(
    "--limit <n>",
    "🔢 Maximum number of tracks to download",
    parseInteger("limit"),
    100
  );
attachDownloadOptions(albumCommand);
albumCommand.action((options) => runDownload(options, runAlbumMode));

await program.parseAsync(process.argv);

function attachDownloadOptions(cmd) {
  cmd
    .requiredOption(
      "--platform <id>",
      `🎶 Music platform: ${SUPPORTED_PLATFORMS.join("/")}`,
      ensurePlatform
    )
    .option("--cookie <value>", "🍪 Directly provide the cookie string")
    .option("--cookie-file <file>", "📄 Load cookie from a file")
    .option("--quality <kbps>", "🎧 Audio bitrate (kbps)", parseInteger("quality"), 320)
    .option("--delay <ms>", "⏱️ Fixed delay between API requests (ms)", parseInteger("delay"), 1000)
    .option(
      "--output <dir>",
      "📁 Output directory for downloaded files",
      (value) => path.resolve(value),
      DEFAULT_OUTPUT
    )
    .option("--overwrite", "♻️ Overwrite existing files", false);
}

async function runCookieFlow(options) {
  const config = COOKIE_PLATFORMS[options.platform];

  console.log(chalk.cyan(`[INFO] 🌐 Opening login page: ${config.url}`));
  console.log(chalk.cyan(`[INFO] 📘 Instructions: ${config.tips}`));

  const browser = await launchBrowser(!!options.headless);
  const context = await browser.newContext();

  let cookies;
  try {
    const page = await context.newPage();
    console.log(chalk.blue(`⏳ Loading login page...`));

    await page.goto(config.url, { waitUntil: "domcontentloaded" });
    console.log(chalk.blue(`⏱️ Waiting up to ${options.timeout}s for successful login...`));

    let removeCloseListeners = () => {};
    const closePromise = new Promise((_, reject) => {
      const onClose = () =>
        reject(new Error("Browser window was closed before cookies were captured."));
      page.once("close", onClose);
      context.once("close", onClose);
      removeCloseListeners = () => {
        page.off("close", onClose);
        context.off("close", onClose);
      };
    });

    cookies = await Promise.race([
      waitForCookie(context, config, options.timeout),
      closePromise,
    ]).finally(removeCloseListeners);
  } finally {
    await browser.close().catch(() => {});
  }

  const result = formatCookies(cookies, options.format);

  if (options.output) {
    const file = path.resolve(options.output);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, result, "utf-8");

    console.log(chalk.green(`[OK] 🍪 Cookies saved to: ${file}`));
  } else {
    console.log(chalk.green(`[OK] 🍪 Cookies captured:\n`));
    console.log(result);
  }
}

async function launchBrowser(headless) {
  const baseOptions = { headless };
  try {
    // Prefer local Chrome installation when available.
    return await chromium.launch({ ...baseOptions, channel: "chrome" });
  } catch (err) {
    console.log(
      chalk.yellow(
        `[WARN] ⚠️ Failed to launch local Chrome (${err.message}), falling back to bundled Chromium.`
      )
    );
    return chromium.launch(baseOptions);
  }
}

async function waitForCookie(context, config, timeout) {
  const deadline = Date.now() + timeout * 1000;
  const suffix = config.domain.toLowerCase();

  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    const filtered = cookies.filter((c) =>
      String(c.domain || "").toLowerCase().endsWith(suffix)
    );

    if (filtered.length && hasRequired(filtered, config.required)) {
      console.log(chalk.green(`🎉 Login detected — cookies successfully captured!`));
      return filtered;
    }

    console.log(chalk.gray(`… Still waiting for valid cookies (checking again in 2s)`));
    await sleep(2000);
  }

  throw new Error(`Login timeout. Try increasing --timeout.`);
}

function hasRequired(cookies, required) {
  const names = new Set(
    cookies.map((cookie) => cookie.name?.toLowerCase()).filter(Boolean)
  );
  return required.every((name) => names.has(name.toLowerCase()));
}

function formatCookies(cookies, fmt) {
  if (!cookies.length) throw new Error("No cookies were captured.");

  if (fmt === "json") {
    return JSON.stringify(cookies, null, 2);
  }

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function runDownload(options, handler) {
  try {
    const ctx = await buildDownloadContext(options);
    console.log(chalk.cyan(`🚀 Starting download task...\n`));
    await handler(ctx);
  } catch (err) {
    fail(err);
  }
}

async function buildDownloadContext(options) {
  let cookie = null;
  if (options.cookie) {
    cookie = options.cookie.trim();
  } else if (options.cookieFile) {
    cookie = await readCookieFile(options.cookieFile);
  }

  const meting = new Meting(options.platform);
  meting.format(true);
  if (cookie) {
    meting.cookie(cookie);
  } else {
    console.log(
      chalk.yellow("⚠️  No cookie provided, proceeding with anonymous requests.")
    );
  }

  const outputDir = path.resolve(options.output || DEFAULT_OUTPUT);
  await fsp.mkdir(outputDir, { recursive: true });

  console.log(chalk.gray(`📁 Output directory: ${outputDir}`));

  return { meting, cookie, options, outputDir };
}

async function readCookieFile(file) {
  if (!file) throw new Error("Please specify --cookie or --cookie-file.");

  const content = await fsp.readFile(path.resolve(file), "utf-8");
  const trimmed = content.trim();

  if (!trimmed) throw new Error("Cookie file is empty.");

  return trimmed;
}

async function runKeywordMode(ctx) {
  const { meting, options } = ctx;

  for (const keyword of options.keywords) {
    console.log(chalk.cyan(`🔍 Searching for: "${keyword}"`));

    const raw = await meting.search(keyword, { limit: options.limit });
    await sleep(options.delay);

    let songs = parseSongList(raw);

    if (!songs.length) {
      console.log(chalk.yellow(`⚠️  No songs found for "${keyword}"`));
      continue;
    }

    if (options.artist) {
      songs = songs.filter((song) =>
        isSoloMatch(song, options.artist.trim())
      );
      console.log(chalk.gray(`🎤 After filtering by artist: ${songs.length} result(s)`));
    }

    console.log(chalk.green(`🎵 Preparing to download ${songs.slice(0, options.limit).length} song(s)...`));
    await downloadSongs(ctx, songs.slice(0, options.limit));
  }
}

async function runAlbumMode(ctx) {
  const { meting, options } = ctx;

  const albumIds = Array.isArray(options.albumId) ? [...options.albumId] : [];
  const albumQueries = Array.isArray(options.albumQuery) ? options.albumQuery : [];

  if (!albumIds.length && !albumQueries.length) {
    throw new Error("You must specify at least one --album-id or --album-query.");
  }

  const resolvedIds = [];

  for (const query of albumQueries) {
    const id = await resolveAlbumByQuery(ctx, query);
    if (id) resolvedIds.push(id);
  }

  resolvedIds.push(...albumIds);

  for (const albumId of resolvedIds) {
    console.log(chalk.cyan(`💿 Fetching album: ${albumId}`));

    const raw = await meting.album(albumId);
    await sleep(options.delay);

    const songs = parseSongList(raw);
    if (!songs.length) {
      console.log(chalk.yellow(`⚠️  Album ${albumId} has no downloadable tracks.`));
      continue;
    }

    console.log(
      chalk.green(`🎵 Preparing to download ${songs.slice(0, options.limit).length} track(s)...`)
    );
    await downloadSongs(ctx, songs.slice(0, options.limit));
  }
}

async function resolveAlbumByQuery(ctx, query) {
  console.log(chalk.cyan(`🔍 Searching album by keyword: "${query}"`));

  const searcher = new Meting(ctx.options.platform);
  searcher.format(false);
  if (ctx.cookie) {
    searcher.cookie(ctx.cookie);
  }

  const params = {};
  if (ctx.options.platform === "netease") params.type = 10;

  const raw = await searcher.search(query, params);
  await sleep(ctx.options.delay);

  const payload = safeParseJSON(raw);
  const candidates = normalizeAlbumCandidates(payload, ctx.options.platform);

  if (!candidates.length) {
    console.log(chalk.yellow(`⚠️  No album found for query "${query}".`));
    return null;
  }

  const chosen = candidates[0];

  console.log(
    chalk.green(`📀 Selected album ${chosen.id}: ${chosen.name} - ${chosen.artist}`)
  );

  return chosen.id;
}

async function downloadSongs(ctx, songs) {
  for (const song of songs) {
    const label = `${song.name} - ${(song.artist || []).join("/")}`;
    console.log(chalk.blue(`➡️  Downloading: ${label}`));

    try {
      await downloadSingle(ctx, song);
      console.log(chalk.green(`  ✓ Completed: ${label}`));
    } catch (err) {
      console.log(chalk.red(`  ✗ Failed: ${label} (${err.message})`));
    }

    await sleep(ctx.options.delay);
  }
}

async function downloadSingle(ctx, song) {
  const raw = await ctx.meting.url(song.url_id, ctx.options.quality);
  await sleep(ctx.options.delay);

  let payload = safeParseJSON(raw);
  if (Array.isArray(payload)) payload = payload[0];

  const url = payload?.url;
  if (!url) throw new Error("Audio URL not available.");

  const ext = path.extname(url.split("?")[0]) || ".mp3";
  const safeName = sanitize(song.name || song.id);
  const target = path.join(ctx.outputDir, `${safeName}${ext}`);

  if (!ctx.options.overwrite && fs.existsSync(target)) {
    console.log(chalk.gray(`  • File exists, skipping: ${target}`));
    return;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(target, buffer);
}

/* ---- rest of helper functions unchanged except error text ---- */

function parseSongList(raw) {
  const payload = safeParseJSON(raw);
  return Array.isArray(payload) ? payload : [];
}

function normalizeAlbumCandidates(payload, platform) {
  if (!payload) return [];

  if (platform === "netease") {
    return (payload.result?.albums || []).map((album) => ({
      id: album.id,
      name: album.name,
      artist:
        album.artist?.name ||
        (album.artists ? album.artists.map((a) => a.name).join("/") : ""),
    }));
  }

  if (platform === "tencent") {
    return (payload.data?.album?.list || [])
      .map((album) => ({
        id: album.mid || album.albumMid,
        name: album.name || album.albumName,
        artist: Array.isArray(album.singer)
          ? album.singer.map((s) => s.name).join("/")
          : album.singerName || "",
      }))
      .filter((album) => album.id && album.name);
  }

  return [];
}

function isSoloMatch(song, artist) {
  const names = song.artist || [];
  return (
    names.length === 1 &&
    names[0].toLowerCase().includes(artist.toLowerCase())
  );
}

function sanitize(text) {
  return text.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "track";
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensurePlatform(platform) {
  const value = (platform || "").toLowerCase();
  if (!SUPPORTED_PLATFORMS.includes(value)) {
    throw new InvalidOptionArgumentError(
      `Unsupported platform. Available: ${SUPPORTED_PLATFORMS.join(", ")}`
    );
  }
  return value;
}

function ensureCookiePlatform(platform) {
  const lower = (platform || "").toLowerCase();
  if (!COOKIE_PLATFORMS[lower]) {
    throw new InvalidOptionArgumentError(
      `Unsupported platform. Available: ${Object.keys(COOKIE_PLATFORMS).join(", ")}`
    );
  }
  return lower;
}

function validateCookieFormat(fmt) {
  const value = (fmt || "").toLowerCase();

  if (!["header", "json"].includes(value)) {
    throw new InvalidOptionArgumentError(
      `format must be "header" or "json"`
    );
  }

  return value;
}

function parseInteger(label) {
  return (value) => {
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed)) {
      throw new InvalidOptionArgumentError(`${label} must be an integer`);
    }

    return parsed;
  };
}

function fail(err) {
  console.error(chalk.red(`✗ ${err.message}`));
  process.exitCode = 1;
}
