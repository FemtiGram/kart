/**
 * The promo's edit: every shot, caption and camera move on one beat grid. Shared by the driver
 * (`index.mjs`), the recorder and the compositor page (`comp.html`). Pure data, no DOM.
 *
 * 120 BPM at 30 fps is exactly 15 frames a beat, so every cut and caption lands on a whole frame and
 * a track at that tempo can be laid under the film later. `at(beat)` is a frame.
 */
export const FPS = 30;
export const BEAT = 15;
export const at = (beat) => Math.round(beat * BEAT);

/**
 * The footage. The site is filmed as a 1280×680 desktop page and drawn 1.5× so its text reads in a
 * feed: 1920 px wide, 936 px tall once the navbar (hidden behind the caption band) is cut off.
 * Plates are filmed at twice that density, so the camera can push in to 2× and stay sharp.
 */
export const PAGE = { width: 1280, height: 680 };
export const NAVBAR = 56;
export const FOOTAGE = { width: 1920, height: 936 };
export const PLATE_DENSITY = 2;

/**
 * The two pictures cut from the same plates. `wide` shows the whole footage under a caption band;
 * `tall` (for a phone feed) is a 4:5 frame with a taller band, a window onto the footage that the
 * camera pans, and a footer. `zoom` is what a camera zoom of 1 means: the footage filling the stage.
 */
export const FORMATS = {
  wide: { width: 1920, height: 1080, band: 144, stage: 936, footer: 0, zoom: 1 },
  tall: { width: 1080, height: 1350, band: 360, stage: 690, footer: 300, zoom: 690 / 936 },
};

/** The data owners named in the sources beat, in the order they appear. */
export const SOURCES = ["Kartverket", "SSB", "NVE", "MET", "Sokkeldirektoratet"];

/** One beat of a still map: a quick settle from a slight push-in, the name of the map as caption. */
const flash = (plate, text, beat, x = 0.5) => ({
  id: plate,
  at: at(beat),
  plate,
  cut: "hard",
  captions: [{ at: 0, text }],
  cam: [
    { at: 0, zoom: 1.14, x, y: 0.5 },
    { at: 0, zoom: 1.04, x, y: 0.5, over: 0.9 },
  ],
});

/**
 * The tall frame only just holds a timeline's panel (from the left edge) and Norway (to 0.77 of the
 * footage) side by side, which is what sets that format's stage height. It stays put until the
 * punch-in on the final year.
 */
const TIMELINE_TALL = (y) => [
  { at: 0, zoom: 1, x: 0.389, y: 0.5 },
  { at: 6, zoom: 1.9, x: 0.175, y, over: 0.4, drift: 0.012 },
];

/**
 * Shots in order. A shot runs from `at` until the next one starts.
 *   plate     a take from shots.mjs, or `scene` for a card the compositor draws itself
 *   from      plate frame to start on, or { mark, offset } for a moment the recorder named
 *   cut       "hard" for a straight cut; otherwise the shot slides in
 *   captions  [{ at (beats into the shot), text, sub? }]: the band's headline; the last one holds
 *   cam       camera moves: from beat `at`, ease to { zoom, x, y } (the point of the footage to
 *             centre on, as fractions) over `over` beats, then creep in by `drift` per beat
 *   camTall   the same for the tall format, where it needs its own framing
 */
export const SHOTS = [
  {
    // Cold open: already flying in to Kjeragbolten; the height lands at beat 2.3, the weather at 3.3.
    id: "hoyde",
    at: at(0),
    plate: "hoyde",
    from: { mark: "tap", offset: 4 },
    captions: [{ at: 0, text: "Hvor høyt over havet er du?" }],
    cam: [
      { at: 0, zoom: 1, x: 0.5, y: 0.5 },
      { at: 2.25, zoom: 1.65, x: 0.5, y: 0.74, over: 0.5, drift: 0.012 },
    ],
  },
  flash("lading", "Ladestasjoner.", 6),
  flash("vern", "Verneområder.", 7),
  flash("skoler", "Skoler og barnehager.", 8),
  flash("lonn", "Inntekt.", 9),
  flash("hytter", "Turisthytter.", 10),
  flash("bolig", "Boligpriser.", 11, 0.6),
  {
    id: "energi",
    at: at(12),
    plate: "energi",
    from: { mark: "play", offset: -6 },
    captions: [{ at: 0, text: "Kraft fra 1900 til i dag.", sub: "Hvert vann- og vindkraftverk, år for år." }],
    cam: [
      { at: 0, zoom: 1, x: 0.36, y: 0.5 },
      { at: 0.4, zoom: 1.14, x: 0.4, y: 0.62, over: 5.4 },
      { at: 6, zoom: 1.9, x: 0.175, y: 0.84, over: 0.4, drift: 0.012 },
    ],
    camTall: TIMELINE_TALL(0.84),
  },
  {
    id: "valg",
    at: at(19),
    plate: "valg",
    from: { mark: "play", offset: -6 },
    captions: [{ at: 0, text: "Stortingsvalg 1945–2025.", sub: "Største parti i hver kommune." }],
    cam: [
      { at: 0, zoom: 1, x: 0.36, y: 0.5 },
      { at: 0.4, zoom: 1.14, x: 0.4, y: 0.62, over: 5.4 },
      { at: 6, zoom: 1.9, x: 0.175, y: 0.8, over: 0.4, drift: 0.012 },
    ],
    camTall: TIMELINE_TALL(0.8),
  },
  {
    // The data owners, one per half beat.
    id: "kilder",
    at: at(26),
    scene: "kilder",
    captions: [{ at: 0, text: "Åpne data fra" }],
  },
  {
    id: "slutt",
    at: at(30),
    scene: "slutt",
    captions: [{ at: 0, text: "Én designer. Åpne data.", sub: "Norske offentlige data på kart." }],
  },
];

export const END = at(35);
