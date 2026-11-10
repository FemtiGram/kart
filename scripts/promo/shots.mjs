/**
 * The promo's plates: one scripted take per shot, filmed from the running site by `record.mjs`.
 * Each drives the real UI (real clicks, real data); nothing here draws pixels of its own.
 */

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

      await t.film(1.2);
      t.mark("tap");
      await t.tap(page.getByRole("button", { name: "Hvor høyt over havet er jeg?" }));
      await t.film(1.5); // the flight in (1.2 s) and a breath
      showName();
      await idle(page);
      await t.film(0.3);
      t.mark("height");
      showHeight();
      await page.waitForSelector("text=moh.", { timeout: 20_000 });
      await t.film(0.9);
      t.mark("weather");
      showWeather();
      await idle(page);
      await t.film(3.2);
    },
  },
  {
    // /energikart "Tidslinje": every hydro and wind plant by its first year in operation.
    name: "energi",
    async run(t) {
      const { page } = t;
      await t.open("/energikart", { ready: 'button:has-text("Tidslinje")' });
      await t.wait(1500);
      await t.film(0.5);
      await t.tap(page.getByRole("button", { name: "Tidslinje" }));
      await t.film(1.3); // the panel opens and the map frames Norway
      t.mark("play");
      await t.tap(page.getByRole("button", { name: "Spill av" }));
      // 1900 → today takes 21 s on the site; five times faster here.
      await t.film(4.4, { speed: 5 });
      t.mark("done");
      await t.film(1);
    },
  },
  {
    // /valg "Tidslinje": the largest party in every kommune, 21 Stortingsvalg.
    name: "valg",
    async run(t) {
      const { page } = t;
      await t.open("/valg", { ready: 'button:has-text("Tidslinje")' });
      await t.wait(1500);
      await t.film(0.5);
      await t.tap(page.getByRole("button", { name: "Tidslinje" }));
      await page.waitForSelector('button[aria-label="Spill av"]', { timeout: 30_000 });
      await t.film(1.3);
      t.mark("play");
      await t.tap(page.getByRole("button", { name: "Spill av" }));
      // 21 elections at 1.3 s each on the site; six times faster here.
      await t.film(4.7, { speed: 6 });
      t.mark("done");
      await t.film(1);
    },
  },
  {
    // A Stedsprofil, scrolled from the top: one page per kommune.
    name: "kommune",
    async run(t) {
      const { page } = t;
      await t.open("/kommune/4601-bergen", { ready: "h1" });
      await t.film(0.6);
      const seconds = 4;
      const distance = 1500;
      await t.film(seconds, {
        // Ease in and out of a steady scroll.
        onFrame: (i, n) => {
          const x = (i + 1) / n;
          const eased = x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
          return page.evaluate((y) => window.scrollTo(0, y), Math.round(eased * distance));
        },
      });
      await t.film(0.4);
    },
  },
];
