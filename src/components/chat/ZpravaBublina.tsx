import { useEffect, useId, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import type { ApiZprava } from "../../lib/diskuze-api";
import { castiZpravy } from "../../shared/zminky";
import { formatCasKratce, formatJenCas } from "../../lib/format-cas";
import { formatVelikostiPrilohy, urlPrilohyZpravy } from "../../lib/prilohy-zpravy";
import type { ApiZpravaPriloha } from "../../shared/api-types";
import AvatarKruh from "../AvatarKruh";
import ZnackaOrganizatora from "../ZnackaOrganizatora";
import { TlacitkoProfilu } from "../clen/ClenProfil";
import PostupnaFotka from "../fotky/PostupnaFotka";

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

function PrilohyZpravy({
  prilohy,
  svetlyText,
  jeOptimisticka,
  onOtevriObrazek,
}: {
  prilohy: readonly { priloha: ApiZpravaPriloha; optimisticka: boolean }[];
  svetlyText: boolean;
  jeOptimisticka: boolean;
  onOtevriObrazek?: (prilohaId: string) => void;
}): JSX.Element | null {
  if (prilohy.length === 0) return null;
  const odkaz: string = svetlyText
    ? "text-papir underline decoration-papir/50 underline-offset-2"
    : "text-inkoust underline decoration-inkoust/40 underline-offset-2";
  const obrazky = prilohy.filter((polozka) => polozka.priloha.jeObrazek);
  const soubory = prilohy.filter((polozka) => !polozka.priloha.jeObrazek);
  const vicFotek = obrazky.length > 1;
  return (
    <div className="mt-1.5 w-full max-w-full">
      {obrazky.length > 0 ? (
        <ul
          className={
            vicFotek
              ? "grid w-full grid-cols-2 gap-0.5"
              : "flex w-full flex-col gap-1.5"
          }
        >
          {obrazky.map((polozka, poradi) => {
            const priloha = polozka.priloha;
            const siroka = vicFotek && poradi === obrazky.length - 1 && obrazky.length % 2 === 1;
            if (polozka.optimisticka || jeOptimisticka) {
              return (
                <li
                  key={priloha.id}
                  className={`min-w-0 truncate text-[13px] font-semibold ${siroka ? "col-span-2" : ""}`}
                  title={priloha.nazev}
                >
                  {priloha.nazev}
                </li>
              );
            }
            const adresa: string = urlPrilohyZpravy(priloha.id);
            const nahled = (
              <PostupnaFotka
                src={adresa}
                alt={vicFotek ? "" : priloha.nazev}
                className={
                  vicFotek
                    ? `h-full w-full ${siroka ? "aspect-[2/1]" : "aspect-square"} object-cover`
                    : "max-h-56 w-full rounded-md border border-current/20 object-contain"
                }
              />
            );
            const obal = `block min-w-0 overflow-hidden [touch-action:manipulation] active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
              vicFotek ? "w-full rounded-[4px]" : "w-full"
            }`;
            if (onOtevriObrazek !== undefined) {
              return (
                <li key={priloha.id} className={siroka ? "col-span-2 min-w-0" : "min-w-0"}>
                  <button
                    type="button"
                    onClick={() => onOtevriObrazek(priloha.id)}
                    className={obal}
                    aria-label={`Otevřít fotku ${poradi + 1} z ${obrazky.length}, ${priloha.nazev}`}
                  >
                    {nahled}
                  </button>
                </li>
              );
            }
            return (
              <li key={priloha.id} className={siroka ? "col-span-2 min-w-0" : "min-w-0"}>
                <a href={adresa} target="_blank" rel="noopener noreferrer" className={obal}>
                  {nahled}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
      {soubory.length > 0 ? (
        <ul className="mt-1.5 flex min-w-0 flex-col gap-1.5">
          {soubory.map((polozka) => {
            const priloha = polozka.priloha;
            const velikost: string = formatVelikostiPrilohy(priloha.bajty);
            if (polozka.optimisticka || jeOptimisticka) {
              return (
                <li key={priloha.id} className="min-w-0 truncate text-[13px] font-semibold" title={priloha.nazev}>
                  {priloha.nazev}
                  <span className="ml-1 font-normal tabular-nums opacity-80">{velikost}</span>
                </li>
              );
            }
            return (
              <li key={priloha.id} className="min-w-0">
                <a
                  href={urlPrilohyZpravy(priloha.id)}
                  className={`inline-flex min-h-[44px] max-w-full min-w-0 items-center gap-1.5 text-[13px] font-semibold [touch-action:manipulation] ${odkaz}`}
                >
                  <span className="min-w-0 truncate" title={priloha.nazev}>
                    {priloha.nazev}
                  </span>
                  <span className="shrink-0 font-normal tabular-nums opacity-80">{velikost}</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One thread row. `bublina` keeps the ink card (border-inkoust, bg-papir,
 * shadow-denik) for private and group chat. `zapis` is a full-width
 * expedition row: avatar, name and time, then the text. Hover reveals
 * a toolbar; the three-dot button opens the actions.
 * break-ui: avatar
 * shrink-0, text column min-w-0, overflow-wrap anywhere, actions shrink-0,
 * time tabular-nums. React escapes `{text}` — never inserted as HTML.
 */
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
}: ZpravaBublinaProps): JSX.Element {
  const zapis: boolean = podoba === "zapis";
  const cas: string =
    zapis && skrytHlavicku ? formatJenCas(zprava.createdAt) : formatCasKratce(zprava.createdAt);
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
  const [menu, setMenu] = useState(false);
  const [kotva, setKotva] = useState<{ top: number; right: number } | null>(null);
  const menuId = useId();
  const nastrojeRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    function venku(udalost: MouseEvent): void {
      if (!(udalost.target instanceof Node)) return;
      if (nastrojeRef.current?.contains(udalost.target)) return;
      if (menuRef.current?.contains(udalost.target)) return;
      setMenu(false);
    }
    function klavesa(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", venku);
    document.addEventListener("keydown", klavesa);
    return () => {
      document.removeEventListener("mousedown", venku);
      document.removeEventListener("keydown", klavesa);
    };
  }, [menu]);

  const telo = (
    <>
      {zprava.text.length > 0 && (
        <p
          className={`min-w-0 break-words text-base ${zapis ? "leading-snug" : "mt-1 leading-relaxed lg:text-[15px]"}`}
          style={{ overflowWrap: "anywhere" }}
        >
          {ukazZminky
            ? castiZpravy(zprava.text, jmena).map((cast, index) =>
                cast.druh === "text" ? (
                  <span key={index}>{cast.text}</span>
                ) : (
                  <span key={index} className={svetlyText ? "font-semibold text-jantar" : "font-semibold text-smrk"}>
                    @{cast.popisek}
                  </span>
                ),
              )
            : (
                <>{zprava.text}</>
              )}
          {jeOptimisticka && <span className="sr-only"> (odesílá se…)</span>}
        </p>
      )}
      {zprava.text.length === 0 && jeOptimisticka && <span className="sr-only">odesílá se…</span>}
      <PrilohyZpravy
        prilohy={prilohyDavky}
        svetlyText={svetlyText}
        jeOptimisticka={jeOptimisticka}
        onOtevriObrazek={onOtevriObrazek}
      />
    </>
  );

  if (zapis) {
    return (
      <li
        className={`zprava-radek group relative grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          odchazi ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        } ${skrytHlavicku ? "" : odstup ? "mt-3" : ""}`}
        aria-hidden={odchazi ? true : undefined}
      >
        <div
          className={`relative flex min-h-0 min-w-0 items-start gap-3 rounded-md px-1 hover:bg-mlha/80 ${
            skrytHlavicku ? "py-0" : "py-1"
          } ${
            jeOptimisticka ? "opacity-70" : ""
          } ${odchazi ? "-translate-y-1" : ""}`}
        >
          <div className="relative flex w-10 shrink-0 justify-center pt-0.5">
            {skrytHlavicku ? (
              cas.length > 0 ? (
                <time
                  dateTime={zprava.createdAt}
                  className="zprava-cas pt-0.5 text-center text-[11px] leading-tight whitespace-nowrap text-mech tabular-nums"
                >
                  {cas}
                </time>
              ) : null
            ) : zprava.autorId !== null ? (
              <TlacitkoProfilu
                id={zprava.autorId}
                jmeno={autorPopisek}
                avatarUrl={zprava.authorAvatarUrl}
                className="h-10 w-10 shrink-0 p-0 min-h-10!"
              >
                <AvatarKruh jmeno={autorPopisek} url={zprava.authorAvatarUrl} ton="cizi" />
              </TlacitkoProfilu>
            ) : (
              <AvatarKruh jmeno={autorPopisek} url={zprava.authorAvatarUrl} ton="cizi" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {!skrytHlavicku && (
              <div className="flex min-w-0 items-baseline gap-2">
                {zprava.autorId !== null ? (
                  <TlacitkoProfilu
                    id={zprava.autorId}
                    jmeno={autorPopisek}
                    avatarUrl={zprava.authorAvatarUrl}
                    className="min-h-0! w-auto min-w-0 flex-none truncate bg-transparent p-0 text-sm font-semibold leading-tight text-inkoust"
                  >
                    <span title={autorPopisek} style={{ overflowWrap: "anywhere" }}>
                      {autorPopisek}
                      {jeOrganizator ? <ZnackaOrganizatora /> : null}
                    </span>
                  </TlacitkoProfilu>
                ) : (
                  <span
                    title={autorPopisek}
                    className="min-w-0 truncate text-sm font-semibold leading-tight text-inkoust"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {autorPopisek}
                    {jeOrganizator ? <ZnackaOrganizatora /> : null}
                  </span>
                )}
                {cas.length > 0 && (
                  <time dateTime={zprava.createdAt} className="shrink-0 text-[12px] leading-tight text-mech tabular-nums">
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
          </div>
          {keSmazani.length > 0 && (
            <div
              ref={nastrojeRef}
              className="zprava-nastroje relative z-10 shrink-0 self-start"
              data-otevreno={menu ? "true" : "false"}
            >
              <button
                type="button"
                aria-label="Další akce se zprávou"
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-controls={menuId}
                onClick={(udalost) => {
                  const ramec = udalost.currentTarget.getBoundingClientRect();
                  const vyska = 52;
                  const dolu = ramec.bottom + 4 + vyska <= window.innerHeight;
                  setKotva({
                    top: dolu ? ramec.bottom + 4 : Math.max(8, ramec.top - vyska - 4),
                    right: Math.max(8, window.innerWidth - ramec.right),
                  });
                  setMenu((otevreno) => !otevreno);
                }}
                className="bez-prejeti inline-flex h-8 w-8 items-center justify-center rounded-md text-mech hover:bg-mlha hover:text-inkoust [touch-action:manipulation]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <circle cx="5" cy="12" r="1.15" />
                  <circle cx="12" cy="12" r="1.15" />
                  <circle cx="19" cy="12" r="1.15" />
                </svg>
              </button>
              {menu && kotva !== null &&
                createPortal(
                  <div
                    ref={menuRef}
                    id={menuId}
                    role="menu"
                    style={{ position: "fixed", top: kotva.top, right: kotva.right }}
                    className="z-50 min-w-44 rounded-lg border border-pole bg-papir py-1 shadow-denik"
                  >
                    {keSmazani.map((polozka) => {
                      const mazeTuhle = (mazeSe && polozka.id === zprava.id) || mazeId === polozka.id;
                      const popisek =
                        polozka.text.trim().length > 0
                          ? polozka.text.slice(0, 60)
                          : (polozka.prilohy[0]?.nazev ?? "fotky");
                      return (
                        <button
                          key={polozka.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenu(false);
                            onSmazat(polozka.id);
                          }}
                          disabled={mazeTuhle}
                          aria-label={`Smazat zprávu: ${popisek}`}
                          className="bez-prejeti flex min-h-[44px] w-full items-center px-3 text-left text-sm font-semibold text-red-800 [touch-action:manipulation] hover:bg-mlha disabled:opacity-60"
                        >
                          {mazeTuhle ? "Mažu…" : "Smazat zprávu"}
                        </button>
                      );
                    })}
                  </div>,
                  document.body,
                )}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <li
      className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
        odchazi ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      } ${skrytHlavicku ? (zapis ? "mt-1" : "mt-[-8px]") : odstup ? (zapis ? "mt-3" : "mt-4") : ""}`}
      aria-hidden={odchazi ? true : undefined}
    >
      <div
        className={`flex min-h-0 overflow-hidden ${zapis ? "items-start" : "items-end"} motion-safe:transition-transform motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          zapis ? "" : "gap-[9px]"
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
          className="h-[26px] w-[26px] shrink-0 grow-0 basis-[26px] self-end"
        />
      ) : zprava.autorId !== null ? (
        <TlacitkoProfilu
          id={zprava.autorId}
          jmeno={autorPopisek}
          avatarUrl={zprava.authorAvatarUrl}
          className="h-[26px] w-[26px] shrink-0 self-end p-0 min-h-[26px]!"
        >
          <AvatarKruh jmeno={autorPopisek} url={zprava.authorAvatarUrl} ton="cizi" velikost={26} />
        </TlacitkoProfilu>
      ) : (
        <span className="self-end">
          <AvatarKruh jmeno={autorPopisek} url={zprava.authorAvatarUrl} ton="cizi" velikost={26} />
        </span>
      )}

      <div className={`min-w-0 ${jenFotky ? "w-full max-w-[min(16rem,82%)]" : zapis ? "max-w-[min(36rem,100%)]" : `flex w-fit max-w-[min(392px,85%)] flex-col gap-1 ${jeMoje ? "items-end" : "items-start"}`}`}>
        {!zapis && !jeMoje && !skrytHlavicku ? (
          <span className="min-w-0 truncate text-[11px] font-semibold text-ink-3" style={{ overflowWrap: "anywhere" }}>
            {autorPopisek}
            {jeOrganizator ? <ZnackaOrganizatora /> : null}
          </span>
        ) : null}
        <div
          className={
            zapis
              ? `w-fit max-w-full rounded-2xl text-inkoust ${
                  jeMoje ? "bg-okr/25" : "border border-pole bg-papir"
                } ${jenFotky ? "p-1" : "px-3 py-2"} ${jeOptimisticka ? "opacity-70" : ""}`
              : `max-w-full rounded-[14px] ${
                  jenFotky ? "p-1.5" : "px-[13px] py-[9px]"
                } ${jeMoje ? "rounded-tr-[4px] bg-smrk text-papir" : "rounded-tl-[4px] bg-[#f1ede0] text-inkoust"} ${
                  jeOptimisticka ? "opacity-70" : ""
                }`
          }
        >
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
                  className={`shrink-0 tabular-nums ${
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
        </div>
        {!zapis && cas.length > 0 ? (
          <time aria-hidden="true" dateTime={zprava.createdAt} className="text-[10px] font-medium tabular-nums text-[#b3b8a4]">
            {cas}
          </time>
        ) : null}

        {(jeOptimisticka || keSmazani.length > 0) && (
        <div className={`flex items-center gap-2 ${zapis ? "" : "mt-1 min-h-[24px]"}`}>
          {jeOptimisticka ? (
            <span
              role="status"
              className={`text-[12px] font-semibold ${
                jeMoje && !zapis ? "text-right" : ""
              } ${zapis ? "text-mech" : "text-inkoust/55"}`}
            >
              Odesílá se…
            </span>
          ) : (
            keSmazani.map((polozka) => {
              const mazeTuhle = mazeSe && polozka.id === zprava.id || mazeId === polozka.id;
              const popisek = polozka.text.trim().length > 0
                ? polozka.text.slice(0, 60)
                : polozka.prilohy[0]?.nazev ?? "fotky";
              return (
                <button
                  key={polozka.id}
                  type="button"
                  onClick={() => onSmazat(polozka.id)}
                  disabled={mazeTuhle}
                  aria-label={`Smazat zprávu: ${popisek}`}
                  title={mazeTuhle ? "Mazání probíhá…" : "Smazat zprávu"}
                  className={`bez-prejeti inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 underline-offset-2 [touch-action:manipulation] hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 motion-safe:transition-colors ${
                    zapis
                      ? "rounded-lg text-[13px] font-semibold text-mech"
                      : "rounded-xl text-[12px] font-bold text-inkoust/55 underline"
                  }`}
                >
                  {mazeTuhle ? "Mažu…" : keSmazani.length > 1 ? `Smazat ${formatCasKratce(polozka.createdAt)}` : "Smazat"}
                </button>
              );
            })
          )}
        </div>
        )}
      </div>
      </div>
    </li>
  );
}
