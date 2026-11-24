import type { JSX } from "react";
import { Link } from "react-router-dom";
import { cestaVAplikaci } from "../../lib/nahled-odkazu";
import { kratkyOdkaz, rozdelOdkazy } from "../../shared/odkazy";
import { castiZpravy } from "../../shared/zminky";

/** Zvýrazní hledaný text bez ohledu na velikost písmen. Nic nevkládá jako HTML. */
function Zvyrazneny({ text, hledat }: { text: string; hledat: string }): JSX.Element {
  const q = hledat.trim().toLocaleLowerCase("cs");
  const male = text.toLocaleLowerCase("cs");
  if (q.length === 0 || male.length !== text.length) return <>{text}</>;
  const kusy: JSX.Element[] = [];
  let od = 0;
  for (let index = male.indexOf(q); index >= 0; index = male.indexOf(q, od)) {
    if (index > od) kusy.push(<span key={od}>{text.slice(od, index)}</span>);
    kusy.push(
      <mark key={`m${index}`} className="rounded-[3px] bg-okr-100 text-inkoust">
        {text.slice(index, index + q.length)}
      </mark>,
    );
    od = index + q.length;
  }
  kusy.push(<span key={`k${od}`}>{text.slice(od)}</span>);
  return <>{kusy}</>;
}

/** Text zprávy se zmínkami, klikacími odkazy a zvýrazněným hledáním. */
export default function TextZpravy({
  text,
  svetlyText,
  ukazZminky,
  jmena,
  hledat = "",
}: {
  text: string;
  /** Vlastní bublina je tmavá, odkazy a zmínky v ní jsou světlé. */
  svetlyText: boolean;
  ukazZminky: boolean;
  jmena: Readonly<Record<string, string>>;
  hledat?: string;
}): JSX.Element {
  const odkazTrida = `font-medium underline decoration-1 underline-offset-2 [overflow-wrap:anywhere] ${
    svetlyText ? "text-povrch decoration-povrch/50 hover:decoration-povrch" : "text-smrk decoration-smrk/40 hover:decoration-smrk"
  }`;
  return (
    <>
      {rozdelOdkazy(text).map((cast, index) => {
        if (cast.druh === "odkaz") {
          const cesta = cestaVAplikaci(cast.url);
          const popisek = <Zvyrazneny text={kratkyOdkaz(cast.text)} hledat={hledat} />;
          return cesta !== null ? (
            <Link key={index} to={cesta} className={odkazTrida}>
              {popisek}
            </Link>
          ) : (
            <a key={index} href={cast.url} target="_blank" rel="noopener noreferrer" title={cast.url} className={odkazTrida}>
              {popisek}
            </a>
          );
        }
        if (!ukazZminky) return <Zvyrazneny key={index} text={cast.text} hledat={hledat} />;
        return castiZpravy(cast.text, jmena).map((kus, poradi) =>
          kus.druh === "text" ? (
            <Zvyrazneny key={`${index}-${poradi}`} text={kus.text} hledat={hledat} />
          ) : (
            <span key={`${index}-${poradi}`} className={svetlyText ? "font-semibold text-jantar" : "font-semibold text-smrk"}>
              @{kus.popisek}
            </span>
          ),
        );
      })}
    </>
  );
}
