/**
 * Films plates from the real site for the promo video, frame by frame on a fake clock.
 *
 * Nothing is recorded as it plays: headless Chromium and map tiles are far too uneven for that. The
 * page's clock is faked and paused (Playwright's clock: timers, requestAnimationFrame, Date,
 * performance.now), every CSS animation and transition is paused and stepped by hand, and each video
 * frame moves time on by exactly 1/30 s, waits for the map tiles that step asked for, and takes a
 * screenshot. The footage is smooth however slow the machine or the tile server is.
 *
 * A shot is a script (`shots.mjs`) that gets a `take` with:
 *   page            the Playwright page (click, evaluate, route…)
 *   film(seconds, { speed, onFrame })   record that much video; `speed` runs the page's time
 *                   faster, `onFrame(i, n)` runs before each frame (scripted scrolling)
 *   tap(locator)    click an element and leave a mark so the compositor can draw the tap
 *   mark(name)      name the current frame so the edit can cut on it
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LEAFLET_IMAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../node_modules/leaflet/dist/images");

import { FPS, PAGE, WIDTH } from "./edit.mjs";

const VIEWPORT = PAGE;
/** Fixed "now" so date-dependent UI films the same every time (clear of midnight in any zone). */
const NOW = "2026-11-10T11:00:00Z";
const FRAME_MS = 1000 / FPS;

/** Runs in the page before every frame is captured: step CSS animations and report unloaded tiles. */
function stepAnimations(ms) {
  const seen = (window.__promoSeen ??= new WeakSet());
  for (const a of document.getAnimations()) {
    try {
      if (!seen.has(a)) {
        // New since the last frame: it has run on the real clock for a moment. Rewind and hold it.
        seen.add(a);
        a.pause();
        a.currentTime = 0;
      }
      const end = a.effect?.getComputedTiming().endTime ?? Infinity;
      const next = Number(a.currentTime ?? 0) + ms;
      if (next >= Number(end)) a.finish();
      else a.currentTime = next;
    } catch {
      // An animation that went away between the query and the step.
    }
  }
}

const pendingTiles = () =>
  [...document.querySelectorAll(".leaflet-tile-container img.leaflet-tile")].filter(
    (img) => !img.classList.contains("leaflet-tile-loaded"),
  ).length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hide what only exists in development or would date the footage. */
const HIDE_CSS = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
  ::-webkit-scrollbar { display: none; }
`;

/**
 * Films one shot into `${dir}/${shot.name}/`: numbered JPEGs plus plate.json (frame count, marks,
 * taps in viewport fractions).
 */
export async function filmShot(browser, baseUrl, shot, dir, density = 1) {
  const out = `${dir}/${shot.name}`;
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: (WIDTH / PAGE.width) * density,
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    hasTouch: false,
    ...(shot.geolocation ? { geolocation: shot.geolocation, permissions: ["geolocation"] } : {}),
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((css) => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.documentElement.appendChild(s);
    };
    if (document.documentElement) add();
    else document.addEventListener("DOMContentLoaded", add);
  }, HIDE_CSS);
  // Leaflet's default marker images come from unpkg at runtime; serve the same files from the
  // installed package so a take never depends on (or waits for) a CDN.
  await page.route("https://unpkg.com/leaflet@*/dist/images/*", async (route) => {
    try {
      const body = await readFile(path.join(LEAFLET_IMAGES, path.basename(new URL(route.request().url()).pathname)));
      await route.fulfill({ body, contentType: "image/png" });
    } catch {
      await route.continue();
    }
  });
  const cdp = await context.newCDPSession(page);

  let frames = 0;
  let paused = false;
  /** Frames that gave up waiting for a tile (a failed or very slow request). */
  let slow = 0;
  const marks = {};
  const taps = [];

  const settle = async () => {
    // React commits on a MessageChannel (real time), fetches resolve in real time: give both a beat.
    await page.evaluate(() => new Promise((r) => queueMicrotask(r)));
    const deadline = Date.now() + 2500;
    while ((await page.evaluate(pendingTiles)) > 0 && Date.now() < deadline) await sleep(40);
    if (Date.now() >= deadline) slow++;
  };

  const take = {
    page,
    baseUrl,
    get frame() {
      return frames;
    },
    mark(name) {
      marks[name] = frames;
    },
    /** Open a path and wait for the page (and its first tiles) with the clock still running. */
    async open(path, { ready } = {}) {
      await page.goto(baseUrl + path, { waitUntil: "networkidle", timeout: 120_000 });
      if (ready) await page.waitForSelector(ready, { timeout: 60_000 });
      // Desktop autofocuses the search field; a focus ring nobody asked for dates the first frames.
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await sleep(500);
      const deadline = Date.now() + 15_000;
      while ((await page.evaluate(pendingTiles)) > 0 && Date.now() < deadline) await sleep(100);
      await sleep(400);
    },
    /** Let the real clock run (page loads, data fetches) outside the film. */
    async wait(ms) {
      if (paused) await page.clock.resume();
      paused = false;
      await sleep(ms);
    },
    async film(seconds, { speed = 1, onFrame } = {}) {
      if (!paused) {
        await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50));
        paused = true;
      }
      const n = Math.round(seconds * FPS);
      for (let i = 0; i < n; i++) {
        if (onFrame) await onFrame(i, n);
        await page.clock.runFor(FRAME_MS * speed);
        await settle();
        await page.evaluate(stepAnimations, FRAME_MS * speed);
        const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 95 });
        await writeFile(`${out}/${String(frames).padStart(5, "0")}.jpg`, Buffer.from(data, "base64"));
        frames++;
      }
    },
    /** Click the middle of an element (a real click, so the app's own handlers run). */
    async tap(locator) {
      const el = typeof locator === "string" ? page.locator(locator).first() : locator;
      const box = await el.boundingBox();
      if (!box) throw new Error(`promo: nothing to tap for ${locator}`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      taps.push({ frame: frames, x: x / VIEWPORT.width, y: y / VIEWPORT.height });
      await page.mouse.click(x, y);
    },
    /** Click a point on the page (viewport pixels). */
    async tapAt(x, y) {
      taps.push({ frame: frames, x: x / VIEWPORT.width, y: y / VIEWPORT.height });
      await page.mouse.click(x, y);
    },
  };

  try {
    await shot.run(take);
  } finally {
    await writeFile(`${out}/plate.json`, JSON.stringify({ frames, height: VIEWPORT.height, marks, taps }, null, 2));
    await context.close();
  }
  return { frames, marks, taps, slow };
}
