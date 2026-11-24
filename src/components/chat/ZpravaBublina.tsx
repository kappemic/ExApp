import { useEffect, useId, useRef, useState, type JSX } from "react";
import type { ApiZprava } from "../../lib/diskuze-api";
import { najdiOdkazy } from "../../shared/odkazy";
import { useNahledOdkazu } from "../../lib/nahled-odkazu";
import { formatCasBubliny, formatCasKratce, formatCasVlakna } from "../../lib/format-cas";
import AvatarKruh from "../AvatarKruh";
import ZnackaOrganizatora from "../ZnackaOrganizatora";
import { TlacitkoProfilu } from "../clen/ClenProfil";
import NahledOdkazu from "./NahledOdkazu";
import PrilohyZpravy from "./PrilohyZpravy";
import TextZpravy from "./TextZpravy";

export interface ZpravaBublinaProps {
  zprava: ApiZprava;
  /** Zobrazované jméno autora (řeší i dlouhý nick / e-mail, viz break-ui). */
  autorPopisek: string;
  /** Author created this expedition. Off in general, private, and group chats. */
  jeOrganizator?: boolean;
  jeMoje: boolean;
  muzeMazat: boolean;
  mazeSe: boolean;
  /** Bubble is folding away; the row stays mounted until the motion ends. */
  odchazi?: boolean;
  onSmazat: (id: string) => void;
  /** Opens the chat lightroom on this image instead of a new tab. */
  onOtevriObrazek?: (prilohaId: string) => void;
  /**
   * Later image-only messages from the same short burst. Their photos
   * join this bubble's mosaic; each message keeps its own delete.
   */
  dalsiZpravy?: readonly ApiZprava[];
  /** When set, decides delete for every message in the burst. */
  lzeSmazat?: (id: string) => boolean;
  mazeId?: string | null;
  /**
   * Hide the name row when the previous message is from the same author.
   * The name stays on the first message of a run.
   */
  skrytHlavicku?: boolean;
  /** Space before a new author. Continuation rows stay tight. */
  odstup?: boolean;
  /**
 * `bublina` is the private and group chat. `zapis` is the expedition
 * thread: a full-width row. Actions sit in a hover menu.
   */
  podoba?: "bublina" | "zapis";
  /** Hledaný text se v bublině zvýrazní. */
  hledat?: string;
  /** Global chats render @tokens as labels. */
  ukazZminky?: boolean;
  jmena?: Readonly<Record<string, string>>;
}

/**
 * Vytáhne iniciály z jména po grapheme clusterech (emoji-safe).
 * Bere první a poslední slovo, max 2 znaky. Fallback „?“ pro prázdné.
 * Zrcadleno v tests/diskuze-box.test.tsx (pure kopie).
 */
export function inicialyProJmeno(jmeno: string): string {
  const ciste: string = jmeno.trim();
  if (ciste.length === 0) return "?";
  const slova: string[] = ciste.split(/\s+/).filter((s) => s.length > 0);
  const vybrane: string[] =
    slova.length === 1 ? [slova[0]] : [slova[0], slova[slova.length - 1]];
  const prvniZnak = (slovo: string): string => {
    try {
      const segmenter = new Intl.Segmenter("cs", { granularity: "grapheme" });
      const prvni = segmenter.segment(slovo)[Symbol.iterator]().next();
      if (!prvni.done && typeof prvni.value.segment === "string") {
        return prvni.value.segment;
      }
    } catch {
      /* Intl.Segmenter není všude — fallback na první kódový bod níže. */
    }
    return Array.from(slovo)[0] ?? "?";
  };
  return vybrane
    .map((slovo) => prvniZnak(slovo).toUpperCase())
    .join("")
    .slice(0, 4);
}

/** Avatar u bubliny chatu: telefon barevný 32 px, počítač neutrální 26 px. */
function AvatarBubliny({ jmeno, url }: { jmeno: string; url: string | null | undefined }): JSX.Element {
  return (
    <>
      <span className="min-[90rem]:hidden">
        <AvatarKruh jmeno={jmeno} url={url} ton="barevny" velikost={32} />
      </span>
      <span className="hidden min-[90rem]:block">
        <AvatarKruh jmeno={jmeno} url={url} ton="cizi" velikost={26} />
      </span>
    </>
  );
}

/** Avatar v diskuzi výpravy: telefon barevný 32 px, počítač neutrální 30 px. */
function AvatarVlakna({ jmeno, url }: { jmeno: string; url: string | null | undefined }): JSX.Element {
  return (
    <>
      <span className="min-[90rem]:hidden">
        <AvatarKruh jmeno={jmeno} url={url} ton="barevny" velikost={32} />
      </span>
      <span className="hidden min-[90rem]:block">
        <AvatarKruh jmeno={jmeno} url={url} ton="cizi" velikost={30} />
      </span>
    </>
  );
}

