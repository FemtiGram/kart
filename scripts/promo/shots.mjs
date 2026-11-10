/**
 * The promo's plates: one scripted take per shot, filmed from the running site by `record.mjs`.
 * Each drives the real UI (real clicks, real data); nothing here draws pixels of its own.
 */
import { FPS } from "./edit.mjs";

/** Hold matching requests until released, so a result lands on the frame the edit wants. */
async function gate(page, pattern) {
  let open;
  const opened = new Promise((r) => (open = r));
  await page.route(pattern, async (route) => {
    await opened;
    await route.continue();
  });
  return open;
}

const idle = (page) => page.waitForLoadState("networkidle").catch(() => {});

/**
 * A speed ramp that plays `siteSeconds` of the page's time in `seconds` of video: slow at both ends
 * (so the first and last years can be read), fast through the middle. The average of
 * 0.3 + k·sin(πx) over 0–1 is 1 when k = 0.7·π/2.
 */
const ramp = (siteSeconds, seconds) => {
  const k = (0.7 * Math.PI) / 2;
  return (x) => (siteSeconds / seconds) * (0.3 + k * Math.sin(Math.PI * x));
};

/** A map as it looks once loaded, held for a moment: material for a one-beat flash. */
const still = (name, path) => ({
  name,
  async run(t) {
    await t.open(path, { ready: ".leaflet-container" });
    await t.wait(2500);
    await idle(t.page);
    await t.film(0.8);
  },
});

/** A timeline: open it, press play, run it on a ramp, hold the last year. */
const timeline = (name, path, siteSeconds) => ({
  name,
  async run(t) {
    const { page } = t;
    await t.open(path, { ready: 'button:has-text("Tidslinje")' });
    await t.wait(1500);
    await t.film(0.3);
    await t.tap(page.getByRole("button", { name: "Tidslinje" }));
    await page.waitForSelector('button[aria-label="Spill av"]', { timeout: 30_000 });
    await t.film(1.3); // the panel opens and the map frames Norway
    t.mark("play");
    await t.tap(page.getByRole("button", { name: "Spill av" }));
    await t.film(2.8, { speed: ramp(siteSeconds, 2.8) });
    t.mark("done");
    await t.film(1.5);
  },
});

export const SHOTS = [
  {
    // The site's top page: press "Hvor høyt over havet er jeg?" standing on Kjeragbolten.
    name: "hoyde",
    geolocation: { latitude: 59.03361, longitude: 6.59306 },
    async run(t) {
      const { page } = t;
      await t.open("/map", { ready: "text=Hvor høyt over havet er jeg?" });
      // Kartverket's own map rather than the OpenTopoMap default: sharper at the zoom we land on.
      await page.getByRole("button", { name: "Kart", exact: true }).click();
      await t.wait(1500);
      const showHeight = await gate(page, "**/hoydedata/**");
      const showName = await gate(page, "**/stedsnavn/**");
      const showWeather = await gate(page, "**/api/weather**");

      await t.film(1);
      t.mark("tap");
      await t.tap(page.getByRole("button", { name: "Hvor høyt over havet er jeg?" }));
      await t.film(38 / FPS); // the flight in takes 1.2 s
      showName();
      showHeight();
      await page.waitForSelector("text=moh.", { timeout: 20_000 });
      await idle(page);
      t.mark("height");
      await t.film(16 / FPS);
      t.mark("weather");
      showWeather();
      await idle(page);
      await t.film(2.5);
    },
  },
  // /energikart "Tidslinje": every hydro and wind plant by its first year in operation. 1900 → today
  // takes 21 s on the site (6 years a second).
  timeline("energi", "/energikart", 21.5),
  // /valg "Tidslinje": the largest party in every kommune, 21 Stortingsvalg at 1.3 s each.
  timeline("valg", "/valg", 27.5),
  still("lading", "/lading?lat=59.91&lon=10.75&z=11"),
  still("vern", "/vern"),
  still("skoler", "/skoler?lat=60.39&lon=5.32&z=12"),
  still("lonn", "/lonn"),
  still("hytter", "/hytter"),
  still("bolig", "/bolig"),
];
