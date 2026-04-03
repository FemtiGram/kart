// Norwegian counties with approximate center coordinates
// Updated 2024 after regional reform
export const FYLKER = [
  { fylkesnummer: "03", fylkesnavn: "Oslo", lat: 59.91, lon: 10.75, zoom: 11 },
  { fylkesnummer: "11", fylkesnavn: "Rogaland", lat: 59.0, lon: 6.0, zoom: 8 },
  { fylkesnummer: "15", fylkesnavn: "Møre og Romsdal", lat: 62.5, lon: 7.2, zoom: 8 },
  { fylkesnummer: "18", fylkesnavn: "Nordland", lat: 67.0, lon: 14.5, zoom: 7 },
  { fylkesnummer: "31", fylkesnavn: "Østfold", lat: 59.35, lon: 11.2, zoom: 9 },
  { fylkesnummer: "32", fylkesnavn: "Akershus", lat: 59.95, lon: 11.2, zoom: 9 },
  { fylkesnummer: "33", fylkesnavn: "Buskerud", lat: 60.1, lon: 9.5, zoom: 8 },
  { fylkesnummer: "34", fylkesnavn: "Innlandet", lat: 61.5, lon: 10.5, zoom: 7 },
  { fylkesnummer: "39", fylkesnavn: "Vestfold", lat: 59.25, lon: 10.2, zoom: 9 },
  { fylkesnummer: "40", fylkesnavn: "Telemark", lat: 59.4, lon: 8.5, zoom: 8 },
  { fylkesnummer: "42", fylkesnavn: "Agder", lat: 58.5, lon: 7.5, zoom: 8 },
  { fylkesnummer: "46", fylkesnavn: "Vestland", lat: 60.8, lon: 6.0, zoom: 8 },
  { fylkesnummer: "50", fylkesnavn: "Trøndelag", lat: 63.8, lon: 12.0, zoom: 7 },
  { fylkesnummer: "55", fylkesnavn: "Troms", lat: 69.2, lon: 18.5, zoom: 8 },
  { fylkesnummer: "56", fylkesnavn: "Finnmark", lat: 70.3, lon: 25.5, zoom: 7 },
] as const;

// Norway bounding box (mainland + some margin)
export function isInNorway(lat: number, lon: number): boolean {
  return lat >= 57.5 && lat <= 71.5 && lon >= 4.0 && lon <= 31.5;
}

// Default fallback position (Oslo)
export const OSLO = { lat: 59.91, lon: 10.75, zoom: 12 } as const;
