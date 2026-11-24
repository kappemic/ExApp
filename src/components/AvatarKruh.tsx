import { useEffect, useState, type JSX } from "react";
import { inicialyProAvatar, urlAvataruProZobrazeni } from "../lib/storage/avatar";
import PostupnaFotka from "./fotky/PostupnaFotka";

interface AvatarKruhProps {
  jmeno: string;
  /** Veřejná https URL. Prázdné nebo rozbitý obrázek spadne na iniciály. */
  url?: string | null;
  /** `moje` = olivová mlha (já), `cizi` = neutrální, `barevny` = plná barva podle jména. */
  ton?: "moje" | "cizi" | "barevny";
  /** Průměr v px (výchozí 36). */
  velikost?: number;
}

/** Barevné kruhy z ExApp.pen (olivová, okr, šedozelená, terakota), stabilně podle jména. */
const BAREVNE = ["bg-smrk", "bg-okr", "bg-mech", "bg-akcent"] as const;
export function barvaAvataru(jmeno: string): string {
  // FNV-1a, aby se podobná jména rozešla do všech čtyř barev.
  let otisk = 2166136261;
  for (let i = 0; i < jmeno.length; i += 1) otisk = Math.imul(otisk ^ jmeno.charCodeAt(i), 16777619);
  return BAREVNE[(((otisk >>> 13) ^ otisk) >>> 0) % BAREVNE.length] ?? "bg-smrk";
}

/**
 * Kruh 36px: fotka účtu, nebo iniciály. `alt=""` — jméno je vedle v textu.
 */
export default function AvatarKruh({
  jmeno,
  url,
  ton = "cizi",
  velikost = 36,
}: AvatarKruhProps): JSX.Element {
  const [rozbity, setRozbity] = useState<boolean>(false);
  const cisty: string = urlAvataruProZobrazeni(url) ?? "";
  useEffect(() => {
    setRozbity(false);
  }, [cisty]);
  const ukazFoto: boolean = cisty.length > 0 && !rozbity;
  const barva: string =
    ton === "moje"
      ? "bg-mlha text-smrk"
      : ton === "barevny"
        ? `${barvaAvataru(jmeno)} text-povrch`
        : "bg-povrch-2 text-mech";
  const rozmer = { width: velikost, height: velikost, flexBasis: velikost, fontSize: Math.round(velikost * 0.68) / 2 };

  if (ukazFoto) {
    return (
      <PostupnaFotka
        src={cisty}
        alt=""
        width={velikost}
        height={velikost}
        style={rozmer}
        onError={() => setRozbity(true)}
        className="avatar-kruh h-9 w-9 shrink-0 grow-0 basis-9 rounded-full border border-linka object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={jmeno}
      style={velikost === 36 ? undefined : rozmer}
      className={`avatar-kruh flex h-9 w-9 shrink-0 grow-0 basis-9 select-none items-center justify-center rounded-full text-[12.5px] font-semibold ${barva}`}
    >
      {inicialyProAvatar(jmeno)}
    </span>
  );
}
