// Generates a 3-sentence human-readable snapshot for each kommune, baked
// into kommune-profiles.json at build time. The sentences lead with the
// identity anchor (fylke + population rank) and then pick the two most
// distinctive categories for that kommune. Templates are deliberately
// factual — they state what the data says, never interpret.

const nb = new Intl.NumberFormat("nb-NO");

function fmtNumber(n) {
  return nb.format(Math.round(n));
}

function fmtPct(n, decimals = 1) {
  return `${n.toFixed(decimals).replace(".", ",")} %`;
}

// Relative distance from the median rank, normalized to 0..1. Rank 1 in a
// 357-list scores 1.0; a rank in the middle scores ~0.
function rankExtremity(rank, total) {
  if (!rank || !total || total < 2) return 0;
  const mid = (total + 1) / 2;
  return Math.min(1, Math.abs(rank - mid) / (mid - 1));
}

// ─── Category candidates ──────────────────────────────────────
//
// Each candidate has a theme (used for diversity throttling) and a score
// (0..1, where 1 is a notable outlier). The `render` callback returns the
// sentence string — it runs only if the candidate is picked.

function candidates(profile, totals) {
  const cats = [];
  const ranks = profile.ranks;

  // Income — slight downweight, since users rarely act on median income
  // directly; keep it as a tiebreaker for truly extreme kommuner.
  if (ranks.income && totals.incomeTotal) {
    cats.push({
      theme: "economy",
      key: "income",
      score: rankExtremity(ranks.income, totals.incomeTotal) * 0.8,
      render: () => {
        const r = ranks.income;
        const t = totals.incomeTotal;
        if (r <= 30) return `Medianinntekten er blant landets høyeste, #${r} av ${t}.`;
        if (r <= 80) return `Medianinntekten ligger over landsgjennomsnittet, #${r} av ${t}.`;
        if (r >= t - 30) return `Medianinntekten ligger i nedre sjikt nasjonalt, #${r} av ${t}.`;
        if (r >= t - 100) return `Medianinntekten ligger under landsgjennomsnittet, #${r} av ${t}.`;
        return `Medianinntekten plasserer kommunen på #${r} av ${t}.`;
      },
    });
  }

  // Bolig — prefer enebolig (01) since it's the most relatable price
  // for most readers; fall back to småhus (02) or blokk (03) for urban
  // kommuner where enebolig sales may be sparse or missing.
  const boligPrice =
    profile.bolig?.["01"]?.price ??
    profile.bolig?.["02"]?.price ??
    profile.bolig?.["03"]?.price ??
    null;
  const boligLabel = profile.bolig?.["01"]
    ? "enebolig"
    : profile.bolig?.["02"]
      ? "småhus"
      : "blokkleilighet";
  if (boligPrice && ranks.boligEnebolig && totals.eneboligTotal) {
    cats.push({
      theme: "economy",
      key: "bolig",
      score: rankExtremity(ranks.boligEnebolig, totals.eneboligTotal),
      render: () => {
        const r = ranks.boligEnebolig;
        const t = totals.eneboligTotal;
        const priceFmt = fmtNumber(boligPrice);
        if (r <= 30)
          return `Boligprisene ligger høyt i nasjonal sammenheng — en ${boligLabel} koster rundt ${priceFmt} kr/m² (#${r} av ${t}).`;
        if (r <= 60)
          return `Boligprisene ligger over landsgjennomsnittet med rundt ${priceFmt} kr/m² for ${boligLabel} (#${r} av ${t}).`;
        if (r >= t - 30)
          return `Boligene er rimelige i nasjonal sammenheng, rundt ${priceFmt} kr/m² for ${boligLabel} (#${r} av ${t}).`;
        if (r >= t - 60)
          return `Boligene er rimeligere enn landsgjennomsnittet, rundt ${priceFmt} kr/m² for ${boligLabel} (#${r} av ${t}).`;
        return `En ${boligLabel} koster rundt ${priceFmt} kr/m² (#${r} av ${t}).`;
      },
    });
  }

  // Vern — only push as a candidate when genuinely notable in either
  // direction. Mid-range vern (1–15 %) is too typical to earn a sentence;
  // let the fallback category take the slot instead.
  if (profile.vernePct != null && ranks.verne && totals.verneTotal) {
    const pct = profile.vernePct;
    const isHigh = pct > 15 || ranks.verne <= 40;
    const isLow = pct < 0.3 && ranks.verne >= totals.verneTotal - 20;
    if (isHigh || isLow) {
      let score = rankExtremity(ranks.verne, totals.verneTotal);
      if (pct > 40) score += 0.3;
      cats.push({
        theme: "nature",
        key: "vern",
        score,
        render: () => {
          if (isHigh)
            return `${fmtPct(pct)} av arealet er vernet natur, blant de høyeste andelene i landet.`;
          return `Bare ${fmtPct(pct)} av arealet er vernet natur — blant de laveste andelene i landet.`;
        },
      });
    }
  }

  // Energi — a fun fact for the truly exceptional producers only. Most
  // readers don't make life decisions on installert effekt, so the gate
  // is tight: must rank top 40 in the country AND have a meaningful
  // footprint. Score is also scaled down so school/health/nature
  // sentences win ties against mid-pack energy kommuner.
  if (
    profile.energy.totalMW > 50 &&
    profile.energy.plantCount >= 3 &&
    ranks.energy &&
    ranks.energy <= 40 &&
    totals.energyTotal
  ) {
    const mw = profile.energy.totalMW;
    const n = profile.energy.plantCount;
    cats.push({
      theme: "energy",
      key: "energy",
      score: rankExtremity(ranks.energy, totals.energyTotal) * 0.6,
      render: () => {
        const r = ranks.energy;
        if (r <= 20)
          return `Kommunen produserer ${fmtNumber(mw)} MW strøm fra ${n} kraftverk — blant de største kraftkommunene i landet.`;
        return `Kommunen har ${n} kraftverk med til sammen ${fmtNumber(mw)} MW installert effekt.`;
      },
    });
  }

  // Skoler + barnehager — almost always relevant to readers considering
  // a move. Flat baseline score so it wins against neutral economy
  // candidates, with a boost when the kommune has its own videregående
  // (an actual quality-of-life differentiator: teens don't need to
  // commute to a neighbouring kommune).
  if (profile.schools.total > 0 || profile.kindergartens.total > 0) {
    const grunn = profile.schools.grunnskoleCount;
    const vgs = profile.schools.vgsCount;
    const bh = profile.kindergartens.total;
    cats.push({
      theme: "services",
      key: "skoler",
      score: vgs > 0 ? 0.72 : 0.55,
      render: () => {
        if (vgs > 0 && grunn > 0) {
          const vgsText =
            vgs === 1 ? "én videregående skole" : `${vgs} videregående skoler`;
          return `Skoletilbudet dekker ${grunn} grunnskoler, ${bh} barnehager og ${vgsText}.`;
        }
        if (grunn > 0 && vgs === 0)
          return `Kommunen har ${grunn} grunnskoler og ${bh} barnehager, men ingen egen videregående skole.`;
        if (grunn === 0 && bh > 0)
          return `Kommunen har ${bh} barnehager, men ingen egen grunnskole.`;
        return `Kommunen har ${grunn} grunnskoler og ${bh} barnehager.`;
      },
    });
  }

  // Sykehus + legevakt — OSM-sourced, so we only make POSITIVE claims
  // (has sykehus / has legevakt). Never say "has no sykehus" because
  // OSM can be incomplete. When both exist, one sentence covers both.
  const sykehus = profile.health?.osm?.sykehusCount || 0;
  const legevakt = profile.health?.osm?.legevaktCount || 0;
  if (sykehus > 0 || legevakt > 0) {
    cats.push({
      theme: "health",
      key: "sykehus",
      score: sykehus > 0 ? 0.8 : 0.55,
      render: () => {
        if (sykehus > 0 && legevakt > 0) {
          if (sykehus === 1)
            return `Kommunen har sykehus og legevakt innenfor egne grenser.`;
          return `Kommunen har ${sykehus} sykehus og legevakt innenfor egne grenser.`;
        }
        if (sykehus > 0) {
          const s = sykehus === 1 ? "et sykehus" : `${sykehus} sykehus`;
          return `Kommunen har ${s} innenfor egne grenser.`;
        }
        return `Kommunen har legevakt innenfor egne grenser.`;
      },
    });
  }

  // Eiendomsskatt absence — a genuinely distinctive positive signal for
  // the ~100 kommuner that don't levy property tax on homes. Concrete,
  // actionable, and something readers frequently care about.
  if (profile.cost?.eiendomsskatt && profile.cost.eiendomsskatt.has === false) {
    cats.push({
      theme: "economy",
      key: "eiendomsskatt_none",
      score: 0.65,
      render: () => `Kommunen har ingen eiendomsskatt på boliger.`,
    });
  }

  // Hytter — only if there are enough to be notable
  if (profile.cabins.total >= 50) {
    cats.push({
      theme: "nature",
      key: "hytter",
      score: Math.min(1, profile.cabins.total / 300),
      render: () => {
        const n = profile.cabins.total;
        if (n > 200)
          return `Turistbebyggelsen er omfattende: ${fmtNumber(n)} registrerte hytter og turistanlegg.`;
        return `Kommunen har ${fmtNumber(n)} registrerte hytter og turistanlegg.`;
      },
    });
  }

  // Fastlege — only notable when the delta from "exactly balanced" (100)
  // is large enough to be worth reading. A ±0 % ledig kapasitet reads as
  // noise even though SSB reports it to several decimals.
  const reskap = profile.health?.latest?.KOSreservekapasi0000;
  const utenLege = profile.health?.latest?.KOSandelpasiente0000;
  if (reskap != null && ranks.reservekapasitet && totals.reservekapasitetTotal) {
    const delta = reskap - 100;
    if (Math.abs(delta) >= 4) {
      const extremity = rankExtremity(
        ranks.reservekapasitet,
        totals.reservekapasitetTotal
      );
      const score = Math.abs(delta) > 10 ? extremity + 0.2 : extremity;
      cats.push({
        theme: "health",
        key: "fastlege",
        score,
        render: () => {
          const signed = delta >= 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;
          if (delta < -3 && utenLege != null && utenLege > 2)
            return `Fastlegetilbudet er under press — ${fmtPct(utenLege)} står uten fastlege og ledig kapasitet er ${signed} %.`;
          if (delta > 8)
            return `Fastlegetilbudet har romslig kapasitet — ${signed} % ledig margin på listene.`;
          return `Fastlegetilbudet har ${signed} % ledig kapasitet på listene.`;
        },
      });
    }
  }

  // Kommunale gebyrer
  const gebyrTotal = profile.cost?.gebyrer?.total;
  if (gebyrTotal && ranks.gebyrTotal && totals.gebyrTotalTotal) {
    cats.push({
      theme: "economy",
      key: "gebyr",
      score: rankExtremity(ranks.gebyrTotal, totals.gebyrTotalTotal),
      render: () => {
        const r = ranks.gebyrTotal;
        const t = totals.gebyrTotalTotal;
        const kr = fmtNumber(gebyrTotal);
        if (r <= 30)
          return `Kommunale gebyrer er blant landets laveste, rundt ${kr} kr i året for en standard husholdning.`;
        if (r >= t - 30)
          return `Kommunale gebyrer ligger i øvre sjikt, rundt ${kr} kr i året for en standard husholdning.`;
        return `Kommunale gebyrer summerer seg til rundt ${kr} kr i året for en standard husholdning.`;
      },
    });
  }

  // Demografi candidates — SSB-sourced household/education/dwelling
  // stats. Split into two themes: "boforhold" groups eierstatus and
  // dwelling-type (both describe how people live), "utdanning" stands
  // alone so a city can surface both a high-education sentence and an
  // urban-blokk sentence in the same snapshot.
  const dem = profile.demografi;

  // Eierstatus — combined selveier + andelseier is the "owns their home"
  // share. Only notable at the extremes: the national average is ~76%,
  // so kommuner above 85 or below 62 stand out.
  if (dem?.eierstatus) {
    const { selveier, andelseier, leier } = dem.eierstatus;
    const eierTotal = selveier + andelseier;
    const eierPct = Math.round(eierTotal);
    const leierPct = Math.round(leier);
    if (eierTotal >= 85) {
      cats.push({
        theme: "boforhold",
        key: "eierstatus_high",
        score: 0.68,
        render: () =>
          `${eierPct} % eier boligen de bor i — høyt i nasjonal sammenheng.`,
      });
    } else if (eierTotal <= 70) {
      cats.push({
        theme: "boforhold",
        key: "eierstatus_low",
        score: 0.7,
        render: () =>
          `${leierPct} % leier boligen de bor i — en betydelig leiemarkedsandel.`,
      });
    }
  }

  // Boligtyper — enebolig share captures "suburb vs urban" better than
  // any other single number. Tightened thresholds so the sentence only
  // surfaces for genuinely distinctive extremes, not the 56% of rural
  // kommuner that sit above 68%.
  if (dem?.boliger) {
    const enebolig = dem.boliger.enebolig;
    const blokk = dem.boliger.blokk;
    const eneboligPct = Math.round(enebolig);
    const blokkPct = Math.round(blokk);
    if (enebolig >= 82) {
      cats.push({
        theme: "boforhold",
        key: "enebolig_dominant",
        score: 0.73,
        render: () =>
          `${eneboligPct} % av boligene er eneboliger — klart preg av småhusbebyggelse.`,
      });
    } else if (blokk >= 35 && enebolig <= 30) {
      cats.push({
        theme: "boforhold",
        key: "blokk_dominant",
        score: 0.75,
        render: () =>
          `${blokkPct} % av boligene ligger i blokk — et tydelig urbant preg.`,
      });
    }
  }

  // Utdanning — kort + lang UH + fagskole as "høyere utdanning".
  // National average ~38%; surface outliers in both directions.
  if (dem?.utdanning) {
    const hoyere =
      dem.utdanning.hoyereKort +
      dem.utdanning.hoyereLang +
      dem.utdanning.fagskole;
    const hoyerePct = Math.round(hoyere);
    if (hoyere >= 48) {
      cats.push({
        theme: "utdanning",
        key: "utdanning_high",
        score: 0.75,
        render: () =>
          `${hoyerePct} % av de voksne har høyere utdanning — høyt utdanningsnivå.`,
      });
    } else if (hoyere <= 28) {
      cats.push({
        theme: "utdanning",
        key: "utdanning_low",
        score: 0.62,
        render: () =>
          `${hoyerePct} % har høyere utdanning, under landsgjennomsnittet.`,
      });
    }
  }

  // Geografisk filler — always available at low baseline score. This
  // surfaces as a 3rd-slot fallback for kommuner without a lot of
  // distinctive data, giving the reader genuinely new information
  // (area + density) that isn't already in the hero. Score is low
  // enough that any notable candidate will beat it.
  if (profile.area && profile.population) {
    const density = profile.population / profile.area;
    cats.push({
      theme: "geography",
      key: "size",
      score: 0.32,
      render: () => {
        const areaStr = fmtNumber(profile.area);
        const densityStr = density >= 10
          ? fmtNumber(density)
          : density.toFixed(1).replace(".", ",");
        if (profile.area < 100)
          return `En arealmessig kompakt kommune på ${areaStr} km², med ${densityStr} innbyggere per km².`;
        if (profile.area > 2000)
          return `Kommunen strekker seg over ${areaStr} km² med bare ${densityStr} innbyggere per km² — store åpne områder.`;
        return `Kommunen dekker ${areaStr} km² med ${densityStr} innbyggere per km² i snitt.`;
      },
    });
  }

  return cats;
}

// Pick the N highest-scoring candidates, preferring distinct themes on
// the first pass and filling remaining slots ignoring theme on a
// second pass — so we can still fill all slots even if a kommune only
// has candidates in 1-2 themes.
function pickTopN(cats, n) {
  const sorted = [...cats].sort((a, b) => b.score - a.score);
  const picked = [];
  const themes = new Set();

  for (const cat of sorted) {
    if (themes.has(cat.theme)) continue;
    picked.push(cat);
    themes.add(cat.theme);
    if (picked.length === n) return picked;
  }
  for (const cat of sorted) {
    if (picked.includes(cat)) continue;
    picked.push(cat);
    if (picked.length === n) return picked;
  }
  return picked;
}

// ─── Public entry point ───────────────────────────────────────

export function generateSnapshot(profile, totals) {
  const picks = pickTopN(candidates(profile, totals), 3);
  const sentences = picks.map((p) => p.render());

  // Hard backstop — should never fire since the geography filler is
  // always pushable, but guards against a data-less edge case.
  if (sentences.length === 0) {
    const areaStr = fmtNumber(profile.area);
    sentences.push(`Kommunen dekker ${areaStr} km².`);
  }

  return sentences;
}
