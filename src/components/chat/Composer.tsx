import Ikona from "../Ikona";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from "react";
import { pridejPrilohy } from "../../lib/prilohy-zpravy";
import { prizpusobVyskuPole } from "../../lib/vyska-pole";
import { VALIDACE } from "../../shared/api-types";
import { nabidkyZminky, rozpracovanaZminka, vlozZminku, type NabidkaZminky } from "../../shared/zminky";
import { najdiOdkazy } from "../../shared/odkazy";
import { NahledPredOdeslanim } from "./NahledOdkazu";
import { TacekPriloh, TlacitkoPrilohy } from "./VyberPriloh";

export interface ComposerProps {
  /** Popisek nad polem (např. „Napsat do Generalu"). */
  popisek: string;
  /** Placeholder pro prázdné pole. */
  placeholder: string;
  /** Probíhá odesílání (disabled + „Posílám…"). */
  odesilaSe: boolean;
  /** Chyba odeslání pod formulářem (role=alert). */
  chyba: string | null;
  onOdeslat: (text: string, soubory: readonly File[]) => void;
  /** Testovací háček pro autofokus po přepnutí threadu. */
  autoFocus?: boolean;
  /** Vrátí text a soubory do pole, když server odeslání odmítl. */
  navratTextu?: { token: number; text: string; soubory?: readonly File[] } | null;
  /** Global chats can mention a person or a role. */
  zminky?: boolean;
  clenove?: readonly { id: string; jmeno: string }[];
  /** Soubory přetažené do vlákna. */
  pretazene?: { token: number; soubory: readonly File[] } | null;
}

const MAX_DELKA: number = VALIDACE.zpravaTextMaxDelka;

/* ------------------------------------------------------------------ */
/* Pure pomocníci — export pro tests/chat-konverzace-step3.test.ts.     */
/* (Stejná pravidla jako DiskuzeBox: trim, 1–1000 znaků po graphemech.) */
/* ------------------------------------------------------------------ */

/** Zbývající znaky do limitu 1000 (může být záporné = přes limit). */
export function spocitejZbyvajiciZnakyComposeru(text: string): number {
  return MAX_DELKA - Array.from(text.trim()).length;
}

/**
 * Odeslat jde s textem (1–1000) nebo aspoň jedním souborem, mimo běh.
 * `pocetSouboru` je volitelný, aby starší volání bez příloh platila dál.
 */
export function muzeOdeslatComposer(
  text: string,
  odesilaSe: boolean,
  pocetSouboru = 0,
): boolean {
  if (odesilaSe) return false;
  const delka: number = Array.from(text.trim()).length;
  if (delka > MAX_DELKA) return false;
  if (pocetSouboru < 0 || pocetSouboru > VALIDACE.prilohyMaxPocet) return false;
  return delka >= 1 || pocetSouboru >= 1;
}

/**
 * Znovupoužitelný composer (Step 3).
 *
 * - Jeden řádek: textarea 16px (`text-base` — bez iOS zoomu), `enterkeyhint="send"`,
 *   tlačítko 44px+ vedle pole. Počítadlo `1000 − délka` jen když zbývá ≤ 80 znaků.
 * - Safe-area padding drží rodič (`KonverzaceDetail` / `DiskuzeBox`);
 *   composer sám je čistý formulář bez sticky/fixed (chat-scroll-fix:
 *   sticky `bottom-0` patří jen obálce uvnitř `data-vlakno-scroll`,
 *   nikdy ke stránce ani modalu — scroll detailu chatem nehýbe).
 * - Po úspěchu volající maže text přes `onOdeslat` → prázdný stav
 *   (composer text drží lokálně, rodič jen posílá).
 */
