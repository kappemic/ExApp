import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { snizenyPohyb } from "../lib/pohyb";
import { bezGumy, cilPrichyceni, krokPruziny, sGumou, sousedniZarazka } from "../lib/posuvnik-fyzika";

/** Od kolika px jde o tah, ne o klepnutí. */
const PRAH_TAHU_PX = 6;
/** Z jak dlouhého úseku se počítá rychlost při puštění. */
const OKNO_RYCHLOSTI_MS = 90;
/** Rychlejší švih pružinu jen zbytečně rozkmitá. */
const MAX_RYCHLOST = 3;
/** Po jaké pauze je plynulý posun ze šipky dokončený. */
const KLID_POSUVU_MS = 150;

interface Tah {
  id: number;
  x: number;
  y: number;
  start: number;
  tahne: boolean;
  vzorky: { x: number; cas: number }[];
}

function maximum(el: HTMLElement): number {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

/** Zarážky bere z rozložení, takže sedí na `scroll-snap` ve stylech. */
function zarazky(el: HTMLElement): number[] {
  const max = maximum(el);
  const odsazeni = Number.parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
  const polohy = Array.from(el.children)
    .filter((dite): dite is HTMLElement => dite instanceof HTMLElement && dite.offsetWidth > 0)
    .map((dite) => Math.round(Math.min(max, Math.max(0, dite.offsetLeft - odsazeni))));
  return [...new Set(polohy)];
}

/**
 * Vodorovný posuvník karet, `posuvnik` je rolovací seznam a jeho děti karty
 * (děti nulové šířky se přeskakují, jsou to šipky `data-sipka`).
 * Prst, pero, kolečko i klávesy posouvá prohlížeč sám (nativní posuv se
 * `scroll-snap`): jede mimo hlavní vlákno a nezasekne se o šikmý tah. Skript
 * řeší jen tažení myší a šipky.
 *
 * Vrací, jestli je vlevo a vpravo kam posouvat, a posun o kartu pro šipky.
 */
export function usePosuvnikKaret(
  posuvnik: RefObject<HTMLElement | null>,
  klic: string,
): { vlevo: boolean; vpravo: boolean; posun: (smer: -1 | 1) => void } {
  const pohyb = useRef({ poloha: 0, rychlost: 0, snimek: 0 });
  /** Kam jede posun ze šipky. Rychlé klepnutí navazuje na něj, ne na mezipolohu. */
  const cilSipky = useRef<number | null>(null);
  const [kraje, setKraje] = useState({ vlevo: false, vpravo: false });

  useLayoutEffect(() => {
    const el = posuvnik.current;
    if (el === null) return;
    let casovac = 0;
    const zmer = (): void => {
      const vlevo = el.scrollLeft > 2;
      const vpravo = el.scrollLeft < maximum(el) - 2;
      setKraje((stare) => (stare.vlevo === vlevo && stare.vpravo === vpravo ? stare : { vlevo, vpravo }));
    };
    const naPosuv = (): void => {
      zmer();
      window.clearTimeout(casovac);
      casovac = window.setTimeout(() => {
        cilSipky.current = null;
      }, KLID_POSUVU_MS);
    };
    zmer();
    const mereni = new ResizeObserver(zmer);
    mereni.observe(el);
    el.addEventListener("scroll", naPosuv, { passive: true });
    return () => {
      window.clearTimeout(casovac);
      mereni.disconnect();
      el.removeEventListener("scroll", naPosuv);
    };
  }, [posuvnik, klic]);

  const posun = useCallback(
    (smer: -1 | 1): void => {
      const el = posuvnik.current;
      if (el === null) return;
      // Šipka přebírá posuv i rozjeté pružině po tažení myší.
      cancelAnimationFrame(pohyb.current.snimek);
      pohyb.current.snimek = 0;
      el.style.transform = "";
      el.style.scrollSnapType = "";
      const cil = sousedniZarazka(cilSipky.current ?? el.scrollLeft, smer, zarazky(el));
      // Bez pohybu nepřijde `scroll`, který by cíl zase smazal.
      cilSipky.current = Math.abs(cil - el.scrollLeft) < 1 ? null : cil;
      el.scrollTo({ left: cil, behavior: snizenyPohyb() ? "auto" : "smooth" });
    },
    [posuvnik],
  );

  useEffect(() => {
    const el = posuvnik.current;
    if (el === null) return;
    const stav = pohyb.current;
    let tah: Tah | null = null;
    let spolknoutKlik = false;

    function nastav(poloha: number): void {
      stav.poloha = poloha;
      const max = maximum(el!);
      const vMezich = Math.min(max, Math.max(0, poloha));
      el!.scrollLeft = vMezich;
      const vysun = vMezich - poloha;
      el!.style.transform = Math.abs(vysun) < 0.1 ? "" : `translate3d(${vysun}px, 0, 0)`;
    }

    function zastav(): void {
      cancelAnimationFrame(stav.snimek);
      stav.snimek = 0;
    }

    function klid(): void {
      zastav();
      stav.rychlost = 0;
      el!.style.transform = "";
      el!.style.scrollSnapType = "";
    }

    function dojed(cil: number): void {
      zastav();
      if (snizenyPohyb()) {
        nastav(cil);
        klid();
        return;
      }
      let minule = performance.now();
      const krok = (ted: number): void => {
        const dalsi = krokPruziny(stav.poloha, stav.rychlost, cil, Math.max(0, ted - minule));
        minule = ted;
        stav.rychlost = dalsi.rychlost;
        nastav(dalsi.poloha);
        if (dalsi.hotovo) klid();
        else stav.snimek = requestAnimationFrame(krok);
      };
      stav.snimek = requestAnimationFrame(krok);
    }

    function rychlostTahu(t: Tah): number {
      const posledni = t.vzorky[t.vzorky.length - 1];
      const prvni = t.vzorky.find((v) => posledni !== undefined && posledni.cas - v.cas <= OKNO_RYCHLOSTI_MS);
      if (posledni === undefined || prvni === undefined || posledni.cas - prvni.cas < 8) return 0;
      // Prst se před puštěním zastavil, karty nemají kam letět.
      if (performance.now() - posledni.cas > OKNO_RYCHLOSTI_MS) return 0;
      const rychlost = -(posledni.x - prvni.x) / (posledni.cas - prvni.cas);
      return Math.min(MAX_RYCHLOST, Math.max(-MAX_RYCHLOST, rychlost));
    }

    function naDolu(udalost: PointerEvent): void {
      // Klepnutí na šipku navazuje na rozjetý posun, není to nový tah.
      if (udalost.target instanceof Element && udalost.target.closest("[data-sipka]") !== null) return;
      cilSipky.current = null;
      if (udalost.pointerType !== "mouse") {
        prevzit();
        return;
      }
      if (!udalost.isPrimary || udalost.button !== 0 || maximum(el!) <= 0) return;
      spolknoutKlik = false;
      const bezelo = stav.snimek !== 0;
      zastav();
      if (!bezelo) stav.poloha = el!.scrollLeft;
      tah = {
        id: udalost.pointerId,
        x: udalost.clientX,
        y: udalost.clientY,
        start: bezGumy(stav.poloha, maximum(el!), el!.clientWidth),
        tahne: false,
        vzorky: [{ x: udalost.clientX, cas: performance.now() }],
      };
      if (!bezelo) return;
      // Chycení rozjetých karet je jen zastaví, klepnutí by otevřelo výpravu omylem.
      spolknoutKlik = true;
      el!.setPointerCapture(tah.id);
    }

    function naPohyb(udalost: PointerEvent): void {
      if (tah === null || udalost.pointerId !== tah.id) return;
      // Myš puštěná mimo posuvník před začátkem tahu.
      if (udalost.buttons === 0) {
        tah = null;
        return;
      }
      const dx = udalost.clientX - tah.x;
      if (!tah.tahne) {
        if (Math.abs(dx) < PRAH_TAHU_PX || Math.abs(dx) < Math.abs(udalost.clientY - tah.y)) return;
        tah.tahne = true;
        // Tah začíná z místa prahu, jinak by karta o těch pár px skočila.
        tah.x = udalost.clientX;
        el!.style.scrollSnapType = "none";
        el!.dataset.tazeno = "";
        el!.setPointerCapture(tah.id);
        return;
      }
      tah.vzorky.push({ x: udalost.clientX, cas: performance.now() });
      if (tah.vzorky.length > 24) tah.vzorky.shift();
      const prst = tah.start - dx;
      const max = maximum(el!);
      nastav(snizenyPohyb() ? Math.min(max, Math.max(0, prst)) : sGumou(prst, max, el!.clientWidth));
    }

    function naKonec(udalost: PointerEvent): void {
      if (tah === null || udalost.pointerId !== tah.id) return;
      const t = tah;
      tah = null;
      delete el!.dataset.tazeno;
      if (!t.tahne && !spolknoutKlik) return;
      if (t.tahne) spolknoutKlik = true;
      // Když po tahu klik nepřijde, pozdější klik z klávesnice nesmí zmizet.
      window.setTimeout(() => {
        spolknoutKlik = false;
      }, 80);
      stav.rychlost = t.tahne && udalost.type === "pointerup" ? rychlostTahu(t) : 0;
      el!.style.scrollSnapType = "none";
      dojed(cilPrichyceni(stav.poloha, stav.rychlost, zarazky(el!)));
    }

    function naKlik(udalost: MouseEvent): void {
      if (!spolknoutKlik) return;
      spolknoutKlik = false;
      udalost.preventDefault();
      udalost.stopPropagation();
    }

    /** Prst, kolečko nebo klávesa přebírá posuv, rozjetá pružina by se s ním přetahovala. */
    function prevzit(): void {
      if (stav.snimek !== 0 && tah === null) klid();
    }

    const bezTazeniObrazku = (udalost: DragEvent): void => udalost.preventDefault();

    el.addEventListener("pointerdown", naDolu);
    el.addEventListener("pointermove", naPohyb);
    el.addEventListener("pointerup", naKonec);
    el.addEventListener("pointercancel", naKonec);
    el.addEventListener("click", naKlik, true);
    el.addEventListener("wheel", prevzit, { passive: true });
    el.addEventListener("keydown", prevzit);
    el.addEventListener("dragstart", bezTazeniObrazku);
    return () => {
      klid();
      delete el.dataset.tazeno;
      el.removeEventListener("pointerdown", naDolu);
      el.removeEventListener("pointermove", naPohyb);
      el.removeEventListener("pointerup", naKonec);
      el.removeEventListener("pointercancel", naKonec);
      el.removeEventListener("click", naKlik, true);
      el.removeEventListener("wheel", prevzit);
      el.removeEventListener("keydown", prevzit);
      el.removeEventListener("dragstart", bezTazeniObrazku);
    };
  }, [posuvnik]);

  return { ...kraje, posun };
}
