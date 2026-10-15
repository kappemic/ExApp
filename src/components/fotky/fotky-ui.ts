/**
 * Shared class fragments for Fotky flows (emil-design-eng).
 * Transitions: transform + opacity only; ~160ms ease-out; fine-pointer hover gated.
 */

export const FOTKY_FOCUS =
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk";

/** Press feedback on buttons, tiles, disclosure rows */
export const fotkyStisk =
  "touch-manipulation select-none transition-[transform,opacity] duration-[160ms] ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

export const fotkyHoverOpacity =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90";

export const fotkyHoverScaleJemna =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.02]";

export const fotkyHoverBgLinka =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60";

export const fotkyHoverBgPapir =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-papir/90";

export const fotkyHoverBgJantar =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-jantar/10";

export const fotkyHoverBgJantarPlne =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-jantar/90";

export const fotkyHoverBgSmrk =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-smrk/10";

export const fotkyHoverBgSmrkPlne =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-smrk/90";

export const fotkyTlacitkoZaklad = `${fotkyStisk} inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${FOTKY_FOCUS}`;

/** Collapsed disclosure trigger — compact width, not full bar */
export const fotkyDisclosureSpoustec = `${fotkyTlacitkoZaklad} gap-2 rounded-md border-2 border-inkoust bg-papir px-3 text-sm font-bold text-inkoust shadow-denik w-auto max-w-full`;

/** Full-width panel under the trigger row (upload flow) */
export const fotkyDisclosureObsah =
  "fotky-disclosure-enter w-full min-w-0 max-w-xl origin-top-left rounded-md border-2 border-inkoust bg-papir p-2.5 shadow-denik motion-reduce:animate-none sm:p-3";

/** Floating panel anchored to the Nové album trigger — keeps sibling triggers on one row */
export const fotkyDisclosurePopover =
  "fotky-disclosure-enter absolute left-0 top-full z-20 mt-1.5 w-[min(calc(100vw-2rem),20rem)] min-w-[min(100%,16rem)] max-w-xl origin-top-left rounded-md border-2 border-inkoust bg-papir p-2.5 shadow-denik motion-reduce:animate-none sm:p-3";

/** Trigger row — horizontal, compact */
export const fotkyNahravaciSpoustice =
  "flex flex-wrap items-center gap-2 sm:gap-2.5";

/** Collapsed upload section — no heavy chrome when triggers only */
export const fotkyNahravaciObalSbaleny = "";
/** Expanded: minimal chrome; borders live on disclosure panels, not an empty wrapper */
export const fotkyNahravaciObalRozbaleny = "flex flex-col gap-2";

/** Album grid toolbar — sticks below AppHeader (h-16) */
export const fotkyAlbumToolbarZaklad =
  "sticky top-16 z-30 mb-3 flex w-full min-w-0 flex-col gap-1.5 rounded-lg border-2 bg-papir/95 shadow-denik backdrop-blur-sm transition-[transform,opacity] duration-[160ms] ease-out motion-reduce:transition-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2";

/** Action clusters inside album toolbars (restore / delete / download) */
export const fotkyAkceSkupina = "flex flex-wrap items-center gap-1.5 sm:gap-2";

/** Trash management — horizontal on sm+, two compact rows on mobile */
export const fotkyKosAkceObal =
  "flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2";

/** Tighter chrome when the toolbar is stuck on small viewports */
export const fotkyAlbumToolbarKompaktni =
  "max-sm:gap-1 max-sm:px-2 max-sm:py-1.5 max-sm:[&_[data-fotky-album-toolbar-nadpis]]:text-xs max-sm:[&_[data-fotky-album-akce-row]]:flex-row max-sm:[&_[data-fotky-album-akce-row]]:flex-wrap max-sm:[&_[data-fotky-album-akce-row]]:gap-1.5 max-sm:[&_[data-fotky-mazaci-akce]]:flex-row max-sm:[&_[data-fotky-mazaci-akce]]:flex-wrap max-sm:[&_[data-fotky-mazaci-akce]]:gap-1.5 max-sm:[&_[data-fotky-stahovaci-akce]]:flex-row max-sm:[&_[data-fotky-stahovaci-akce]]:flex-wrap max-sm:[&_[data-fotky-stahovaci-akce]]:gap-1.5 max-sm:[&_[data-fotky-kos-akce]]:gap-1 max-sm:[&_[data-fotky-album-akce-row]_button]:min-h-[40px] max-sm:[&_[data-fotky-album-akce-row]_button]:min-w-[40px] max-sm:[&_[data-fotky-album-akce-row]_button]:px-2.5 max-sm:[&_[data-fotky-album-akce-row]_button]:text-xs";

/** Photo grid tile (view / select modes) */
export const fotkyMrizkaDlazdice = `${fotkyStisk} ${fotkyHoverScaleJemna} relative aspect-square w-full min-h-[44px] overflow-hidden rounded-lg border-2 bg-papir shadow-denik ${FOTKY_FOCUS}`;

/** Lightbox prev/next on dark scrim — glassy, not diary papír chips */
export const fotkyLightboxNavTlacitko = `${fotkyTlacitkoZaklad} ${fotkyHoverOpacity} absolute top-1/2 z-[1] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-papir/20 bg-inkoust/40 text-papir backdrop-blur-[3px] transition-[transform,opacity,background-color,border-color] duration-[160ms] ease-out disabled:pointer-events-none disabled:opacity-25 motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:border-papir/35 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-inkoust/55`;

/** Destructive album action tucked under upload disclosure */
export const fotkySmazatAlbumDiscreet = `${fotkyStisk} ${fotkyHoverOpacity} ${FOTKY_FOCUS} min-h-[44px] max-w-full truncate rounded-md px-2 py-2 text-left text-xs font-semibold text-inkoust/45 underline decoration-inkoust/25 underline-offset-[3px] transition-[transform,opacity,color,decoration-color] duration-[160ms] ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:text-jantar [@media(hover:hover)_and_(pointer:fine)]:hover:decoration-jantar/50`;
