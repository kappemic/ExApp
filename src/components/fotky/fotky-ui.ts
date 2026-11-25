/**
 * Shared class fragments for Fotky flows (emil-design-eng).
 * Transitions: transform + opacity only; ~160ms ease-out; fine-pointer hover gated.
 */

export const FOTKY_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk";

/** Press feedback on buttons, tiles, disclosure rows */
export const fotkyStisk =
  "touch-manipulation select-none transition-[transform,opacity] duration-[160ms] ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

export const fotkyHoverOpacity =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90";

export const fotkyHoverBgLinka =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60";

export const fotkyHoverBgPapir =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-papir/90";

export const fotkyHoverBgSmrk =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-smrk/10";

export const fotkyTlacitkoZaklad = `${fotkyStisk} inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${FOTKY_FOCUS}`;

/** Primary action — Nahrát (pen brand / smrk). */
export const fotkyTlacitkoPrimarni = `${fotkyTlacitkoZaklad} ${fotkyHoverOpacity} gap-1.5 rounded-xl bg-smrk px-3.5 text-sm font-semibold text-papir disabled:opacity-60`;

/** Secondary outline — Přidat album, Stáhnout. */
export const fotkyTlacitkoSekundarni = `${fotkyTlacitkoZaklad} ${fotkyHoverBgSmrk} gap-1.5 rounded-xl border border-linka bg-povrch px-3.5 text-sm font-semibold text-inkoust disabled:opacity-60`;

/** Nevratná akce — Smazat vybrané. Terakota patří jen mazání. */
export const fotkyTlacitkoSmazat = `${fotkyTlacitkoZaklad} ${fotkyHoverOpacity} gap-1.5 rounded-xl bg-akcent px-3.5 text-sm font-semibold text-papir disabled:opacity-60`;

/** Slabší mazání vedle `fotkyTlacitkoSmazat` — Smazat vše. */
export const fotkyTlacitkoOdebrat = `${fotkyTlacitkoZaklad} ${fotkyHoverOpacity} gap-1.5 rounded-xl border border-transparent bg-[#fbede7] px-3.5 text-sm font-semibold text-akcent disabled:opacity-60`;

/** Filter chips on /fotky (pen: selected = brand fill). */
export const fotkyChipZaklad =
  "inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium";

export const fotkyChipVybrany = `${fotkyChipZaklad} border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust`;

export const fotkyChipNeaktivni = `${fotkyChipZaklad} border-linka bg-povrch font-medium text-mech min-[90rem]:bg-transparent`;

/** Collapsed disclosure trigger — compact width, not full bar */
export const fotkyDisclosureSpoustec = `bez-prejeti inline-flex min-h-[44px] min-w-[44px] w-auto max-w-full touch-manipulation select-none items-center justify-center gap-2 rounded-xl border border-pole bg-povrch px-3 text-sm font-semibold text-inkoust transition-colors ${fotkyHoverBgSmrk} ${FOTKY_FOCUS}`;

/** Full-width panel under the trigger row (upload flow) */
export const fotkyDisclosureObsah =
  "fotky-disclosure-enter w-full min-w-0 max-w-xl origin-top-left rounded-md border border-linka bg-papir p-2.5 shadow-denik motion-reduce:animate-none sm:p-3";

/** Floating panel anchored to the Nové album trigger — keeps sibling triggers on one row */
export const fotkyDisclosurePopover =
  "fotky-disclosure-enter absolute left-0 top-full z-20 mt-1.5 w-[min(calc(100vw-2rem),20rem)] min-w-[min(100%,16rem)] max-w-xl origin-top-left rounded-md border border-linka bg-papir p-2.5 shadow-denik motion-reduce:animate-none sm:p-3";

/** Trigger row — horizontal, compact */
export const fotkyNahravaciSpoustice =
  "flex flex-wrap items-center gap-2 sm:gap-2.5";

/** Collapsed upload section — no heavy chrome when triggers only */
export const fotkyNahravaciObalSbaleny = "";
/** Expanded: minimal chrome; borders live on disclosure panels, not an empty wrapper */
export const fotkyNahravaciObalRozbaleny = "flex flex-col gap-2";

/** Album grid toolbar — a phone has no app header, the computer one is 76 px tall. */
export const fotkyAlbumToolbarZaklad =
  "sticky top-[calc(var(--stavova-lista)+0.5rem)] z-30 mb-4 flex w-full min-w-0 flex-col gap-2.5 rounded-2xl border bg-povrch min-[90rem]:top-[84px] transition-[transform,opacity] duration-[160ms] ease-out motion-reduce:transition-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2";

/** Action clusters inside album toolbars (restore / delete / download) */
export const fotkyAkceSkupina = "flex flex-wrap items-center gap-1.5 sm:gap-2";

/** Trash management — equal two-column grid on a phone, one wrapping row from sm. */
export const fotkyKosAkceObal =
  "grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2";

/** Inset focus so the photo gap does not jump when a tile is focused. */
const FOTKY_FOCUS_DLAZDICE =
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-smrk";

/**
 * Photo tile. `bez-prejeti` opts out of the global ink-wipe hover.
 * Hover lays a black film over the photo. Press scale stays on :active.
 */
const fotkyHoverCerna =
  "after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:bg-black after:opacity-0 after:transition-opacity after:duration-[160ms] after:ease-out after:content-[''] motion-reduce:after:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:after:opacity-15";

export const fotkyMrizkaDlazdice = `bez-prejeti ${fotkyStisk} ${fotkyHoverCerna} relative block h-full w-full min-h-[44px] min-w-[44px] overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none ${FOTKY_FOCUS_DLAZDICE}`;

/** Lightbox prev/next. Chevron only, slightly see-through, no frame. */
export const fotkyLightboxNavTlacitko = `bez-prejeti nahled-press ${fotkyTlacitkoZaklad} pointer-events-auto h-11 w-11 shrink-0 border-0 bg-transparent p-0 text-papir/70 shadow-none disabled:pointer-events-none disabled:opacity-25`;

const fotkyLightboxIkonaZaklad = `bez-prejeti nahled-press ${fotkyStisk} inline-flex h-10 w-8 min-h-10 min-w-8 shrink-0 items-center justify-center border-0 p-0 shadow-none disabled:opacity-40 ${FOTKY_FOCUS}`;

/** Lightbox chrome: light glyph, no paper chip. */
export const fotkyLightboxIkona = `${fotkyLightboxIkonaZaklad} bg-transparent text-papir drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]`;

/** Icon row in the lightbox. Stays on one line so glyphs do not wrap over the photo. */
export const fotkyLightboxRadek =
  "pointer-events-auto flex flex-nowrap items-center justify-end gap-0";

/** Loupe while zoom mode is on: paper disc, ink glyph. Not combined with the idle icon colors. */
export const fotkyLightboxZoom = `${fotkyLightboxIkonaZaklad} rounded-full bg-papir text-inkoust shadow-[0_0_0_2px_rgba(245,242,234,0.95)]`;

export const fotkyLightboxPocet =
  "text-sm font-bold text-papir drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]";

/** Destructive album action tucked under upload disclosure */
export const fotkySmazatAlbumDiscreet = `${fotkyStisk} ${fotkyHoverOpacity} ${FOTKY_FOCUS} min-h-[44px] max-w-full truncate rounded-md px-2 py-2 text-left text-xs font-semibold text-inkoust/45 underline decoration-inkoust/25 underline-offset-[3px] transition-[transform,opacity,color,decoration-color] duration-[160ms] ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:text-jantar [@media(hover:hover)_and_(pointer:fine)]:hover:decoration-jantar/50`;
