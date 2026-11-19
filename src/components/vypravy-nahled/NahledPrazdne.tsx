import type { JSX } from "react";
import PrazdnyStav from "../PrazdnyStav";
import { IkonaLupa } from "../SeznamIkony";

/** Hledání ve výpravách bez výsledku: co hledal a cesta ven. */
export default function NahledPrazdne({
  nadpis,
  text,
  akce,
}: {
  nadpis: string;
  text: string;
  akce?: { popisek: string; onClick: () => void };
}): JSX.Element {
  return (
    <PrazdnyStav
      ikona={<IkonaLupa />}
      nadpis={nadpis}
      text={text}
      akce={akce === undefined ? undefined : { ...akce, varianta: "vedlejsi" }}
    />
  );
}
