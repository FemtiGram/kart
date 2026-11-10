/**
 * The promo's edit: every shot and caption on one beat grid. Shared by the driver (`index.mjs`) and
 * the compositor page (`comp.html`). Pure data, no DOM.
 *
 * 120 BPM at 30 fps is exactly 15 frames a beat, so every cut and caption lands on a whole frame and
 * a track at that tempo can be laid under the film later. `at(beat)` is a frame.
 */
export const FPS = 30;
export const BEAT = 15;
/**
 * The picture. The site is filmed as a 1280×680 desktop page and drawn 1.5× so its text reads in a
 * feed; its navbar sits hidden behind the caption band, so the band reads as the header.
 * PROMO_SCALE=2 renders the same film at 3840×2160 (plates are filmed again at that density).
 */
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Height of the caption band above the footage (px). */
export const BAND = 144;
/** The filmed page (CSS px) and its navbar height. (HEIGHT - BAND) / (PAGE.height - NAVBAR) = WIDTH / PAGE.width. */
export const PAGE = { width: 1280, height: 680 };
export const NAVBAR = 56;
export const at = (beat) => Math.round(beat * BEAT);

/**
 * Shots in order. A shot runs from `at` until the next one starts.
 *   plate    a take from shots.mjs (or none: the end card)
 *   from     plate frame to start on, or { mark, offset } for a moment the recorder named
 *   captions [{ at (beats into the shot), text, sub? }]: the band's headline; the last one holds
 */
export const SHOTS = [
  {
    id: "hoyde",
    at: at(0),
    plate: "hoyde",
    from: { mark: "tap", offset: -24 },
    captions: [
      { at: 0, text: "Hvor høyt over havet er du?" },
      { at: 6, text: "Høyde og vær, der du står.", sub: "Ett trykk. Hvor som helst i Norge." },
    ],
  },
  {
    id: "energi",
    at: at(14),
    plate: "energi",
    from: { mark: "play", offset: -20 },
    captions: [{ at: 0, text: "Kraft fra 1900 til i dag.", sub: "Hvert vann- og vindkraftverk, år for år." }],
  },
  {
    id: "valg",
    at: at(24),
    plate: "valg",
    from: { mark: "play", offset: -8 },
    captions: [{ at: 0, text: "Stortingsvalg 1945–2025.", sub: "Største parti i hver kommune." }],
  },
  {
    id: "kommune",
    at: at(34),
    plate: "kommune",
    from: 12,
    captions: [{ at: 0, text: "Én side for hver kommune.", sub: "Bolig, skole, helse, energi og mer." }],
  },
  {
    id: "slutt",
    at: at(42),
    end: true,
    captions: [{ at: 0, text: "Hvor høyt er du?", sub: "Åpne norske data på kart." }],
  },
];

export const END = at(48);