/**
 * One thread row. `bublina` keeps the ink card (border-inkoust, bg-papir,
 * shadow-denik) for private and group chat. `zapis` is a full-width
 * expedition row: avatar, name and time, then the text. Hover reveals
 * a toolbar; the three-dot button opens the actions.
 * break-ui: avatar
 * shrink-0, text column min-w-0, overflow-wrap anywhere, actions shrink-0,
 * time. React escapes `{text}` — never inserted as HTML.
 */
/** Kolik odkazů z jedné zprávy dostane náhled. */
const MAX_NAHLEDU = 2;

export default function ZpravaBublina({
  zprava,
  autorPopisek,
  jeOrganizator = false,
  jeMoje,
  muzeMazat,
  mazeSe,
  odchazi = false,
  onSmazat,
  onOtevriObrazek,
  dalsiZpravy = [],
  lzeSmazat,
  mazeId = null,
  skrytHlavicku = false,
  odstup = false,
  podoba = "bublina",
  ukazZminky = false,
  jmena = {},
  hledat = "",
}: ZpravaBublinaProps): JSX.Element {
  const zapis: boolean = podoba === "zapis";
  const cas: string =
    zapis && !skrytHlavicku ? formatCasVlakna(zprava.createdAt) : formatCasBubliny(zprava.createdAt);
  const jeOptimisticka: boolean = zprava.id.startsWith("optimistic-");
  const svetlyText: boolean = jeMoje && !zapis;
  const celaDavka: readonly ApiZprava[] = [zprava, ...dalsiZpravy];
  const prilohyDavky = celaDavka.flatMap((polozka) =>
    polozka.prilohy.map((priloha) => ({
      priloha,
      optimisticka: polozka.id.startsWith("optimistic-") || priloha.id.startsWith("optimistic-"),
    })),
  );
  const jenFotky =
    celaDavka.every((polozka) => polozka.text.trim().length === 0) &&
    prilohyDavky.length > 0 &&
    prilohyDavky.every((polozka) => polozka.priloha.jeObrazek);
  const keSmazani = celaDavka.filter((polozka) => {
    if (polozka.id.startsWith("optimistic-")) return false;
    if (lzeSmazat !== undefined) return lzeSmazat(polozka.id);
    return polozka.id === zprava.id && muzeMazat;
  });
  const odkazy = najdiOdkazy(zprava.text).slice(0, MAX_NAHLEDU);
  // Zpráva, která je jen odkaz s náhledem, ukáže rovnou kartu.
  const prvniNahled = useNahledOdkazu(odkazy[0] ?? null);
  const jenKarta =
    odkazy.length === 1 && prvniNahled !== null && prvniNahled !== undefined && /^\S+$/.test(zprava.text.trim());
  const sKartou = odkazy.length > 0 && prvniNahled !== null;
  const siroka = !jenFotky && (sKartou || prilohyDavky.length > 0);
  const [menu, setMenu] = useState(false);
  const menuId = useId();
  const radekRef = useRef<HTMLLIElement>(null);
  const menuTlacitkoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    function venku(udalost: MouseEvent): void {
      if (!(udalost.target instanceof Node)) return;
      if (radekRef.current?.contains(udalost.target)) return;
      setMenu(false);
    }
    function klavesa(udalost: KeyboardEvent): void {
      if (udalost.key !== "Escape") return;
      setMenu(false);
      menuTlacitkoRef.current?.focus();
    }
    document.addEventListener("mousedown", venku);
    document.addEventListener("keydown", klavesa);
    return () => {
      document.removeEventListener("mousedown", venku);
      document.removeEventListener("keydown", klavesa);
    };
  }, [menu]);

  /** „Smazat“ pod řádkem, u dávky fotek jedno tlačítko na každou zprávu. */
  const tlacitkaSmazat = keSmazani.map((polozka) => {
    const mazeTuhle = (mazeSe && polozka.id === zprava.id) || mazeId === polozka.id;
    const popisek =
      polozka.text.trim().length > 0 ? polozka.text.slice(0, 60) : (polozka.prilohy[0]?.nazev ?? "fotky");
    return (
      <button
        key={polozka.id}
        type="button"
        onClick={() => {
          setMenu(false);
          onSmazat(polozka.id);
        }}
        disabled={mazeTuhle}
        aria-label={`Smazat zprávu: ${popisek}`}
        className="smazat-zpravu bez-prejeti inline-flex min-h-[44px] min-w-[44px] items-center rounded-md px-1 text-[13px] font-semibold text-akcent [touch-action:manipulation] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk disabled:opacity-60"
      >
        {mazeTuhle ? "Mažu…" : keSmazani.length > 1 ? `Smazat ${formatCasKratce(polozka.createdAt)}` : "Smazat"}
      </button>
    );
  });

  const telo = (
    <>
      {zprava.text.length > 0 && !jenKarta && (
        <p
          className={`min-w-0 break-words ${zapis ? `text-[13.5px] text-mech min-[90rem]:text-[13px] min-[90rem]:leading-[19px] ${keSmazani.length > 0 ? "max-[90rem]:pr-5" : ""}` : "text-[13.5px] leading-5"}`}
          style={{ overflowWrap: "anywhere" }}
        >
          <TextZpravy text={zprava.text} svetlyText={svetlyText} ukazZminky={ukazZminky} jmena={jmena} hledat={hledat} />
          {jeOptimisticka && <span className="sr-only"> (odesílá se…)</span>}
        </p>
      )}
      {zprava.text.length === 0 && jeOptimisticka && <span className="sr-only">odesílá se…</span>}
      {jenKarta ? <span className="sr-only">{zprava.text}</span> : null}
      {odkazy.length > 0 || prilohyDavky.length > 0 ? (
        <div className={`flex w-full min-w-0 flex-col gap-1.5 ${zprava.text.length > 0 && !jenKarta ? "mt-2" : ""} ${zapis ? "max-w-[360px]" : ""}`}>
          {odkazy.map((url) => (
            <NahledOdkazu key={url} url={url} />
          ))}
          <PrilohyZpravy prilohy={prilohyDavky} onOtevriObrazek={onOtevriObrazek} />
        </div>
      ) : null}
    </>
  );

  if (zapis) {
    return (
      <li
        ref={radekRef}
        className={`zprava-radek group relative grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          odchazi ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        } ${skrytHlavicku ? "-mt-1.5" : odstup ? "" : ""}`}
        aria-hidden={odchazi ? true : undefined}
      >
        <div
          className={`relative flex min-h-0 min-w-0 items-start gap-2.5 ${
            jeOptimisticka ? "opacity-70" : ""
          } ${odchazi ? "-translate-y-1" : ""}`}
        >
          <div className="relative flex w-8 shrink-0 justify-center min-[90rem]:w-[30px]">
            {skrytHlavicku ? (
              cas.length > 0 ? (
                <time
                  dateTime={zprava.createdAt}
                  className="sr-only"
                >
                  {cas}
                </time>
              ) : null
            ) : zprava.autorId !== null ? (
              <TlacitkoProfilu
                id={zprava.autorId}
                jmeno={autorPopisek}
                avatarUrl={zprava.authorAvatarUrl}
                className="h-8 w-8 shrink-0 p-0 min-h-8!"
              >
                <AvatarVlakna jmeno={autorPopisek} url={zprava.authorAvatarUrl} />
              </TlacitkoProfilu>
            ) : (
              <AvatarVlakna jmeno={autorPopisek} url={zprava.authorAvatarUrl} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 max-[90rem]:rounded-[14px] max-[90rem]:bg-povrch max-[90rem]:p-3 min-[90rem]:gap-0.5">
            {!skrytHlavicku && (
              <div className="flex min-w-0 items-baseline justify-between gap-2 min-[90rem]:justify-start min-[90rem]:gap-[7px]">
                {zprava.autorId !== null ? (
                  <TlacitkoProfilu
                    id={zprava.autorId}
                    jmeno={autorPopisek}
                    avatarUrl={zprava.authorAvatarUrl}
                    className="min-h-0! w-auto min-w-0 flex-none truncate bg-transparent p-0 text-[12.5px] font-semibold text-inkoust"
                  >
                    <span title={autorPopisek} style={{ overflowWrap: "anywhere" }}>
                      {autorPopisek}
                      {jeOrganizator ? <ZnackaOrganizatora /> : null}
                    </span>
                  </TlacitkoProfilu>
                ) : (
                  <span
                    title={autorPopisek}
                    className="min-w-0 truncate text-[12.5px] font-semibold text-inkoust"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {autorPopisek}
                    {jeOrganizator ? <ZnackaOrganizatora /> : null}
                  </span>
                )}
                {cas.length > 0 && (
                  <time dateTime={zprava.createdAt} className="shrink-0 text-[11px] text-ink-3 min-[90rem]:text-[10.5px] min-[90rem]:text-ink-5">
                    {cas}
                  </time>
                )}
              </div>
            )}
            {telo}
            {jeOptimisticka && (
              <span role="status" className="text-[12px] font-semibold text-mech">
                Odesílá se…
              </span>
            )}
            {menu && keSmazani.length > 0 ? (
              <div id={menuId} className="nabeh-dolu flex flex-wrap items-center gap-x-2">
                {tlacitkaSmazat}
              </div>
            ) : null}
          </div>
          {keSmazani.length > 0 && (
            <div
              className="zprava-nastroje absolute right-0 top-0 z-10 max-[90rem]:top-6"
              data-otevreno={menu ? "true" : "false"}
            >
              <button
                ref={menuTlacitkoRef}
                type="button"
                aria-label="Další akce se zprávou"
                aria-expanded={menu}
                aria-controls={menu ? menuId : undefined}
                onClick={() => setMenu((otevreno) => !otevreno)}
                className="bez-prejeti inline-flex h-8 w-8 items-center justify-center rounded-md text-mech hover:bg-mlha hover:text-inkoust [touch-action:manipulation]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <circle cx="5" cy="12" r="1.15" />
                  <circle cx="12" cy="12" r="1.15" />
                  <circle cx="19" cy="12" r="1.15" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <li
      ref={radekRef}
      className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
        odchazi ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      } ${skrytHlavicku ? (zapis ? "mt-1" : "") : odstup ? (zapis ? "mt-3" : "mt-4") : ""}`}
      aria-hidden={odchazi ? true : undefined}
    >
      <div
        className={`flex min-h-0 overflow-hidden ${zapis ? "items-start" : "items-end"} motion-safe:transition-transform motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          zapis ? "" : "gap-2 min-[90rem]:gap-[9px]"
        } ${
          zapis || !jeMoje ? "flex-row" : "flex-row-reverse"
        } ${
          odchazi
            ? zapis
              ? "-translate-y-1"
              : jeMoje
                ? "translate-x-3"
                : "-translate-x-3"
            : "translate-x-0 translate-y-0"
        }`}
      >
      {zapis || jeMoje ? null : skrytHlavicku ? (
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 grow-0 basis-8 self-end min-[90rem]:h-[26px] min-[90rem]:w-[26px] min-[90rem]:basis-[26px]"
        />
      ) : zprava.autorId !== null ? (
        <TlacitkoProfilu
          id={zprava.autorId}
          jmeno={autorPopisek}
          avatarUrl={zprava.authorAvatarUrl}
          className="h-8 w-8 shrink-0 self-start p-0 min-h-8! min-[90rem]:mb-4 min-[90rem]:h-[26px] min-[90rem]:w-[26px] min-[90rem]:min-h-[26px]! min-[90rem]:self-end"
        >
          <AvatarBubliny jmeno={autorPopisek} url={zprava.authorAvatarUrl} />
        </TlacitkoProfilu>
      ) : (
        <span className="self-start min-[90rem]:mb-4 min-[90rem]:self-end">
          <AvatarBubliny jmeno={autorPopisek} url={zprava.authorAvatarUrl} />
        </span>
      )}

      <div data-akce={menu ? "true" : "false"} className={`min-w-0 ${jenFotky ? `bublina-sloupec relative flex w-[min(280px,85%)] flex-col gap-1 min-[90rem]:w-[min(320px,85%)] ${jeMoje ? "items-end" : "items-start"}` : zapis ? "max-w-[min(36rem,100%)]" : `bublina-sloupec relative flex w-fit max-w-[min(280px,85%)] flex-col gap-1 min-[90rem]:max-w-[min(392px,85%)] ${siroka ? "!w-[min(280px,85%)] min-[90rem]:!w-[min(340px,85%)]" : ""} ${jeMoje ? "items-end" : "items-start"}`}`}>
        {!zapis && !jeMoje && !skrytHlavicku ? (
          <span className="hidden min-w-0 truncate text-[11px] font-semibold text-ink-3 min-[90rem]:block" style={{ overflowWrap: "anywhere" }}>
            {autorPopisek}
            {jeOrganizator ? <ZnackaOrganizatora /> : null}
          </span>
        ) : null}
        <div
          onClick={(udalost) => {
            // Klepnutí na bublinu ukáže Smazat pod ní. Odkazy a fotky mají vlastní akci.
            if (keSmazani.length === 0) return;
            if (udalost.target instanceof Element && udalost.target.closest("a, button") !== null) return;
            if ((window.getSelection()?.toString() ?? "").length > 0) return;
            setMenu((otevreno) => !otevreno);
          }}
          className={
            zapis
              ? `w-fit max-w-full rounded-2xl text-inkoust ${
                  jeMoje ? "bg-okr/25" : "border border-pole bg-papir"
                } ${jenFotky ? "p-1" : "px-3 py-2"} ${jeOptimisticka ? "opacity-70" : ""}`
              : `flex max-w-full flex-col gap-1 rounded-2xl min-[90rem]:block min-[90rem]:rounded-[14px] ${
                  siroka || jenFotky ? "w-full" : ""
                } ${jenFotky || jenKarta ? "p-1" : siroka ? "p-2.5 min-[90rem]:p-2" : "p-3 min-[90rem]:px-[13px] min-[90rem]:py-[9px]"
                } ${jeMoje ? "rounded-br-[4px] bg-smrk text-povrch min-[90rem]:rounded-br-[14px] min-[90rem]:rounded-tr-[4px]" : "rounded-bl-[4px] bg-povrch text-inkoust min-[90rem]:rounded-bl-[14px] min-[90rem]:rounded-tl-[4px] min-[90rem]:bg-povrch-2"} ${
                  jeOptimisticka ? "opacity-70" : ""
                }`
          }
        >
          {!zapis && !jeMoje && !skrytHlavicku ? (
            <span aria-hidden="true" className="min-w-0 truncate text-[11.5px] font-semibold text-ink-3 min-[90rem]:hidden">
              {autorPopisek}
            </span>
          ) : null}
          {!skrytHlavicku && zapis && (
            <div className={zapis ? "flex min-w-0 items-baseline gap-1.5" : "flex min-w-0 items-baseline justify-between gap-2"}>
              {zprava.autorId !== null ? (
                <TlacitkoProfilu
                  id={zprava.autorId}
                  jmeno={autorPopisek}
                  avatarUrl={zprava.authorAvatarUrl}
                  className={`min-w-0 truncate bg-transparent p-0 ${
                    zapis
                      ? "min-h-0! w-auto flex-none text-[13px] font-semibold leading-tight"
                      : "min-h-[44px] flex-1 text-sm font-bold lg:text-[12px]"
                  } ${svetlyText ? "text-papir/90" : zapis ? "text-inkoust" : "text-inkoust/70"}`}
                >
                  <span title={autorPopisek} style={{ overflowWrap: "anywhere" }}>
                    {autorPopisek}
                    {jeOrganizator ? <ZnackaOrganizatora /> : null}
                  </span>
                </TlacitkoProfilu>
              ) : (
                <span
                  title={autorPopisek}
                  className={`min-w-0 truncate text-sm ${
                    zapis ? "w-auto flex-none text-[13px] font-semibold leading-tight" : "flex-1 font-bold lg:text-[12px]"
                  } ${svetlyText ? "text-papir/90" : zapis ? "text-inkoust" : "text-inkoust/70"}`}
                  style={{ overflowWrap: "anywhere" }}
                >
                  {autorPopisek}
                  {jeOrganizator ? <ZnackaOrganizatora /> : null}
                </span>
              )}
              {cas.length > 0 && (
                <time
                  dateTime={zprava.createdAt}
                  className={`shrink-0 ${
                    zapis ? "text-[12px] leading-tight" : "text-[13px]"
                  } ${svetlyText ? "text-papir/75" : zapis ? "text-mech" : "text-inkoust/55"}`}
                >
                  {cas}
                </time>
              )}
            </div>
          )}
          {(skrytHlavicku || !zapis) && cas.length > 0 && (
            <span className="sr-only">
              <time dateTime={zprava.createdAt}>{cas}</time>
            </span>
          )}
          {telo}
          {!zapis && cas.length > 0 ? (
            <time
              aria-hidden="true"
              dateTime={zprava.createdAt}
              className={`text-[11px] min-[90rem]:hidden ${jenFotky || jenKarta ? "px-1.5 pb-1" : ""} ${jeMoje ? "text-[#d5dcc6]" : "text-ink-3"}`}
            >
              {cas}
            </time>
          ) : null}
        </div>
        <div className={`bublina-pata flex max-w-full flex-wrap items-center gap-x-2 ${jeMoje ? "flex-row-reverse" : ""}`}>
          {cas.length > 0 ? (
            <time aria-hidden="true" dateTime={zprava.createdAt} className="hidden text-[10px] font-medium text-ink-5 min-[90rem]:block">
              {cas}
            </time>
          ) : null}
          {jeOptimisticka ? (
            <span role="status" className="text-[12px] font-semibold text-inkoust/55">
              Odesílá se…
            </span>
          ) : tlacitkaSmazat.length > 0 ? (
            <div className="bublina-akce">
              <div className="flex flex-wrap items-center gap-x-2">{tlacitkaSmazat}</div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </li>
  );
}
