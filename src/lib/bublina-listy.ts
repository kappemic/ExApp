/** Poloha bubliny v navigaci: levý a pravý kraj v px, rychlost v px/ms. */
export interface PolohaBubliny {
  l: number;
  r: number;
  vl: number;
  vr: number;
}

export interface SnimekBubliny extends PolohaBubliny {
  /** Výška proti klidu: ve skoku se bublina natáhne a zúží. */
  vyska: number;
}

const KROK_MS = 1000 / 60;
const NEJDELE_MS = 900;
/** Vedoucí kraj vystřelí, zadní ho dotahuje. Díky tomu se bublina protáhne. */
const VEDOUCI = { perioda: 230, tlumeni: 0.8 };
const ZADNI = { perioda: 320, tlumeni: 0.9 };

function pruzina(
  x: number,
  v: number,
  cil: number,
  { perioda, tlumeni }: { perioda: number; tlumeni: number },
): [number, number] {
  const uhlova = (2 * Math.PI) / perioda;
  let odchylka = x - cil;
  let rychlost = v;
  for (let i = 0; i < 4; i += 1) {
    rychlost += (-uhlova * uhlova * odchylka - 2 * tlumeni * uhlova * rychlost) * (KROK_MS / 4);
    odchylka += rychlost * (KROK_MS / 4);
  }
  return [cil + odchylka, rychlost];
}

/**
 * Snímky přeskoku z `od` do cílových krajů. První snímek je výchozí poloha,
 * poslední přesně cíl. Kraje nepřejedou kapsli o víc než `presah` px.
 */
export function preskokBubliny(
  od: PolohaBubliny,
  cil: { l: number; r: number },
  kapsle: { sirka: number; presah: number },
): SnimekBubliny[] {
  const doprava = cil.l + cil.r >= od.l + od.r;
  const klidovaSirka = Math.max(1, cil.r - cil.l);
  const vyska = (l: number, r: number): number =>
    1 - Math.min(0.16, Math.max(0, (r - l) / klidovaSirka - 1) * 0.14);
  const snimky: SnimekBubliny[] = [{ ...od, vyska: vyska(od.l, od.r) }];
  let { l, r, vl, vr } = od;
  for (let ms = 0; ms < NEJDELE_MS; ms += KROK_MS) {
    [l, vl] = pruzina(l, vl, cil.l, doprava ? ZADNI : VEDOUCI);
    [r, vr] = pruzina(r, vr, cil.r, doprava ? VEDOUCI : ZADNI);
    const klid =
      Math.abs(l - cil.l) < 0.3 && Math.abs(r - cil.r) < 0.3 && Math.abs(vl) < 0.01 && Math.abs(vr) < 0.01;
    if (klid) break;
    const ll = Math.max(-kapsle.presah, l);
    const rr = Math.min(kapsle.sirka + kapsle.presah, r);
    snimky.push({ l: ll, r: rr, vl, vr, vyska: vyska(ll, rr) });
  }
  snimky.push({ l: cil.l, r: cil.r, vl: 0, vr: 0, vyska: 1 });
  return snimky;
}

export const KROK_PRESKOKU_MS = KROK_MS;
