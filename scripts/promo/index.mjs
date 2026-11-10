/**
 * The promo video: `npm run promo` → artifacts/promo/ (30 fps, silent)
 *   datakart-promo.mp4       1920×1080
 *   datakart-promo-4x5.mp4   1080×1350, for a phone feed
 *
 *   npm run promo                    # film any missing plates, then composite both formats
 *   npm run promo -- plates [x]      # (re)film the plates whose name contains x
 *   npm run promo -- comp [format]   # composite again from the filmed plates (wide, tall or both)
 *   npm run promo -- sheet [format]  # a contact sheet of a finished video, one picture a beat
 *   npm run promo -- gif [format]    # a small looping GIF of a finished video
 *
 * PROMO_SCALE=2 renders twice the pixels (3840×2160 / 2160×2700, "-2x" in the file name). Vector
 * UI is sharp at that size; the raster basemap is the same 256 px tiles drawn larger.
 *
 * Two stages: plates are filmed from the real site frame by frame (`record.mjs`, `shots.mjs`), then
 * the compositor page (`comp.html`) lays the edit (`edit.mjs`: captions, camera, cuts, cards) over
 * them and ffmpeg encodes the result. The cut sits on a 120 BPM beat grid so music can be added.
 *
 * Needs Playwright with Chromium and ffmpeg on the PATH (neither is a project dependency:
 * `npm i --no-save playwright && npx playwright install chromium`). Films a dev server it starts
 * itself, or the site at PROMO_URL. The filmed pages call Kartverket, Geonorge, MET, NVE, Sodir and
 * SSB, so it needs the network.
 */
import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BEAT, END, FORMATS, FPS, SHOTS as EDIT } from "./edit.mjs";
import { filmShot } from "./record.mjs";
import { SHOTS } from "./shots.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DIR = path.join(ROOT, "artifacts/promo");
const PLATES = path.join(DIR, "plates");
const DENSITY = Number(process.env.PROMO_SCALE ?? 1) === 2 ? 2 : 1;
const PORT = 3217;

const [command = "all", ...args] = process.argv.slice(2);

const outFor = (format, ext = "mp4") =>
  path.join(DIR, `datakart-promo${format === "tall" ? "-4x5" : ""}${DENSITY === 2 ? "-2x" : ""}.${ext}`);
/** The formats a command applies to: the one named, or both. */
function formats(name) {
  if (!name) return Object.keys(FORMATS);
  if (!FORMATS[name]) throw new Error(`promo: unknown format "${name}" (${Object.keys(FORMATS).join(", ")})`);
  return [name];
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const from of [undefined, ...(process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean)]) {
    try {
      return require(from ? require.resolve("playwright", { paths: [from] }) : "playwright");
    } catch {
      // Try the next place.
    }
  }
  throw new Error("promo: Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium");
}

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

function ffmpeg(argv, stdin = "ignore") {
  const ff = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...argv], { stdio: [stdin, "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
  return { ff, done };
}

/** The site to film: PROMO_URL if set, otherwise a dev server of this checkout. */
async function startSite() {
  if (process.env.PROMO_URL) return { url: process.env.PROMO_URL.replace(/\/$/, ""), close: async () => {} };
  const url = `http://localhost:${PORT}`;
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: ROOT, stdio: "ignore", detached: true });
  const close = async () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  };
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(20_000) })).ok) return { url, close };
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await close();
  throw new Error("promo: the dev server did not start");
}

async function readPlates() {
  const out = {};
  for (const name of new Set(EDIT.map((s) => s.plate).filter(Boolean))) {
    try {
      out[name] = JSON.parse(await readFile(path.join(PLATES, name, "plate.json"), "utf8"));
    } catch {
      // Not filmed yet.
    }
  }
  return out;
}

// ---------- Plates ----------

async function filmPlates(filter, onlyMissing) {
  const have = await readPlates();
  const todo = SHOTS.filter((s) => (!filter || s.name.includes(filter)) && !(onlyMissing && have[s.name]?.frames));
  if (!todo.length) return;
  const { chromium } = loadPlaywright();
  const site = await startSite();
  const browser = await chromium.launch();
  try {
    for (const shot of todo) {
      const t0 = Date.now();
      process.stdout.write(`● ${shot.name} `);
      const { frames, slow } = await filmShot(browser, site.url, shot, PLATES);
      console.log(`${frames} frames (${((Date.now() - t0) / 1000).toFixed(0)} s)${slow ? `, ${slow} gave up waiting for a tile` : ""}`);
    }
  } finally {
    await browser.close();
    await site.close();
  }
}

// ---------- Composite ----------

async function composite(format) {
  const plates = await readPlates();
  const missing = EDIT.filter((s) => s.plate && !plates[s.plate]).map((s) => s.plate);
  if (missing.length) throw new Error(`promo: plates not filmed yet: ${[...new Set(missing)].join(", ")}`);
  const { width, height } = FORMATS[format];
  const out = outFor(format);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  await mkdir(DIR, { recursive: true });
  const { ff, done } = ffmpeg(
    [
      ...["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-"],
      ...["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p"],
      ...["-movflags", "+faststart", "-an", out],
    ],
    "pipe",
  );
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: DENSITY });
    page.on("pageerror", (e) => console.error("comp:", e.message));
    await page.goto(pathToFileURL(path.join(HERE, "comp.html")).href);
    await page.evaluate((a) => window.comp.init(a), { plates, platesUrl: pathToFileURL(PLATES).href, format });
    for (let f = 0; f < END; f++) {
      await page.evaluate((n) => window.comp.frame(n), f);
      // Not CDP's Page.captureScreenshot, which ignores the device scale factor (PROMO_SCALE=2).
      const shot = await page.screenshot({ type: "jpeg", quality: 97 });
      if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 60 === 0) process.stdout.write(`\r  ${format}: frame ${f}/${END}`);
    }
    process.stdout.write(`\r  ${format}: ${END} frames, ${(END / FPS).toFixed(1)} s\n`);
  } finally {
    ff.stdin.end();
    await browser.close();
  }
  await done;
  console.log(`→ ${path.relative(ROOT, out)}`);
}

// ---------- Extras ----------

async function sheet(format) {
  const out = outFor(format, "sheet.jpg");
  const n = Math.ceil(END / BEAT);
  const cols = format === "tall" ? 9 : 6;
  await ffmpeg([
    ...["-i", outFor(format), "-vf", `select='not(mod(n\\,${BEAT}))',scale=${format === "tall" ? 300 : 480}:-1,tile=${cols}x${Math.ceil(n / cols)}:padding=6:color=white`],
    ...["-frames:v", "1", "-q:v", "3", out],
  ]).done;
  console.log(`→ ${path.relative(ROOT, out)}`);
}

async function gif(format) {
  const out = outFor(format, "gif");
  const filter = `fps=12,scale=${format === "tall" ? 432 : 640}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  await ffmpeg(["-i", outFor(format), "-filter_complex", filter, "-loop", "0", out]).done;
  console.log(`→ ${path.relative(ROOT, out)}`);
}

if (command === "plates") await filmPlates(args[0], false);
else if (command === "comp") for (const f of formats(args[0])) await composite(f);
else if (command === "sheet") for (const f of formats(args[0])) await sheet(f);
else if (command === "gif") for (const f of formats(args[0])) await gif(f);
else if (command === "all") {
  await filmPlates(undefined, true);
  for (const f of formats()) await composite(f);
} else {
  console.error(`promo: unknown command "${command}" (plates, comp, sheet, gif)`);
  process.exit(1);
}
if (command !== "plates" && !(await exists(outFor(formats(args[0])[0])))) process.exitCode = 1;
