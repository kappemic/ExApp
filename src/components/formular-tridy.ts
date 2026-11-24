/**
 * Pole formulářů podle ExApp.pen (modály a spodní panely).
 * Telefon: 46 px, rohy 11, text 16 px (iOS nezoomuje). Počítač: 42 px, rohy 10,
 * teplý podklad, text 13 px. Okraj zůstává `border-pole` kvůli kontrastu
 * ovládacích prvků (návrh má světlejší linku, viz CLAUDE.md).
 */
export const POLE_FORMULARE =
  "h-[46px] w-full rounded-[11px] border border-pole bg-papir px-3.5 text-base text-inkoust placeholder:text-ink-4 transition-colors motion-reduce:transition-none focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 min-[90rem]:h-[42px] min-[90rem]:rounded-[10px] min-[90rem]:bg-pole-podklad min-[90rem]:px-3 min-[90rem]:text-[13px]";

/** Pole na celé stránce (Nová výprava): i na počítači 46 px, rohy 11, text 13,5 px. */
export const POLE_STRANKY =
  "h-[46px] w-full rounded-[11px] border border-pole bg-povrch px-3.5 text-base text-inkoust placeholder:text-ink-4 transition-colors motion-reduce:transition-none focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 min-[90rem]:bg-pole-podklad min-[90rem]:text-[13.5px]";

/** Víceřádkové pole: stejný vzhled, výška podle řádků. */
export const OBLAST_FORMULARE =
  "w-full rounded-[11px] border border-pole bg-papir px-3.5 py-3 text-base text-inkoust placeholder:text-ink-4 transition-colors motion-reduce:transition-none focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 min-[90rem]:rounded-[10px] min-[90rem]:bg-pole-podklad min-[90rem]:px-3 min-[90rem]:py-2.5 min-[90rem]:text-[13px]";

/** Popisek nad polem. */
export const POPISEK_POLE = "text-[11.5px] font-semibold text-mech min-[90rem]:text-[11px]";
