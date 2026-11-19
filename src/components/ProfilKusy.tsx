import type { JSX, ReactNode } from "react";

/**
 * Sdílené kusy obrazovek Profil a Člen podle ExApp.pen:
 * avatar uprostřed se štítkem role, dlaždice čísel, řádek údaje jen ke čtení.
 */
export function IdentitaProfilu({
  inicialy,
  jmeno,
  podtitul,
  stitek,
  nadpis: Nadpis = "h2",
}: {
  inicialy: string;
  jmeno: string;
  podtitul?: string;
  stitek?: ReactNode;
  nadpis?: "h1" | "h2";
}): JSX.Element {
  return (
    <div className="flex flex-col items-center pb-5 pt-1 text-center">
      <div
        aria-hidden="true"
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-smrk font-display text-2xl font-bold text-papir"
      >
        {inicialy}
      </div>
      <Nadpis className="mt-3 break-words font-display text-[22px] font-bold tracking-tight text-inkoust">
        {jmeno}
      </Nadpis>
      {podtitul !== undefined && podtitul.length > 0 && (
        <p className="mt-0.5 max-w-full break-all text-sm text-ink-3">{podtitul}</p>
      )}
      {stitek !== undefined && (
        <span className="mt-2.5 rounded-full bg-okr-100 px-3 py-1 text-xs font-semibold text-okr">
          {stitek}
        </span>
      )}
    </div>
  );
}

export function DlazdiceStatu({
  popisek,
  hodnota,
}: {
  popisek: string;
  hodnota: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-linka bg-povrch px-2 py-3">
      <span className="font-display text-xl font-bold tabular-nums text-inkoust">{hodnota}</span>
      <span className="text-xs text-ink-3">{popisek}</span>
    </div>
  );
}

export function RadekUdaje({ popisek, hodnota }: { popisek: string; hodnota: string }): JSX.Element {
  return (
    <li className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-[13px] text-ink-3">{popisek}</span>
      <span className="min-w-0 truncate text-right text-[14px] font-semibold text-inkoust">
        {hodnota.trim().length > 0 ? hodnota : "—"}
      </span>
    </li>
  );
}
