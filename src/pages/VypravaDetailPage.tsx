import { useEffect, useMemo, useState, type JSX } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import ExpeditionModal from "../components/expeditions/ExpeditionModal";
import StrankaKostra from "../components/StrankaKostra";
import { useKonverzacePrehled } from "../hooks/useKonverzacePrehled";
import { useZpet } from "../hooks/useZpet";
import { apiBase } from "../lib/api-base";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import type { Expedition } from "../lib/mock-expeditions";
import { useSpojeni } from "../lib/spojeni";
import { parseVypravaId, VYPRAVA_PARAM } from "../lib/vyprava-deep-link";
import { expediceDetailPath, jeApiExpedice, type ApiExpedice } from "../shared/api-types";

function prevedApiExpedici(api: ApiExpedice): Expedition {
  return {
    id: api.id,
    nazev: api.nazev,
    datum: api.datum,
    datumDo: api.datumDo,
    sraz: api.sraz,
    popis: api.popis,
    trasaOdkaz: api.trasaOdkaz,
    organizatorId: api.organizatorId ?? null,
    kapacita: {
      prihlaseno: api.kapacita.prihlaseno,
      celkem: api.kapacita.celkem,
    },
    stav: api.stav,
    ...(api.nahledFotkaId !== undefined ? { nahledFotkaId: api.nahledFotkaId } : {}),
  };
}

async function nactiDetailVypravy(id: string): Promise<Expedition | null> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return null;
  try {
    const odpoved = await fetch(`${zaklad}${expediceDetailPath(id)}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!odpoved.ok) return null;
    const telo: unknown = await odpoved.json();
    const expedice: unknown =
      typeof telo === "object" && telo !== null
        ? (telo as Record<string, unknown>)["expedice"]
        : null;
    if (!jeApiExpedice(expedice)) return null;
    return prevedApiExpedici(expedice);
  } catch {
    // Bez sítě: detail otevřený není, ale výprava bývá v uloženém seznamu.
    const seznam = await getExpeditions();
    if (seznam.source !== "db") return null;
    return seznam.data.find((polozka) => polozka.id === id) ?? null;
  }
}

/** Full-page expedition detail (replaces overlay modal from the list). */
export default function VypravaDetailPage(): JSX.Element {
  const { id: paramId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const idZParam = parseVypravaId(searchParams.get(VYPRAVA_PARAM));
  const idVypravy = parseVypravaId(paramId ?? null) ?? idZParam;
  const startNaDiskuzi =
    searchParams.get("diskuze") === "1" || idZParam !== null;
  const startNaPrihlaseni = searchParams.get("prihlasit") === "1";
  const { neprecteneVypravy } = useKonverzacePrehled();

  const mapaLokalni = useMemo(() => {
    const seznam = getExpeditionsSync().data;
    return new Map(seznam.map((e) => [e.id, e]));
  }, []);

  const [expedice, setExpedice] = useState<Expedition | null>(() =>
    idVypravy !== null ? (mapaLokalni.get(idVypravy) ?? null) : null,
  );
  const spojeno = useSpojeni();
  const [stav, setStav] = useState<"idle" | "nacteni" | "hotovo" | "chyba">(
    () => (expedice !== null ? "hotovo" : "idle"),
  );

  useEffect(() => {
    if (idVypravy === null) return;
    const mistni = mapaLokalni.get(idVypravy);
    if (mistni !== undefined) {
      setExpedice(mistni);
      setStav("hotovo");
    }
    let zive = true;
    setStav((s) => (s === "hotovo" && mistni !== undefined ? "hotovo" : "nacteni"));
    void (async (): Promise<void> => {
      const detail = await nactiDetailVypravy(idVypravy);
      if (!zive) return;
      if (detail === null) {
        setStav("chyba");
        return;
      }
      setExpedice(detail);
      setStav("hotovo");
    })();
    return () => {
      zive = false;
    };
  }, [idVypravy, mapaLokalni]);

  useEffect(() => {
    if (idZParam !== null && paramId !== null && idZParam === paramId) {
      const next = new URLSearchParams(searchParams);
      next.delete(VYPRAVA_PARAM);
      if (!next.has("diskuze")) next.set("diskuze", "1");
      setSearchParams(next, { replace: true });
    }
  }, [idZParam, paramId, searchParams, setSearchParams]);

  // Přihlášení se otevře jednou. Bez úklidu by naskočilo znovu po návratu z „Kdo jede“.
  useEffect(() => {
    if (!startNaPrihlaseni || stav === "nacteni" || expedice === null) return;
    const next = new URLSearchParams(searchParams);
    next.delete("prihlasit");
    setSearchParams(next, { replace: true });
  }, [startNaPrihlaseni, stav, expedice, searchParams, setSearchParams]);

  const zpet = useZpet(
    searchParams.get("zobrazeni") === "kalendar" ? "/vypravy?zobrazeni=kalendar" : "/vypravy",
  );

  if (idVypravy === null) {
    return <Navigate to="/vypravy" replace />;
  }

  if (stav === "nacteni" || expedice === null) {
    return stav === "chyba" ? (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="text-base text-inkoust">{spojeno ? "Výpravu se nepodařilo načíst." : "Bez spojení se výprava nenačetla a v telefonu není uložená."}</p>
        <button
          type="button"
          onClick={zpet}
          className="nahled-press mt-4 inline-flex min-h-11 items-center rounded-xl bg-smrk px-5 text-sm font-semibold text-papir"
        >
          Zpět
        </button>
      </main>
    ) : (
      <StrankaKostra vnitrni />
    );
  }

  return (
    <ExpeditionModal
      key={expedice.id}
      stranka
      expedice={expedice}
      onZavrit={zpet}
      onAktualizace={(nova) => setExpedice(nova)}
      onSmazana={zpet}
      neprectenaDiskuze={neprecteneVypravy.get(expedice.id) === true}
      startNaDiskuzi={startNaDiskuzi}
      startNaPrihlaseni={startNaPrihlaseni}
      denik
    />
  );
}