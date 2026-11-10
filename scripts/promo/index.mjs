/**
 * The promo video: `npm run promo` → artifacts/promo/datakart-promo.mp4 (1080×1350, 30 fps, silent).
 *
 *   npm run promo                  # film any missing plates, then composite the video
 *   npm run promo -- plates [x]    # (re)film the plates whose name contains x
 *   npm run promo -- comp          # composite again from the filmed plates
 *   npm run promo -- sheet         # a contact sheet of the finished video, one picture a beat
 *   npm run promo -- gif           # a small looping GIF of the finished video
 *
 * Two stages: plates are filmed from the real site frame by frame (`record.mjs`, `shots.mjs`), then
 * the compositor page (`comp.html`) lays the edit (`edit.mjs`: captions, cuts, end card) over them
 * and ffmpeg encodes the result. The cut sits on a 120 BPM beat grid so music can be added later.
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
import { BEAT, END, FPS, HEIGHT, SHOTS as EDIT, WIDTH } from "./edit.mjs";
import { filmShot } from "./record.mjs";
import { SHOTS } from "./shots.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DIR = path.join(ROOT, "artifacts/promo");
const PLATES = path.join(DIR, "plates");
const OUT = path.join(DIR, "datakart-promo.mp4");
const PORT = 3217;

const [command = "all", ...args] = process.argv.slice(2);

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

async function composite() {
  const plates = await readPlates();
  const missing = EDIT.filter((s) => s.plate && !plates[s.plate]).map((s) => s.plate);
  if (missing.length) throw new Error(`promo: plates not filmed yet: ${[...new Set(missing)].join(", ")}`);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  await mkdir(DIR, { recursive: true });
  const { ff, done } = ffmpeg(
    [
      ...["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-"],
      ...["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p"],
      ...["-movflags", "+faststart", "-an", OUT],
    ],
    "pipe",
  );
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("comp:", e.message));
    await page.goto(pathToFileURL(path.join(HERE, "comp.html")).href);
    await page.evaluate((a) => window.comp.init(a), { plates, platesUrl: pathToFileURL(PLATES).href });
    const cdp = await page.context().newCDPSession(page);
    for (let f = 0; f < END; f++) {
      await page.evaluate((n) => window.comp.frame(n), f);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 97 });
      if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 60 === 0) process.stdout.write(`\r  frame ${f}/${END}`);
    }
    process.stdout.write(`\r  ${END} frames, ${(END / FPS).toFixed(1)} s\n`);
  } finally {
    ff.stdin.end();
    await browser.close();
  }
  await done;
  console.log(`→ ${path.relative(ROOT, OUT)}`);
}

// ---------- Extras ----------

async function sheet() {
  const out = path.join(DIR, "sheet.jpg");
  const n = Math.ceil(END / BEAT);
  const cols = 8;
  await ffmpeg([
    ...["-i", OUT, "-vf", `select='not(mod(n\\,${BEAT}))',scale=270:-1,tile=${cols}x${Math.ceil(n / cols)}:padding=6:color=white`],
    ...["-frames:v", "1", "-q:v", "3", out],
  ]).done;
  console.log(`→ ${path.relative(ROOT, out)}`);
}

async function gif() {
  const out = path.join(DIR, "datakart-promo.gif");
  const filter = "fps=12,scale=432:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
  await ffmpeg(["-i", OUT, "-filter_complex", filter, "-loop", "0", out]).done;
  console.log(`→ ${path.relative(ROOT, out)}`);
}

if (command === "plates") await filmPlates(args[0], false);
else if (command === "comp") await composite();
else if (command === "sheet") await sheet();
else if (command === "gif") await gif();
else if (command === "all") {
  await filmPlates(undefined, true);
  await composite();
} else {
  console.error(`promo: unknown command "${command}" (plates, comp, sheet, gif)`);
  process.exit(1);
}
if (!(await exists(OUT)) && command !== "plates") process.exitCode = 1;
