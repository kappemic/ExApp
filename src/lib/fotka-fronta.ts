/**
 * Preview bytes start a few at a time, earliest on the page first
 * (top row, then left to right). A full-size photo cuts in front.
 */

const NARAZ = 6;
const RADEK_PX = 8;

type Ukol = () => Promise<void>;

export interface UmisteniFotky {
  y: number;
  x: number;
}

interface Polozka {
  ukol: Ukol;
  y: number;
  x: number;
  poradi: number;
}

const cekajici: Polozka[] = [];
let bezi = 0;
let dalsiPoradi = 0;
let naplanovano = false;

function srovnej(a: Polozka, b: Polozka): number {
  const dy = Math.round(a.y / RADEK_PX) - Math.round(b.y / RADEK_PX);
  if (dy !== 0) return dy;
  if (a.x !== b.x) return a.x - b.x;
  return a.poradi - b.poradi;
}

function dalsi(): void {
  while (bezi < NARAZ && cekajici.length > 0) {
    const polozka = cekajici.shift();
    if (polozka === undefined) return;
    bezi += 1;
    void polozka.ukol().finally(() => {
      bezi -= 1;
      dalsi();
    });
  }
}

function naplanuj(): void {
  if (naplanovano) return;
  naplanovano = true;
  queueMicrotask(() => {
    naplanovano = false;
    cekajici.sort(srovnej);
    dalsi();
  });
}

/** Returns a cancel function. Priority runs immediately, ahead of the grid. */
export function zaradNacteniFotky(
  ukol: Ukol,
  prednost = false,
  umisteni?: UmisteniFotky,
): () => void {
  let zruseno = false;
  const obal: Ukol = () => (zruseno ? Promise.resolve() : ukol());
  if (prednost) {
    bezi += 1;
    void obal().finally(() => {
      bezi -= 1;
      dalsi();
    });
    return () => {
      zruseno = true;
    };
  }
  const polozka: Polozka = {
    ukol: obal,
    y: umisteni?.y ?? 0,
    x: umisteni?.x ?? dalsiPoradi,
    poradi: dalsiPoradi,
  };
  dalsiPoradi += 1;
  cekajici.push(polozka);
  naplanuj();
  return () => {
    zruseno = true;
    const index = cekajici.indexOf(polozka);
    if (index >= 0) cekajici.splice(index, 1);
  };
}

/** Test helper. Drops waiting work; in-flight tasks still finish. */
export function vyprazdniFrontuFotek(): void {
  cekajici.length = 0;
  dalsiPoradi = 0;
}
