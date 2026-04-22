// Calculs côté client pour les meilleures performances et la charge.
// Approche prudente : on n'utilise que les moyennes globales d'activités
// dont la durée/distance est compatible avec la cible. Pas de stream-level.

export type Activity = {
  id: string;
  sport_type_normalized: string | null;
  start_date: string | null;
  duration_seconds: number | null;
  moving_time_seconds: number | null;
  distance_meters: number | null;
  avg_heartrate: number | null;
  avg_power: number | null;
  max_power?: number | null;
  avg_speed: number | null;
  elevation_gain_meters: number | null;
  name: string | null;
};

export type BestEffort = {
  label: string;
  value: number | null;
  unit: string;
  formatted: string;
  date: string | null;
  activityName: string | null;
  activityId: string | null;
  insufficient?: boolean;
  reason?: string;
};

export const PERIODS = [
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "365 jours", days: 365 },
  { label: "Tout", days: 99999 },
] as const;

export function filterByPeriod(activities: Activity[], days: number): Activity[] {
  if (days >= 99999) return activities;
  const cutoff = Date.now() - days * 86400_000;
  return activities.filter((a) => a.start_date && new Date(a.start_date).getTime() >= cutoff);
}

const isCycling = (a: Activity) => ["bike", "cycling", "ride", "virtualride", "ebikeride"].includes((a.sport_type_normalized || "").toLowerCase());
const isRun = (a: Activity) => ["run", "running", "trailrun", "virtualrun"].includes((a.sport_type_normalized || "").toLowerCase());
const isSwim = (a: Activity) => ["swim", "swimming"].includes((a.sport_type_normalized || "").toLowerCase());

function fmtPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
function fmtPace100m(secondsPer100: number): string {
  const m = Math.floor(secondsPer100 / 60);
  const s = Math.round(secondsPer100 % 60);
  return `${m}:${String(s).padStart(2, "0")}/100m`;
}
function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ========== VÉLO : meilleures puissances ==========
// Sans stream seconde-par-seconde, on ne peut pas isoler "le meilleur 1 min" dans
// une sortie longue. Stratégie pragmatique :
// - 1 min : on prend le pic max_power enregistré sur n'importe quelle sortie.
// - 5 min : fenêtre élargie (3-15 min) sur avg_power.
// - 20 / 60 min : fenêtre proche de la cible.
function bestPowerPeak(activities: Activity[], label: string): BestEffort {
  const candidates = activities.filter(isCycling).filter((a) => a.max_power && a.max_power > 0);
  if (candidates.length === 0) {
    return { label, value: null, unit: "W", formatted: "—", date: null, activityName: null, activityId: null, insufficient: true, reason: "Aucun pic de puissance enregistré" };
  }
  const best = candidates.reduce((a, b) => ((a.max_power || 0) > (b.max_power || 0) ? a : b));
  return {
    label,
    value: Math.round(best.max_power || 0),
    unit: "W",
    formatted: `${Math.round(best.max_power || 0)} W`,
    date: best.start_date,
    activityName: best.name,
    activityId: best.id,
    reason: "Pic max enregistré pendant l'activité",
  };
}

function bestPowerForDuration(activities: Activity[], targetMin: number, label: string): BestEffort {
  const targetSec = targetMin * 60;
  // Fenêtre élargie pour les efforts courts/moyens
  const minSec = targetMin <= 5 ? targetSec * 0.6 : targetSec * 0.8;
  const maxSec = targetMin <= 5 ? targetSec * 3 : targetSec * 1.8;
  const candidates = activities
    .filter(isCycling)
    .filter((a) => a.avg_power && a.avg_power > 0)
    .filter((a) => {
      const d = a.moving_time_seconds || a.duration_seconds || 0;
      return d >= minSec && d <= maxSec;
    });
  if (candidates.length === 0) {
    return { label, value: null, unit: "W", formatted: "—", date: null, activityName: null, activityId: null, insufficient: true, reason: `Aucune sortie vélo de ~${targetMin} min avec puissance` };
  }
  const best = candidates.reduce((a, b) => ((a.avg_power || 0) > (b.avg_power || 0) ? a : b));
  return {
    label, value: Math.round(best.avg_power || 0), unit: "W",
    formatted: `${Math.round(best.avg_power || 0)} W`,
    date: best.start_date, activityName: best.name, activityId: best.id,
    reason: "Puissance moyenne d'une sortie proche de cette durée",
  };
}

