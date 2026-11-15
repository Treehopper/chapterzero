/** Vocabulary calibration model (README §7.8). */
export interface Observation { rank: number; known: boolean }

export function fit(obs: Observation[]): { r50: number; k: number; cutoffRank: number } {
  let best = { ll: -Infinity, lnR50: 0, k: 0 };
  for (let i = 0; i <= 200; i++) {
    const lnR50 = Math.log(500) + ((Math.log(150000) - Math.log(500)) * i) / 200;
    for (let j = 0; j <= 22; j++) {
      const k = 0.5 + 0.25 * j;
      let ll = 0;
      for (const o of obs) {
        let p = 1 / (1 + Math.exp(k * (Math.log(o.rank) - lnR50)));
        p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
        ll += Math.log(o.known ? p : 1 - p);
      }
      if (ll > best.ll + 1e-12) best = { ll, lnR50, k };
    }
  }
  const r50 = Math.exp(best.lnR50);
  let cutoff = r50 * Math.exp(-Math.log(0.85 / 0.15) / best.k);
  cutoff = Math.min(Math.max(cutoff, 2000), 60000);
  return { r50: Math.round(r50), k: best.k, cutoffRank: Math.round(cutoff / 100) * 100 };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
