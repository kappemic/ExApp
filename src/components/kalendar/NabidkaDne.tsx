import { useRef, useState, type JSX } from "react";
import Ikona from "../Ikona";
import NavigacniRozbalovak from "../Navbar/NavigacniRozbalovak";

/** Tři tečky u vybraného dne kalendáře („Rail Header“ v ExApp.pen): nová schůzka. */
export default function NabidkaDne({ onNovaSchuzka }: { onNovaSchuzka: () => void }): JSX.Element {
  const [otevreno, setOtevreno] = useState(false);
  const kotva = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={kotva}
        type="button"
        aria-label="Akce pro vybraný den"
        aria-haspopup="menu"
        aria-expanded={otevreno}
        onClick={() => setOtevreno((pred) => !pred)}
        className="bez-prejeti -my-3.5 -mr-3.5 inline-flex size-11 items-center justify-center rounded-xl text-ink-3 hover:text-inkoust focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-smrk"
      >
        <Ikona nazev="ellipsis" className="size-4" />
      </button>
      <NavigacniRozbalovak
        otevreno={otevreno}
        onZavrit={() => setOtevreno(false)}
        kotvaRef={kotva}
        sirka={196}
        zarovnani="end"
        popisek="Akce pro vybraný den"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOtevreno(false);
            onNovaSchuzka();
          }}
          className="bez-prejeti flex min-h-11 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13px] font-medium text-inkoust hover:bg-povrch-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:min-h-9"
        >
          <Ikona nazev="plus" className="size-[15px] text-ink-3" />
          Nová schůzka
        </button>
      </NavigacniRozbalovak>
    </>
  );
}