function markIncoherentPowerProxy(shorter: BestEffort, longer: BestEffort): BestEffort {
  if (shorter.insufficient || longer.insufficient || shorter.value === null || longer.value === null) {
    return shorter;
  }

  const allowedFloor = Math.round(longer.value * 0.95);
  if (shorter.value >= allowedFloor) {
    return shorter;
  }

  return {
    ...shorter,
    value: null,
    formatted: "—",
    date: null,
    activityName: null,
    activityId: null,
    insufficient: true,
    reason: `Proxy incohérent vs ${longer.label.toLowerCase()} (${longer.value} W) : données courtes insuffisantes pour estimer ${shorter.label.toLowerCase()}`,
  };
}

// ========== CAP : meilleure allure ==========
// Pour les courtes distances (1, 5 km), peu de gens font une course de 1 km isolée.
// On accepte les sorties ≥ distance cible comme proxy d'allure soutenue.
function bestRunPaceForDistance(activities: Activity[], targetKm: number, label: string): BestEffort {
  const minKm = targetKm <= 5 ? targetKm : targetKm * 0.85;
  const maxKm = targetKm <= 5 ? targetKm * 4 : targetKm * 1.30;
  const candidates = activities
    .filter(isRun)
    .filter((a) => a.distance_meters && (a.moving_time_seconds || a.duration_seconds))
    .filter((a) => {
      const km = (a.distance_meters || 0) / 1000;
      return km >= minKm && km <= maxKm;
    });
  if (candidates.length === 0) {
    return { label, value: null, unit: "/km", formatted: "—", date: null, activityName: null, activityId: null, insufficient: true, reason: `Aucune course ≥ ${targetKm} km` };
  }
  const withPace = candidates.map((a) => {
    const dur = a.moving_time_seconds || a.duration_seconds || 0;
    const km = (a.distance_meters || 0) / 1000;
    return { a, pace: dur / km };
  });
  const best = withPace.reduce((x, y) => (x.pace < y.pace ? x : y));
  const proxyNote = targetKm <= 5 ? "Meilleure allure moyenne sur une sortie ≥ cette distance" : "Allure moyenne d'une sortie de cette distance";
  return {
    label, value: best.pace, unit: "/km",
    formatted: fmtPace(best.pace),
    date: best.a.start_date, activityName: best.a.name, activityId: best.a.id,
    reason: proxyNote,
  };
}

// Allure moyenne meilleure sur ~1h (course de 50-80 min)
function bestRunPace1h(activities: Activity[]): BestEffort {
  const candidates = activities
    .filter(isRun)
    .filter((a) => a.distance_meters && (a.moving_time_seconds || a.duration_seconds))
    .filter((a) => {
      const dur = a.moving_time_seconds || a.duration_seconds || 0;
      return dur >= 50 * 60 && dur <= 80 * 60;
    });
  if (candidates.length === 0) {
    return { label: "Allure ~1h", value: null, unit: "/km", formatted: "—", date: null, activityName: null, activityId: null, insufficient: true, reason: "Aucune course de 50-80 min" };
  }
  const withPace = candidates.map((a) => ({ a, pace: (a.moving_time_seconds || a.duration_seconds || 0) / ((a.distance_meters || 1) / 1000) }));
  const best = withPace.reduce((x, y) => (x.pace < y.pace ? x : y));
  return { label: "Allure ~1h", value: best.pace, unit: "/km", formatted: fmtPace(best.pace), date: best.a.start_date, activityName: best.a.name, activityId: best.a.id };
}

// ========== NATATION : meilleure allure /100m ==========
// Pour 100 / 400 m : on accepte les nages plus longues comme proxy.
function bestSwimPaceForDistance(activities: Activity[], targetM: number, label: string): BestEffort {
  const minM = targetM <= 400 ? targetM : targetM * 0.9;
  const maxM = targetM <= 400 ? targetM * 5 : targetM * 1.5;
  const candidates = activities
    .filter(isSwim)
    .filter((a) => a.distance_meters && (a.moving_time_seconds || a.duration_seconds))
    .filter((a) => (a.distance_meters || 0) >= minM && (a.distance_meters || 0) <= maxM);
  if (candidates.length === 0) {
    return { label, value: null, unit: "/100m", formatted: "—", date: null, activityName: null, activityId: null, insufficient: true, reason: `Aucune nage ≥ ${targetM} m` };
  }
  const withPace = candidates.map((a) => {
    const dur = a.moving_time_seconds || a.duration_seconds || 0;
    return { a, pace: dur / ((a.distance_meters || 1) / 100) };
  });
  const best = withPace.reduce((x, y) => (x.pace < y.pace ? x : y));
  return {
    label, value: best.pace, unit: "/100m", formatted: fmtPace100m(best.pace),
    date: best.a.start_date, activityName: best.a.name, activityId: best.a.id,
    reason: targetM <= 400 ? "Meilleure allure moyenne sur une nage ≥ cette distance" : "Allure moyenne d'une nage de cette distance",
  };
}

