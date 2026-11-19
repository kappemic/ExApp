import type { JSX } from "react";
import type { TeloPisne } from "../../shared/zpevnik";

/** Chords in reading order. Repeats are dropped. This is a list, not a player. */
export function akordyZTela(telo: TeloPisne): string[] {
  const vysledek: string[] = [];
  const videno = new Set<string>();
  for (const blok of telo.bloky) {
    for (const radek of blok.radky) {
      for (const slabika of radek.slabiky) {
        const akord = slabika.akord;
        if (akord === undefined || akord.length === 0 || videno.has(akord)) continue;
        videno.add(akord);
        vysledek.push(akord);
      }
    }
  }
  return vysledek;
}

/** Chord names from the song body — a list, not a player. */
export function AkordovyProuzek({ akordy }: { akordy: readonly string[] }): JSX.Element | null {
  if (akordy.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="zpevnik-akordy-nadpis">
      <div className="flex items-center gap-3">
        <h2 id="zpevnik-akordy-nadpis" className="text-xs font-bold tracking-wide text-mech">
          AKORDY
        </h2>
        <ul aria-label="Akordy v písni" className="flex flex-1 gap-2 overflow-x-auto pb-0.5">
          {akordy.map((akord) => (
            <li
              key={akord}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-mlha font-display text-sm font-bold text-inkoust"
            >
              {akord}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
