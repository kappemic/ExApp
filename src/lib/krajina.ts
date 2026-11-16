/**
 * Krajina výpravy (redesign C2): paleta podle ročního období termínu
 * a deterministický tvar hřebenů odvozený z ID výpravy. Čistá logika,
 * komponenta `KrajinaVypravy` jen vykresluje vrácené cesty.
 *
 * Krajina je ilustrace, ne mapa. Netvrdí nic o skutečné trase, jen
 * dává každé výpravě vlastní, stále stejný obraz.
 */

export type RocniObdobi = "jaro" | "leto" | "podzim" | "zima";

export interface PaletaKrajiny {
  id: string;
  obdobi: RocniObdobi;
  /** Obloha shora dolů. */
  nebe: readonly [string, string, string];
  /** Vrstvy hřebenů od nejvzdálenější po nejbližší. */
  vrstvy: readonly [string, string, string, string];
  /** Akcent pro text na bílém pozadí (kontrast ≥ 4,5:1). */
  akcent: string;
  /** Barva trasy a záře. */
  zare: string;
  noc?: boolean;
  stromy?: boolean;
  skaly?: boolean;
  /** Teplá záře nad obzorem. */
  svit?: boolean;
}

const PALETY: readonly PaletaKrajiny[] = [
  {
    id: "podzim-oliva",
    obdobi: "podzim",
    nebe: ["#2B3618", "#7E9450", "#D99B26"],
    vrstvy: ["#A9B87E", "#7E9450", "#556B2F", "#2B3618"],
    akcent: "#8F5F0A",
    zare: "#D99B26",
    svit: true,
  },
  {
    id: "podzim-piskovec",
    obdobi: "podzim",
    nebe: ["#F0B46A", "#F6CF95", "#FBE9CB"],
    vrstvy: ["#E39A62", "#C0663F", "#86402F", "#43251E"],
    akcent: "#A84A2A",
    zare: "#7A3B2E",
    skaly: true,
  },
  {
    id: "zima-snih",
    obdobi: "zima",
    nebe: ["#7DB8E0", "#BFE0F2", "#EEF7FB"],
    vrstvy: ["#E4EFF6", "#BCD4E5", "#86AECB", "#557EA0"],
    akcent: "#0B6F88",
    zare: "#F2603F",
  },
  {
    id: "zima-noc",
    obdobi: "zima",
    nebe: ["#0E1838", "#1E3460", "#3D5C8C"],
    vrstvy: ["#33507F", "#223B66", "#16294D", "#0C1733"],
    akcent: "#2F5BD3",
    zare: "#FFC94A",
    noc: true,
  },
  {
    id: "jaro-smrky",
    obdobi: "jaro",
    nebe: ["#A9BFAE", "#D9E0CF", "#F2EAD8"],
    vrstvy: ["#8CA88E", "#5D8268", "#365C47", "#1C3A2B"],
    akcent: "#2E6B4A",
    zare: "#D98A3D",
    stromy: true,
  },
  {
    id: "jaro-louky",
    obdobi: "jaro",
    nebe: ["#9CC9C2", "#D8EAD3", "#F4F1D0"],
    vrstvy: ["#B7D3A8", "#7FB08E", "#4C8072", "#244A44"],
    akcent: "#2F6E5F",
    zare: "#C6A23A",
  },
  {
    id: "leto-zapad",
    obdobi: "leto",
    nebe: ["#E7A4A0", "#F2C6B4", "#FAE6D8"],
    vrstvy: ["#C89AA8", "#9C6F8A", "#6B4A66", "#3B2A3D"],
    akcent: "#9C4F78",
    zare: "#F5D06B",
  },
  {
    id: "leto-soumrak",
    obdobi: "leto",
    nebe: ["#3D3470", "#B9789A", "#F0A877"],
    vrstvy: ["#9A7FB4", "#6C5494", "#43356B", "#231C3D"],
    akcent: "#6A4FB0",
    zare: "#F5A953",
    svit: true,
  },
];

/** Měsíc 1–12 → roční období. */
export function obdobiProMesic(mesic: number): RocniObdobi {
  if (mesic === 12 || mesic <= 2) return "zima";
  if (mesic <= 5) return "jaro";
  if (mesic <= 8) return "leto";
  return "podzim";
}

