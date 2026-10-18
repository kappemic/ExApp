import { useEffect, useState, type JSX } from "react";
import { inicialyProAvatar, urlAvataruProZobrazeni } from "../lib/storage/avatar";

interface AvatarKruhProps {
  jmeno: string;
  /** Veřejná https URL. Prázdné nebo rozbitý obrázek spadne na iniciály. */
  url?: string | null;
  /** `moje` = tmavý kruh (vlastní zpráva), `cizi` = světlý. */
  ton?: "moje" | "cizi";
}

/**
 * Kruh 36px: fotka účtu, nebo iniciály. `alt=""` — jméno je vedle v textu.
 */
export default function AvatarKruh({
  jmeno,
  url,
  ton = "cizi",
}: AvatarKruhProps): JSX.Element {
  const [rozbity, setRozbity] = useState<boolean>(false);
  const cisty: string = urlAvataruProZobrazeni(url) ?? "";
  useEffect(() => {
    setRozbity(false);
  }, [cisty]);
  const ukazFoto: boolean = cisty.length > 0 && !rozbity;
  const barva: string =
    ton === "moje" ? "bg-inkoust text-papir" : "bg-linka/70 text-inkoust";

  if (ukazFoto) {
    return (
      <img
        src={cisty}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        onError={() => setRozbity(true)}
        className="avatar-kruh h-9 w-9 shrink-0 grow-0 basis-9 rounded-full border-2 border-inkoust object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={jmeno}
      className={`avatar-kruh flex h-9 w-9 shrink-0 grow-0 basis-9 select-none items-center justify-center rounded-full border-2 border-inkoust text-[13px] font-extrabold ${barva}`}
    >
      {inicialyProAvatar(jmeno)}
    </span>
  );
}
