import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./parse-coordinates";

const GALDHOPIGGEN = { lat: 61.6363, lon: 8.3125 };

function expectNear(q: string, expected: { lat: number; lon: number }) {
  const r = parseCoordinates(q);
  expect(r, q).not.toBeNull();
  expect(r!.lat).toBeCloseTo(expected.lat, 4);
  expect(r!.lon).toBeCloseTo(expected.lon, 4);
}

describe("parseCoordinates", () => {
  it.each([
    "61.6363, 8.3125",
    "61.6363,8.3125",
    "61.6363 8.3125",
    "  61.6363, 8.3125\n",
    "61,6363 8,3125",
    "61,6363, 8,3125",
    "61.6363; 8.3125",
    "8.3125, 61.6363",
  ])("decimal degrees: %j", (q) => expectNear(q, GALDHOPIGGEN));

  it.each([
    "61.6363° N, 8.3125° E",
    "61.6363°N 8.3125°E",
    "N 61.6363 E 8.3125",
    "61.6363N, 8.3125Ø",
    "8.3125° E, 61.6363° N",
    "61.6363º N, 8.3125º E",
  ])("degrees with hemisphere letters: %j", (q) => expectNear(q, GALDHOPIGGEN));

  it("degrees, minutes, seconds (Google Maps desktop)", () => {
    expectNear(`61°38'10.7"N 8°18'45.0"E`, { lat: 61 + 38 / 60 + 10.7 / 3600, lon: 8 + 18 / 60 + 45 / 3600 });
    expectNear(`61°38′10.7″N 8°18′45.0″E`, { lat: 61 + 38 / 60 + 10.7 / 3600, lon: 8 + 18 / 60 + 45 / 3600 });
  });

  it("degrees and decimal minutes (Garmin)", () => {
    expectNear(`N 61°38.178' E 8°18.750'`, { lat: 61 + 38.178 / 60, lon: 8 + 18.75 / 60 });
  });

  it("Svalbard is inside the box", () => {
    expectNear("78.2232, 15.6267", { lat: 78.2232, lon: 15.6267 });
  });

  it.each([
    "",
    "Storgata 12",
    "0150 Oslo",
    "61 8",
    "61.6363 8",
    "61.6363, 8.3125, 5",
    "12.5, 4.5",
    "40.7128, -74.0060",
    "61.6363° S, 8.3125° E",
    "61.6363° N, 8.3125° N",
    `61°75'00"N 8°18'45"E`,
    "Storgata 5, Oslo61.6363, 8.3125",
  ])("rejects %j", (q) => {
    expect(parseCoordinates(q)).toBeNull();
  });
});