/** Stabilní 32bitový hash řetězce (FNV-1a). */
export function hashRetezce(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Paleta pro výpravu: roční období z data (YYYY-MM-DD), konkrétní
 * varianta z ID. Neplatné datum spadne do podzimní olivy (barvy značky).
 */
export function paletaVypravy(id: string, datumYmd: string): PaletaKrajiny {
  const mesic = Number(datumYmd.slice(5, 7));
  const obdobi: RocniObdobi =
    Number.isInteger(mesic) && mesic >= 1 && mesic <= 12
      ? obdobiProMesic(mesic)
      : "podzim";
  const kandidati = PALETY.filter((p) => p.obdobi === obdobi);
  const vyber = kandidati[hashRetezce(id) % kandidati.length];
  return vyber ?? PALETY[0]!;
}

type Bod = readonly [number, number];

/** Základní profily vrstev (x a y jako podíl šířky a výšky). */
const ZAKLAD: readonly (readonly Bod[])[] = [
  [[0, 0.56], [0.12, 0.5], [0.22, 0.53], [0.35, 0.44], [0.47, 0.49], [0.6, 0.41], [0.72, 0.47], [0.85, 0.43], [1, 0.48]],
  [[0, 0.66], [0.14, 0.6], [0.28, 0.63], [0.42, 0.52], [0.5, 0.44], [0.58, 0.34], [0.66, 0.44], [0.76, 0.55], [0.9, 0.58], [1, 0.6]],
  [[0, 0.78], [0.16, 0.72], [0.3, 0.76], [0.46, 0.7], [0.62, 0.77], [0.78, 0.73], [1, 0.77]],
  [[0, 0.9], [0.2, 0.85], [0.4, 0.89], [0.6, 0.84], [0.8, 0.89], [1, 0.86]],
];

/** Deterministický generátor 0–1 ze semínka (mulberry32). */
function generator(semeno: number): () => number {
  let a = semeno >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vrstvy s mírně posunutými vrcholy podle ID. Vrchol hřebene (vrstva 1) se posouvá i do stran. */
export function profilyVrstev(id: string): Bod[][] {
  const nahoda = generator(hashRetezce(id));
  const posunVrcholu = (nahoda() - 0.5) * 0.3;
  return ZAKLAD.map((vrstva, index) =>
    vrstva.map(([x, y], i) => {
      const okraj = i === 0 || i === vrstva.length - 1;
      const dy = (nahoda() - 0.5) * (index === 3 ? 0.03 : 0.07);
      const nx = okraj || index !== 1 ? x : Math.min(0.95, Math.max(0.05, x + posunVrcholu * (1 - Math.abs(x - 0.58))));
      return [nx, Math.min(0.95, Math.max(0.2, y + dy))] as const;
    }),
  );
}

/** Výška vrstvy v místě x (lineární interpolace mezi body). */
export function vyskaVrstvy(body: readonly Bod[], x: number): number {
  for (let i = 0; i < body.length - 1; i++) {
    const a = body[i]!;
    const b = body[i + 1]!;
    if (x >= a[0] && x <= b[0]) {
      const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return body[body.length - 1]![1];
}

const f = (n: number): string => n.toFixed(1);

/** Plocha vrstvy jako SVG cesta. Hřeben s vrcholem (index 1) je ostrý, ostatní měkké. */
export function cestaVrstvy(body: readonly Bod[], sirka: number, vyska: number, ostra: boolean): string {
  const P = body.map(([x, y]) => [x * sirka, y * vyska] as const);
  let d = `M${f(P[0]![0])} ${f(P[0]![1])}`;
  if (ostra) {
    for (let i = 1; i < P.length; i++) d += ` L${f(P[i]![0])} ${f(P[i]![1])}`;
  } else {
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i]![0] + P[i + 1]![0]) / 2;
      const my = (P[i]![1] + P[i + 1]![1]) / 2;
      d += ` Q${f(P[i]![0])} ${f(P[i]![1])} ${f(mx)} ${f(my)}`;
    }
    d += ` L${f(P[P.length - 1]![0])} ${f(P[P.length - 1]![1])}`;
  }
  return `${d} L${f(sirka)} ${f(vyska)} L0 ${f(vyska)}Z`;
}

/** Čárkovaná trasa po svahu hlavního hřebene a její tři zastávky (start, vrchol, cíl). */
export function trasaPoHrebeni(
  hreben: readonly Bod[],
  sirka: number,
  vyska: number,
): { cesta: string; zastavky: Array<readonly [number, number]> } {
  const odsazeni = 0.05;
  const xs = [0.06, ...hreben.map((b) => b[0]).filter((x) => x > 0.06 && x < 0.95), 0.95];
  const cesta = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${f(x * sirka)} ${f((vyskaVrstvy(hreben, x) + odsazeni) * vyska)}`)
    .join(" ");
  const vrchol = hreben.reduce((min, b) => (b[1] < min[1] ? b : min), hreben[0]!);
  const zastavky = [0.06, vrchol[0], 0.95].map(
    (x) => [x * sirka, (vyskaVrstvy(hreben, x) + odsazeni) * vyska] as const,
  );
  return { cesta, zastavky };
}

/** Počet dní mezi dvěma daty YYYY-MM-DD (b − a), v poledne kvůli letnímu času. */
export function rozdilDni(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T12:00:00`).getTime();
  const b = new Date(`${bYmd}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** „Dnes“, „Zítra“, „Za 3 dny“, „Za 12 dní“; probíhající výprava „Právě probíhá“. */
export function textOdpoctu(datumYmd: string, dnesYmd: string, probiha: boolean): string {
  if (probiha) return "Právě probíhá";
  const n = rozdilDni(dnesYmd, datumYmd);
  if (n <= 0) return "Dnes";
  if (n === 1) return "Zítra";
  if (n <= 4) return `Za ${n} dny`;
  return `Za ${n} dní`;
}
