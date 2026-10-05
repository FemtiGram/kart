import { describe, expect, it, vi } from "vitest";
import { safeFlyTo, safeFlyToBounds } from "./safe-fly";

// Leaflet can't load in the node test environment, so stand in a map that
// mimics its size cache: getSize() returns the cached size, invalidateSize()
// re-reads the container.
function fakeMap(container: { x: number; y: number }, cached = container) {
  let size = cached;
  return {
    invalidateSize: vi.fn(() => { size = container; }),
    getSize: vi.fn(() => ({ ...size })),
    flyTo: vi.fn(),
    setView: vi.fn(),
    flyToBounds: vi.fn(),
    fitBounds: vi.fn(),
  };
}

type TestMap = Parameters<typeof safeFlyTo>[0];

describe("safeFlyTo", () => {
  it("animates when the map has area", () => {
    const map = fakeMap({ x: 1280, y: 574 });
    safeFlyTo(map as unknown as TestMap, 64.353, 7.783, 12, { duration: 1.2 });
    expect(map.flyTo).toHaveBeenCalledWith([64.353, 7.783], 12, { duration: 1.2 });
    expect(map.setView).not.toHaveBeenCalled();
  });

  it("jumps instead of flying on a 0×0 map (hidden webview)", () => {
    const map = fakeMap({ x: 0, y: 0 });
    safeFlyTo(map as unknown as TestMap, 64.353, 7.783, 12, { duration: 1.2 });
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.setView).toHaveBeenCalledWith([64.353, 7.783], 12, { animate: false });
  });

  it("jumps when only one dimension is zero", () => {
    const map = fakeMap({ x: 1280, y: 0 });
    safeFlyTo(map as unknown as TestMap, 60, 10, 10);
    expect(map.setView).toHaveBeenCalled();
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it("re-reads a stale cached size before deciding", () => {
    // Map created while hidden (cached 0×0), container has since been laid out.
    const map = fakeMap({ x: 390, y: 609 }, { x: 0, y: 0 });
    safeFlyTo(map as unknown as TestMap, 60, 10, 10);
    expect(map.invalidateSize.mock.invocationCallOrder[0]).toBeLessThan(map.getSize.mock.invocationCallOrder[0]);
    expect(map.flyTo).toHaveBeenCalledWith([60, 10], 10, undefined);
  });

  it.each([
    [NaN, 10, 10],
    [60, undefined as unknown as number, 10],
    [60, 10, Infinity],
  ])("ignores a non-finite target (%s, %s, z%s)", (lat, lon, zoom) => {
    const map = fakeMap({ x: 1280, y: 574 });
    safeFlyTo(map as unknown as TestMap, lat, lon, zoom);
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.setView).not.toHaveBeenCalled();
  });
});

describe("safeFlyToBounds", () => {
  const bounds: [number, number][] = [[59.91, 10.75], [59.92, 10.76]];

  it("animates when the map has area", () => {
    const map = fakeMap({ x: 1280, y: 574 });
    safeFlyToBounds(map as unknown as TestMap, bounds, { padding: [60, 60], maxZoom: 17, duration: 0.8 });
    expect(map.flyToBounds).toHaveBeenCalledWith(bounds, { padding: [60, 60], maxZoom: 17, duration: 0.8 });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("fits without animating on a 0×0 map", () => {
    const map = fakeMap({ x: 0, y: 0 });
    safeFlyToBounds(map as unknown as TestMap, bounds, { padding: [60, 60], maxZoom: 17, duration: 0.8 });
    expect(map.flyToBounds).not.toHaveBeenCalled();
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, { padding: [60, 60], maxZoom: 17, duration: 0.8, animate: false });
  });
});