export default function Composer({
  popisek,
  placeholder,
  odesilaSe,
  chyba,
  onOdeslat,
  autoFocus = false,
  navratTextu = null,
  zminky = false,
  clenove = [],
  pretazene = null,
}: ComposerProps): JSX.Element {
  const [text, setText] = useState<string>("");
  const [caret, setCaret] = useState(0);
  const [otevreno, setOtevreno] = useState(false);
  const [vybrany, setVybrany] = useState(0);
  const [soubory, setSoubory] = useState<File[]>([]);
  const [chybaSouboru, setChybaSouboru] = useState<string | null>(null);
  const poleRef = useRef<HTMLTextAreaElement>(null);
  const poleId: string = useId();
  const pocitadloId: string = useId();
  const rozepsane = zminky ? rozpracovanaZminka(text, caret) : null;
  const nabidky: NabidkaZminky[] =
    zminky && (otevreno || rozepsane !== null)
      ? nabidkyZminky(rozepsane?.dotaz ?? "", clenove)
      : [];

  useEffect(() => {
    if (navratTextu === null) return;
    setText(navratTextu.text);
    if (navratTextu.soubory !== undefined) setSoubory([...navratTextu.soubory]);
  }, [navratTextu]);

  useLayoutEffect(() => {
    if (poleRef.current !== null) prizpusobVyskuPole(poleRef.current);
  }, [text]);

  // Otočení telefonu nebo změna okna přeskládá řádky.
  useEffect(() => {
    const naZmenu = (): void => {
      if (poleRef.current !== null) prizpusobVyskuPole(poleRef.current);
    };
    window.addEventListener("resize", naZmenu);
    return () => window.removeEventListener("resize", naZmenu);
  }, []);

  const zbyva: number = spocitejZbyvajiciZnakyComposeru(text);
  const muze: boolean = muzeOdeslatComposer(text, odesilaSe, soubory.length);

  function vloz(nabidka: NabidkaZminky): void {
    const pole = poleRef.current;
    const od = rozepsane?.od ?? caret;
    const dalsi = vlozZminku(text, od, caret, nabidka.token);
    setText(dalsi);
    setOtevreno(false);
    const novaPozice = od + nabidka.token.length + 1;
    setCaret(novaPozice);
    requestAnimationFrame(() => {
      pole?.focus();
      pole?.setSelectionRange(novaPozice, novaPozice);
    });
  }

  function naKlavesu(udalost: KeyboardEvent<HTMLTextAreaElement>): void {
    if (nabidky.length > 0 && (udalost.key === "ArrowDown" || udalost.key === "ArrowUp")) {
      udalost.preventDefault();
      setVybrany((pred) =>
        udalost.key === "ArrowDown" ? (pred + 1) % nabidky.length : (pred - 1 + nabidky.length) % nabidky.length,
      );
      return;
    }
    if (nabidky.length > 0 && udalost.key === "Escape") {
      udalost.preventDefault();
      setOtevreno(false);
      return;
    }
    if (nabidky.length > 0 && udalost.key === "Enter" && !udalost.shiftKey) {
      udalost.preventDefault();
      const nabidka = nabidky[vybrany] ?? nabidky[0];
      if (nabidka !== undefined) vloz(nabidka);
      return;
    }
    if (udalost.key !== "Enter" || udalost.shiftKey || udalost.nativeEvent.isComposing) return;
    udalost.preventDefault();
    if (!muze) return;
    udalost.currentTarget.form?.requestSubmit();
  }

  function naVyberSouboru(nove: File[]): void {
    const vysledek = pridejPrilohy(soubory, nove);
    setSoubory(vysledek.soubory);
    setChybaSouboru(vysledek.chyba);
  }

  const naVyberRef = useRef(naVyberSouboru);
  naVyberRef.current = naVyberSouboru;
  useEffect(() => {
    if (pretazene !== null) naVyberRef.current([...pretazene.soubory]);
  }, [pretazene]);

  function naOdebratSoubor(index: number): void {
    setSoubory((prev) => prev.filter((_, i) => i !== index));
    setChybaSouboru(null);
  }

  function naSubmit(udalost: FormEvent<HTMLFormElement>): void {
    udalost.preventDefault();
    if (!muzeOdeslatComposer(text, odesilaSe, soubory.length)) return;
    const odeslane: File[] = soubory;
    onOdeslat(text.trim(), odeslane);
    setText("");
    setSoubory([]);
    setChybaSouboru(null);
  }

  // Náhled počká, až člověk odkaz dopíše.
  const [odkaz, setOdkaz] = useState<string | null>(null);
  const [zavrenyNahled, setZavrenyNahled] = useState<string | null>(null);
  useEffect(() => {
    const prvni = najdiOdkazy(text)[0] ?? null;
    if (prvni === null) {
      setOdkaz(null);
      return;
    }
    const casovac = window.setTimeout(() => setOdkaz(prvni), 400);
    return () => window.clearTimeout(casovac);
  }, [text]);

  const ukazPocitadlo: boolean = zbyva <= 80;

  return (
    <form
      onSubmit={naSubmit}
      aria-label={popisek}
      className="min-w-0"
    >
      <label htmlFor={poleId} className="sr-only">
        {popisek}
      </label>
      {nabidky.length > 0 && (
        <ul
          role="listbox"
          aria-label="Koho označit"
          className="nabeh-nahoru posuvnik mb-2 max-h-56 origin-bottom overflow-y-auto rounded-xl border border-linka bg-povrch p-1.5 shadow-modal"
        >
          {nabidky.map((nabidka, index) => (
            <li key={nabidka.token}>
              <button
                type="button"
                role="option"
                aria-selected={index === vybrany}
                onMouseDown={(udalost) => udalost.preventDefault()}
                onClick={() => vloz(nabidka)}
                className={`flex min-h-[44px] w-full items-center rounded-lg px-2.5 text-left text-[13.5px] font-medium [touch-action:manipulation] ${
                  index === vybrany ? "bg-mlha font-semibold text-smrk" : "text-inkoust hover:bg-povrch-2"
                }`}
              >
                {nabidka.popisek}
              </button>
            </li>
          ))}
        </ul>
      )}
      {odkaz !== null && odkaz !== zavrenyNahled ? (
        <NahledPredOdeslanim key={odkaz} url={odkaz} onZavrit={() => setZavrenyNahled(odkaz)} />
      ) : null}
      <TacekPriloh soubory={soubory} disabled={odesilaSe} onOdebrat={naOdebratSoubor} />
      <div className="flex min-w-0 items-end gap-1 rounded-3xl border border-linka bg-povrch py-[1px] pl-1 pr-1.5 transition-colors has-[textarea:focus]:border-pole motion-reduce:transition-none min-[90rem]:gap-2 min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:bg-transparent min-[90rem]:p-0">
        <TlacitkoPrilohy disabled={odesilaSe} onVyber={naVyberSouboru} />
        <textarea
          id={poleId}
          ref={poleRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setVybrany(0);
            setOtevreno(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={naKlavesu}
          onPaste={(e) => {
            const vlozene = [...e.clipboardData.files];
            if (vlozene.length === 0) return;
            e.preventDefault();
            naVyberSouboru(vlozene);
          }}
          rows={1}
          maxLength={MAX_DELKA + 50}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          autoFocus={autoFocus}
          aria-describedby={ukazPocitadlo ? pocitadloId : undefined}
          className="posuvnik block min-h-[44px] min-w-0 flex-1 resize-none overflow-y-hidden border-0 border-transparent bg-transparent px-1.5 py-[11px] text-base leading-[22px] text-inkoust caret-smrk placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-ink-4 min-[90rem]:border min-[90rem]:min-h-10 min-[90rem]:rounded-[10px] min-[90rem]:bg-povrch-2 min-[90rem]:px-[13px] min-[90rem]:py-[9px] min-[90rem]:text-[13px] min-[90rem]:leading-5 min-[90rem]:placeholder:text-ink-3 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!muze}
          title={odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu"}
          aria-label={odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu"}
          className="nahled-press relative my-[4px] inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-smrk text-povrch before:absolute before:-inset-1 before:content-[''] transition-opacity min-[90rem]:my-0 min-[90rem]:size-10 min-[90rem]:bg-akcent [touch-action:manipulation] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Ikona nazev="arrow-up" className="size-4" />
          <span className="sr-only">{odesilaSe ? "Posílám…" : "Poslat"}</span>
        </button>
      </div>
      {ukazPocitadlo && (
        <span
          id={pocitadloId}
          role="status"
          className={`mt-1 block min-w-0 truncate px-1 text-[12px] font-semibold ${
            zbyva < 0 ? "text-red-800" : "text-inkoust/60"
          }`}
          style={{ overflowWrap: "anywhere" }}
        >
          {zbyva < 0
            ? `O ${Math.abs(zbyva)} znaků přes limit`
            : `Zbývá ${zbyva} z ${MAX_DELKA}`}
        </span>
      )}
      {chybaSouboru !== null && (
        <p role="alert" className="mt-1 min-w-0 break-words px-1 text-[13px] font-semibold text-akcent">
          {chybaSouboru}
        </p>
      )}
      {chyba !== null && (
        <p role="alert" className="mt-1 min-w-0 break-words px-1 text-[13px] font-semibold text-akcent">
          {chyba}
        </p>
      )}
    </form>
  );
}