export function computeBestEfforts(activities: Activity[]) {
  const powerPeak = bestPowerPeak(activities, "Pic puissance");
  const power60 = bestPowerForDuration(activities, 60, "Puissance ~60 min");
  const power20 = markIncoherentPowerProxy(bestPowerForDuration(activities, 20, "Puissance ~20 min"), power60);
  const power5 = markIncoherentPowerProxy(
    bestPowerForDuration(activities, 5, "Puissance ~5 min"),
    power20.value !== null ? power20 : power60,
  );

  return {
    cycling: [
      powerPeak,
      power5,
      power20,
      power60,
    ],
    running: [
      bestRunPaceForDistance(activities, 1, "Allure ~1 km"),
      bestRunPaceForDistance(activities, 5, "Allure ~5 km"),
      bestRunPaceForDistance(activities, 10, "10 km"),
      bestRunPace1h(activities),
      bestRunPaceForDistance(activities, 21.1, "Semi"),
    ],
    swimming: [
      bestSwimPaceForDistance(activities, 100, "Allure ~100 m"),
      bestSwimPaceForDistance(activities, 400, "Allure ~400 m"),
      bestSwimPaceForDistance(activities, 1000, "1 000 m"),
      bestSwimPaceForDistance(activities, 1500, "1 500 m"),
    ],
  };
}

// ========== CHARGE & RÉGULARITÉ ==========
export type LoadSummary = {
  totalSessions: number;
  totalHours: number;
  weeklyAvg: { sessions: number; hours: number };
  bySport: { swim: number; bike: number; run: number; other: number }; // heures
  weekly: { weekStart: string; sessions: number; hours: number }[];
  longestBySport: { swim: Activity | null; bike: Activity | null; run: Activity | null };
  trend: "up" | "down" | "stable";
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function computeLoadSummary(activities: Activity[], periodDays: number): LoadSummary {
  const inPeriod = filterByPeriod(activities, periodDays);

  const totalSessions = inPeriod.length;
  const totalSec = inPeriod.reduce((s, a) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0);
  const totalHours = totalSec / 3600;

  const bySport = { swim: 0, bike: 0, run: 0, other: 0 };
  for (const a of inPeriod) {
    const h = (a.moving_time_seconds || a.duration_seconds || 0) / 3600;
    if (isSwim(a)) bySport.swim += h;
    else if (isCycling(a)) bySport.bike += h;
    else if (isRun(a)) bySport.run += h;
    else bySport.other += h;
  }

  // Agrégat hebdo (12 dernières semaines max)
  const weeksMap = new Map<string, { sessions: number; sec: number }>();
  for (const a of inPeriod) {
    if (!a.start_date) continue;
    const ws = startOfWeek(new Date(a.start_date)).toISOString().slice(0, 10);
    const cur = weeksMap.get(ws) || { sessions: 0, sec: 0 };
    cur.sessions += 1;
    cur.sec += a.moving_time_seconds || a.duration_seconds || 0;
    weeksMap.set(ws, cur);
  }
  const weekly = Array.from(weeksMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-12)
    .map(([weekStart, v]) => ({ weekStart, sessions: v.sessions, hours: v.sec / 3600 }));

  const weeksCount = Math.max(1, weekly.length);
  const weeklyAvg = {
    sessions: totalSessions / weeksCount,
    hours: totalHours / weeksCount,
  };

  const longestBySport = {
    swim: inPeriod.filter(isSwim).sort((a, b) => (b.distance_meters || 0) - (a.distance_meters || 0))[0] || null,
    bike: inPeriod.filter(isCycling).sort((a, b) => (b.moving_time_seconds || b.duration_seconds || 0) - (a.moving_time_seconds || a.duration_seconds || 0))[0] || null,
    run: inPeriod.filter(isRun).sort((a, b) => (b.distance_meters || 0) - (a.distance_meters || 0))[0] || null,
  };

  // Tendance : moyenne 4 dernières semaines vs 4 précédentes
  let trend: "up" | "down" | "stable" = "stable";
  if (weekly.length >= 6) {
    const last4 = weekly.slice(-4).reduce((s, w) => s + w.hours, 0) / 4;
    const prev4 = weekly.slice(-8, -4).reduce((s, w) => s + w.hours, 0) / Math.max(1, weekly.slice(-8, -4).length);
    if (prev4 > 0) {
      const ratio = last4 / prev4;
      if (ratio > 1.1) trend = "up";
      else if (ratio < 0.9) trend = "down";
    }
  }

  return { totalSessions, totalHours, weeklyAvg, bySport, weekly, longestBySport, trend };
}

export { fmtDuration };
