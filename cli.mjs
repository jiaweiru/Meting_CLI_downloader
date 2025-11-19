#!/usr/bin/env node
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { once } from "events";
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

const program = new Command().description("🥰 Meting Downloader CLI");
const SEARCH_PAGE_SIZE = 30;
const SEARCH_TYPE_SONG = 1;
const PROGRESS_BAR_WIDTH = 24;

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
keywordCommand.action(async (options) => {
  try {
    const ctx = await createDownloadContext(options);
    console.log(chalk.cyan(`🚀 Starting download task...\n`));
    await downloadByKeywords(ctx);
  } catch (err) {
    fail(err);
  }
});

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

async function createDownloadContext(options) {
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

  return {
    meting,
    cookie,
    options,
    outputDir,
    progress: {
      completed: 0,
      total: 0,
    },
  };
}

async function readCookieFile(file) {
  if (!file) throw new Error("Please specify --cookie or --cookie-file.");

  const content = await fsp.readFile(path.resolve(file), "utf-8");
  const trimmed = content.trim();

  if (!trimmed) throw new Error("Cookie file is empty.");

  return trimmed;
}

async function downloadByKeywords(ctx) {
  for (const keyword of ctx.options.keywords) {
    await downloadByKeyword(ctx, keyword);
  }
}

async function downloadByKeyword(ctx, keyword) {
  console.log(chalk.cyan(`🔍 Searching for: "${keyword}"`));

  let songs = await searchKeywordSongs(ctx, keyword);
  if (!songs.length) {
    console.log(chalk.yellow(`⚠️  No songs found for "${keyword}"`));
    return;
  }

  if (ctx.options.artist) {
    songs = songs.filter((song) => isSoloMatch(song, ctx.options.artist.trim()));
    console.log(chalk.gray(`🎤 After filtering by artist: ${songs.length} result(s)`));
  }

  const planned = songs.slice(0, ctx.options.limit);
  if (!planned.length) {
    console.log(chalk.yellow(`⚠️  No downloadable songs remain for "${keyword}".`));
    return;
  }

  ctx.progress.total += planned.length;
  console.log(chalk.green(`🎵 Preparing to download ${planned.length} song(s)...`));
  await downloadTracks(ctx, planned);
}

async function searchKeywordSongs(ctx, keyword) {
  const target = Math.max(0, ctx.options.limit || 0);
  if (!target) return [];

  const collected = [];
  let page = 1;

  while (collected.length < target) {
    console.log(chalk.gray(`  • Fetching page ${page} (limit ${SEARCH_PAGE_SIZE})`));

    const raw = await ctx.meting.search(keyword, {
      type: SEARCH_TYPE_SONG,
      page,
      limit: SEARCH_PAGE_SIZE,
    });
    await sleep(ctx.options.delay);

    const batch = parseSongList(raw);
    if (!batch.length) break;

    collected.push(...batch);

    if (batch.length < SEARCH_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return collected.slice(0, target);
}

async function downloadTracks(ctx, songs) {
  for (const song of songs) {
    const label = `${song.name} - ${(song.artist || []).join("/")}`;
    const order = ctx.progress.completed + 1;
    console.log(chalk.blue(`➡️  Downloading (${order}/${ctx.progress.total}): ${label}`));

    try {
      await downloadTrack(ctx, song, label);
      console.log(chalk.green(`  ✓ Completed: ${label}`));
    } catch (err) {
      console.log(chalk.red(`  ✗ Failed: ${label} (${err.message})`));
    } finally {
      ctx.progress.completed += 1;
      logOverallProgress(ctx);
      await sleep(ctx.options.delay);
    }
  }
}

async function downloadTrack(ctx, song, label) {
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

  const totalBytes = Number(res.headers.get("content-length") || 0);
  const progress = createSongProgressRenderer(label);
  let received = 0;

  try {
    await writeStreamToFile(res.body, target, (chunkSize) => {
      received += chunkSize;
      progress.update(received, totalBytes);
    });
  } finally {
    progress.complete(received, totalBytes || received);
  }
}

async function writeStreamToFile(body, target, onChunk) {
  if (!body) throw new Error("Empty response body.");

  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    const output = fs.createWriteStream(target);

    await new Promise((resolve, reject) => {
      output.on("error", reject);

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunk = Buffer.from(value);
              if (!output.write(chunk)) {
                await once(output, "drain");
              }
              onChunk(chunk.length);
            }
          }
          output.end(resolve);
        } catch (err) {
          output.destroy();
          reject(err);
        }
      };

      pump();
    });
    return;
  }

  if (typeof body.pipe === "function" && typeof body.on === "function") {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(target);
      let finished = false;

      const cleanup = (err) => {
        if (finished) return;
        finished = true;
        output.destroy();
        if (typeof body.destroy === "function") body.destroy();
        reject(err);
      };

      body.on("data", (chunk) => {
        const size = Buffer.isBuffer(chunk)
          ? chunk.length
          : typeof chunk === "string"
          ? Buffer.byteLength(chunk)
          : chunk?.length || chunk?.byteLength || 0;
        onChunk(size);
      });
      body.on("error", cleanup);
      output.on("error", cleanup);
      output.on("finish", () => {
        if (finished) return;
        finished = true;
        resolve();
      });

      body.pipe(output);
    });
    return;
  }

  throw new Error("Unsupported response body.");
}

function parseSongList(raw) {
  const payload = safeParseJSON(raw);
  return Array.isArray(payload) ? payload : [];
}

function logOverallProgress(ctx) {
  const progress = ctx.progress;
  if (!progress || !progress.total) return;

  const completed = Math.min(progress.completed, progress.total);
  const percent = ((completed / progress.total) * 100).toFixed(1);
  console.log(chalk.cyan(`📊 Overall progress: ${completed}/${progress.total} (${percent}%)`));
}

function createSongProgressRenderer(label) {
  let lastLine = "";
  let active = false;

  return {
    update(current, total) {
      lastLine = formatSongProgress(current, total, label);
      process.stdout.write(`\r${lastLine}`);
      active = true;
    },
    complete(current, total) {
      if (!active) return;
      lastLine = formatSongProgress(current, total, label);
      process.stdout.write(`\r${lastLine}\n`);
      active = false;
    },
  };
}

function formatSongProgress(current, total, label) {
  const bar = renderProgressBar(current, total);
  const bytes = formatByteProgress(current, total);
  const suffix = label ? ` ${truncateLabel(label, 40)}` : "";
  return chalk.gray(`    ${bar} ${bytes}${suffix}`);
}

function renderProgressBar(current, total) {
  if (!Number.isFinite(current) || current < 0) current = 0;

  if (!total || !Number.isFinite(total) || total <= 0) {
    const position = Math.floor((Date.now() / 120) % PROGRESS_BAR_WIDTH);
    const segments = new Array(PROGRESS_BAR_WIDTH).fill("-");
    segments[position] = "#";
    return `[${segments.join("")}] --%`;
  }

  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * PROGRESS_BAR_WIDTH);
  const empty = Math.max(PROGRESS_BAR_WIDTH - filled, 0);
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${(ratio * 100).toFixed(1)}%`;
}

function formatByteProgress(current, total) {
  const currentText = formatBytes(current);
  if (total && Number.isFinite(total) && total > 0) {
    return `${currentText} / ${formatBytes(total)}`;
  }
  return `${currentText}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;

  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }

  const precision = value >= 10 || idx === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

function truncateLabel(text, max = 40) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
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
