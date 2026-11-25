/**
 * ProfileForm — tab Osobní údaje (Step 4).
 *
 * Prezentace nad `GET /api/me` (hodnoty předvyplněny z `pocatecni`)
 * + mutate `PATCH /api/me` (`ulozProfil` z `useProfile` — fetch/mutate
 * odděleně od UI). Žádný optimistic update: UI se přepíše až po `ok`
 * ze serveru (hlavně e-mail/heslo čekají na server).
 * Dirty-check vypíná Uložit bez změn; sticky Uložit bar s safe-area;
 * `aria-busy` na formuláři + `aria-live` status (toast) po uložení.
 * Break-ui: dlouhá jména/diaktrika/emoji/empty bio — `break-words`,
 * maxlength, Conta­iner max-w-2xl.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import {
  OBLIBENE_BARVY,
  VALIDACE,
  VALIDACNI_ZPRAVY,
  jeOblibenaBarva,
  type ApiUser,
  type UpravitProfilRequest,
} from "../../shared/api-types";
import { nahratAvatar, ulozProfil } from "../../hooks/useProfile";
import { vychoziStorage } from "../../config/storage";
import { meniEmail, potrebujeSoucasneHeslo } from "../../lib/profil-heslo";
import { nactiSkolyTridy } from "../../lib/skoly-tridy";
import VstupSNabidkou from "../VstupSNabidkou";
import AvatarUpload from "./AvatarUpload";
import DatumVstup from "../DatumVstup";
import Ikona from "../Ikona";
import TelefonPole from "./TelefonPole";
import {
  kodZemeZTelefonu,
  narodniCastTelefonu,
  normalizujTelefon,
  type KodZeme,
} from "../../shared/telefon";

interface ProfileFormProps {
  pocatecni: ApiUser;
  onUlozeno: (novy: ApiUser) => void;
  /** Cream rows matching pen Profil; hides avatar block (hero avatar is outside). */
  variant?: "vychozi" | "radky";
  /** Varianta `radky` ukáže pole hesel jen v záložce Účet a na telefonu. */
  sHeslem?: boolean;
}

interface FormHodnoty {
  jmeno: string;
  prijmeni: string;
  email: string;
  telefon: string;
  discordNick: string;
  skola: string;
  trida: string;
  avatarUrl: string;
  oblibenaBarva: string;
  narozeniny: string;
  noveHeslo: string;
  potvrzeniHesla: string;
  soucasneHeslo: string;
}

type FormPole = keyof FormHodnoty;

interface StavOznameni {
  typ: "uspech" | "chyba" | "info";
  text: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function zApi(p: ApiUser): FormHodnoty {
  return {
    jmeno: p.jmeno ?? "",
    prijmeni: p.prijmeni ?? "",
    email: p.email ?? "",
    telefon: narodniCastTelefonu(p.telefon),
    discordNick: p.discordNick ?? "",
    skola: p.skola ?? "",
    trida: p.trida ?? "",
    avatarUrl: p.avatarUrl ?? "",
    oblibenaBarva: jeOblibenaBarva(p.oblibenaBarva ?? "") ? (p.oblibenaBarva ?? "") : "",
    narozeniny: p.narozeniny ?? "",
    noveHeslo: "",
    potvrzeniHesla: "",
    soucasneHeslo: "",
  };
}

function jeValidniDatum(vstup: string): boolean {
  if (!DATUM_REGEX.test(vstup)) return false;
  const cas = Date.parse(`${vstup}T00:00:00Z`);
  if (!Number.isFinite(cas)) return false;
  const zpet = new Date(cas).toISOString().slice(0, 10);
  return zpet === vstup;
}

function dnesISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function kanonickyTelefon(text: string, kod: KodZeme, zaloha: string): string {
  const vysledek = normalizujTelefon(text, kod);
  if (vysledek.ok) return vysledek.e164 ?? "";
  return zaloha.trim();
}

function telefonSeLisi(narodni: string, kod: KodZeme, ulozeny: string | null): boolean {
  const puvodni = (ulozeny ?? "").trim();
  const ulozenyKod = kodZemeZTelefonu(ulozeny);
  const vlevo = kanonickyTelefon(narodni, kod, narodni);
  const vpravo = kanonickyTelefon(narodniCastTelefonu(ulozeny), ulozenyKod, puvodni);
  return vlevo !== vpravo;
}

/** „Poslední změna 3. listopadu 2026“ pod formulářem. */
function posledniZmena(iso: string | undefined): string {
  const dt = new Date(iso ?? "");
  if (Number.isNaN(dt.getTime())) return "Žádné změny.";
  return `Poslední změna ${new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric" }).format(dt)}`;
}

export default function ProfileForm({
  pocatecni,
  onUlozeno,
  variant = "vychozi",
  sHeslem = true,
}: ProfileFormProps): JSX.Element {
  const [form, setForm] = useState<FormHodnoty>(() => zApi(pocatecni));
  const [kodZeme, setKodZeme] = useState<KodZeme>(() => kodZemeZTelefonu(pocatecni.telefon));
  const [chyby, setChyby] = useState<Partial<Record<FormPole | "avatar", string>>>({});
  const [oznameni, setOznameni] = useState<StavOznameni | null>(null);
  const [uklada, setUklada] = useState<boolean>(false);
  const [souborAvatar, setSouborAvatar] = useState<File | null>(null);
  const [barvaOtevrena, setBarvaOtevrena] = useState(false);
  const [skolySeznam, setSkolySeznam] = useState<string[]>([]);
  const [tridySeznam, setTridySeznam] = useState<string[]>([]);
  const barvaObal = useRef<HTMLDivElement>(null);
  const soucasneHesloVstup = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiSkolyTridy();
      if (!zive || !vysledek.ok) return;
      setSkolySeznam(vysledek.data.skoly);
      setTridySeznam(vysledek.data.tridy);
    })();
    return () => {
      zive = false;
    };
  }, []);

  const puvodni = useMemo<FormHodnoty>(() => zApi(pocatecni), [pocatecni]);

  // Pole je na mobilu daleko od e-mailu, chyba by zůstala mimo obrazovku.
  useEffect(() => {
    if (chyby.soucasneHeslo !== undefined && !uklada) soucasneHesloVstup.current?.focus();
  }, [chyby.soucasneHeslo, uklada]);

  useEffect(() => {
    if (!barvaOtevrena) return;
    function zavriVen(udalost: MouseEvent): void {
      if (!barvaObal.current?.contains(udalost.target as Node)) setBarvaOtevrena(false);
    }
    function zavriEsc(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") setBarvaOtevrena(false);
    }
    document.addEventListener("mousedown", zavriVen);
    document.addEventListener("keydown", zavriEsc);
    return () => {
      document.removeEventListener("mousedown", zavriVen);
      document.removeEventListener("keydown", zavriEsc);
    };
  }, [barvaOtevrena]);

  function nastav(pole: FormPole, hodnota: string): void {
    setForm((prev) => ({ ...prev, [pole]: hodnota }));
    setChyby((prev) => {
      if (prev[pole] === undefined && prev["avatar"] === undefined) return prev;
      const next = { ...prev };
      delete next[pole];
      if (pole === "avatarUrl") delete next["avatar"];
      return next;
    });
  }

  const spinavy: boolean = useMemo(() => {
    const klice: Array<Exclude<FormPole, "noveHeslo" | "potvrzeniHesla">> = [
      "jmeno",
      "prijmeni",
      "email",
      "telefon",
      "discordNick",
      "skola",
      "trida",
      "avatarUrl",
      "oblibenaBarva",
      "narozeniny",
    ];
    for (const k of klice) {
      if (k === "telefon") {
        if (telefonSeLisi(form.telefon, kodZeme, pocatecni.telefon ?? null)) return true;
        continue;
      }
      const a = k === "email" ? form[k].trim().toLowerCase() : form[k].trim();
      const b = k === "email" ? puvodni[k].trim().toLowerCase() : puvodni[k].trim();
      if (a !== b) return true;
    }
    return form.noveHeslo.length > 0 || form.potvrzeniHesla.length > 0;
  }, [form, puvodni, kodZeme, pocatecni.telefon]);
  const maZmeny: boolean = spinavy || souborAvatar !== null;

  function validuj(): Partial<Record<FormPole | "avatar", string>> {
    const vysledek: Partial<Record<FormPole | "avatar", string>> = {};
    const jmeno = form.jmeno.trim();
    if (jmeno.length === 0) vysledek.jmeno = VALIDACNI_ZPRAVY.jmenoPovinne;
    else if (jmeno.length < VALIDACE.jmenoMinDelka) vysledek.jmeno = VALIDACNI_ZPRAVY.jmenoKratke;
    else if (jmeno.length > VALIDACE.jmenoMaxDelka) vysledek.jmeno = VALIDACNI_ZPRAVY.jmenoDlouhe;

    const prijmeni = form.prijmeni.trim();
    if (prijmeni.length > 0) {
      if (prijmeni.length < VALIDACE.prijmeniMinDelka) vysledek.prijmeni = VALIDACNI_ZPRAVY.prijmeniKratke;
      else if (prijmeni.length > VALIDACE.prijmeniMaxDelka) vysledek.prijmeni = VALIDACNI_ZPRAVY.prijmeniDlouhe;
    }

    const email = form.email.trim();
    if (email.length === 0) vysledek.email = VALIDACNI_ZPRAVY.emailPovinny;
    else if (!EMAIL_REGEX.test(email)) vysledek.email = VALIDACNI_ZPRAVY.emailNeplatny;

    const telefon = form.telefon.trim();
    if (telefon.length > VALIDACE.telefonMaxDelka) {
      vysledek.telefon = VALIDACNI_ZPRAVY.telefonDlouhy;
    } else if (telefon.length > 0 && !normalizujTelefon(telefon, kodZeme).ok) {
      const puvodniText = (pocatecni.telefon ?? "").trim();
      if (telefon !== puvodniText) vysledek.telefon = VALIDACNI_ZPRAVY.telefonNeplatny;
    }

    if (form.discordNick.trim().length > VALIDACE.discordNickMaxDelka)
      vysledek.discordNick = VALIDACNI_ZPRAVY.discordNickDlouhy;
    if (form.skola.trim().length > VALIDACE.skolaMaxDelka)
      vysledek.skola = VALIDACNI_ZPRAVY.skolaDlouha;
    if (form.trida.trim().length > VALIDACE.tridaMaxDelka)
      vysledek.trida = VALIDACNI_ZPRAVY.tridaDlouha;
    if (form.oblibenaBarva.length > 0 && !jeOblibenaBarva(form.oblibenaBarva))
      vysledek.oblibenaBarva = VALIDACNI_ZPRAVY.oblibenaBarvaNeplatna;

    const narozeniny = form.narozeniny.trim();
    if (narozeniny.length > 0) {
      if (!jeValidniDatum(narozeniny)) vysledek.narozeniny = VALIDACNI_ZPRAVY.narozeninyNeplatne;
      else if (narozeniny < "1900-01-01" || narozeniny > dnesISO())
        vysledek.narozeniny = VALIDACNI_ZPRAVY.narozeninyMimoRozsah;
    }

    const avatar = form.avatarUrl.trim();
    if (avatar.length > 0) {
      if (avatar.length > VALIDACE.avatarUrlMaxDelka) vysledek.avatar = VALIDACNI_ZPRAVY.avatarUrlDlouhy;
      else {
        let parsed: URL | null = null;
        try {
          parsed = new URL(avatar);
        } catch {
          parsed = null;
        }
        if (parsed === null || parsed.protocol !== "https:")
          vysledek.avatar = VALIDACNI_ZPRAVY.avatarUrlNeplatny;
      }
    }

    const heslo = form.noveHeslo;
    const potvrz = form.potvrzeniHesla;
    if (heslo.length > 0 || potvrz.length > 0) {
      if (heslo.length === 0) vysledek.noveHeslo = VALIDACNI_ZPRAVY.hesloPovinne;
      else if (heslo.length < VALIDACE.hesloMinDelka) vysledek.noveHeslo = VALIDACNI_ZPRAVY.hesloKratke;
      else if (heslo.length > VALIDACE.hesloMaxDelka) vysledek.noveHeslo = VALIDACNI_ZPRAVY.hesloDlouhe;
      else if (heslo !== potvrz) vysledek.potvrzeniHesla = "Hesla se neshodují.";
    }
    if (
      form.soucasneHeslo.length === 0 &&
      potrebujeSoucasneHeslo({
        email: form.email,
        puvodniEmail: puvodni.email,
        noveHeslo: heslo,
        potvrzeniHesla: potvrz,
      })
    ) {
      vysledek.soucasneHeslo = "Napiš současné heslo.";
    }
    return vysledek;
  }

  function sestavPatch(): UpravitProfilRequest {
    const patch: UpravitProfilRequest = {};
    const norm = (s: string): string => s.trim();
    if (norm(form.jmeno) !== norm(puvodni.jmeno)) patch.jmeno = norm(form.jmeno);
    if (norm(form.prijmeni) !== norm(puvodni.prijmeni)) {
      const v = norm(form.prijmeni);
      if (v.length > 0) patch.prijmeni = v;
    }
    if (meniEmail(form.email, puvodni.email)) {
      patch.email = norm(form.email).toLowerCase();
      patch.soucasneHeslo = form.soucasneHeslo;
    }
    if (telefonSeLisi(form.telefon, kodZeme, pocatecni.telefon ?? null)) {
      const ulozeny = normalizujTelefon(form.telefon, kodZeme);
      if (ulozeny.ok) patch.telefon = ulozeny.e164;
    }
    if (norm(form.discordNick) !== norm(puvodni.discordNick))
      patch.discordNick = norm(form.discordNick).length === 0 ? null : norm(form.discordNick);
    if (norm(form.skola) !== norm(puvodni.skola)) patch.skola = norm(form.skola);
    if (norm(form.trida) !== norm(puvodni.trida)) patch.trida = norm(form.trida);
    if (norm(form.avatarUrl) !== norm(puvodni.avatarUrl)) {
      const v = norm(form.avatarUrl);
      patch.avatarUrl = v.length === 0 ? null : v;
    }
    if (norm(form.oblibenaBarva) !== norm(puvodni.oblibenaBarva))
      patch.oblibenaBarva = norm(form.oblibenaBarva);
    if (norm(form.narozeniny) !== norm(puvodni.narozeniny))
      patch.narozeniny = norm(form.narozeniny).length === 0 ? null : norm(form.narozeniny);
    if (form.noveHeslo.length > 0) {
      patch.heslo = form.noveHeslo;
      patch.soucasneHeslo = form.soucasneHeslo;
    }
    return patch;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (uklada) return;
    setOznameni(null);
    const lokalni = validuj();
    if (Object.keys(lokalni).length > 0) {
      setChyby(lokalni);
      setOznameni({ typ: "chyba", text: "Zkontroluj zvýrazněná pole." });
      return;
    }
    if (!maZmeny) {
      setOznameni({ typ: "info", text: "Žádné změny k uložení." });
      return;
    }
    const patch = sestavPatch();
    if (souborAvatar !== null) delete patch.avatarUrl;
    // Heslo prázdné = neměnit (nikdy neposílat prázdné).
    if (patch.heslo !== undefined && patch.heslo.length === 0) delete patch.heslo;
    // Avatar: UI URL input odebrán — nová URL nevzniká, patch nese
    // jen null (Odebrat). Existující URL normalizuj pro zpětnou kompatibilitu.
    if (patch.avatarUrl !== undefined && patch.avatarUrl !== null) {
      try {
        patch.avatarUrl = await vychoziStorage.pripravUrl(patch.avatarUrl);
      } catch {
        setChyby((prev) => ({ ...prev, avatar: VALIDACNI_ZPRAVY.avatarUrlNeplatny }));
        setOznameni({ typ: "chyba", text: "Zkontroluj zvýrazněná pole." });
        return;
      }
    }
    setUklada(true);
    try {
      let ulozenyAvatar: ApiUser | null = null;
      if (souborAvatar !== null) {
        const nahrane = await nahratAvatar(souborAvatar);
        if (!nahrane.ok) {
          const hlaskaPole = nahrane.chybyPoli?.["soubor"] ?? nahrane.chyba;
          setChyby((prev) => ({ ...prev, avatar: hlaskaPole }));
          setOznameni({ typ: "chyba", text: nahrane.chyba });
          return;
        }
        ulozenyAvatar = nahrane.data;
        setSouborAvatar(null);
        setForm((prev) => ({
          ...prev,
          avatarUrl: nahrane.data.avatarUrl ?? "",
        }));
      }
      const vysledek =
        Object.keys(patch).length > 0 ? await ulozProfil(patch) : null;
      if (vysledek !== null && !vysledek.ok) {
        const mapovane: Partial<Record<FormPole | "avatar", string>> = {};
        const pole = vysledek.chybyPoli ?? {};
        for (const [k, v] of Object.entries(pole)) {
          if (k === "jmeno" || k === "prijmeni" || k === "email" || k === "telefon" || k === "discordNick" || k === "skola" || k === "trida" || k === "oblibenaBarva" || k === "narozeniny" || k === "heslo" || k === "noveHeslo" || k === "soucasneHeslo") {
            const cil: FormPole = k === "heslo" ? "noveHeslo" : (k as FormPole);
            mapovane[cil] = v;
          } else if (k === "avatarUrl" || k === "avatar") {
            mapovane["avatar"] = v;
          }
        }
        setChyby(mapovane);
        setOznameni({ typ: "chyba", text: vysledek.chyba });
        return;
      }
      const hotovo: ApiUser | null =
        vysledek !== null && vysledek.ok ? vysledek.data : ulozenyAvatar;
      if (hotovo === null) {
        setOznameni({ typ: "info", text: "Žádné změny k uložení." });
        return;
      }
      setChyby({});
      setForm((prev) => ({ ...prev, noveHeslo: "", potvrzeniHesla: "", soucasneHeslo: "" }));
      setOznameni({ typ: "uspech", text: "Profil uložen." });
      onUlozeno(hotovo);
    } finally {
      setUklada(false);
    }
  }

  function pole(label: string, id: string, chyba: string | undefined, deti: JSX.Element): JSX.Element {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[11.5px] font-semibold text-mech">
          {label}
        </label>
        {deti}
        {chyba !== undefined && (
          <p id={`${id}-chyba`} role="alert" className="text-xs font-semibold text-akcent">
            {chyba}
          </p>
        )}
      </div>
    );
  }

  const radky = variant === "radky";
  // Změna e-mailu chce současné heslo i mimo záložku Účet.
  const potrebaHesla = form.email.trim() !== pocatecni.email.trim() || chyby.soucasneHeslo !== undefined;
  const vstupTrida = radky
    ? "h-[46px] w-full rounded-[11px] border border-pole bg-povrch px-3.5 text-base text-inkoust placeholder:text-ink-4 focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 disabled:opacity-50 min-[90rem]:h-[42px] min-[90rem]:rounded-[10px] min-[90rem]:bg-pole-podklad min-[90rem]:px-3 min-[90rem]:text-[13.5px]"
    : "min-h-[44px] w-full rounded border border-pole bg-white px-3 py-2 text-base text-inkoust placeholder:text-inkoust/40 focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 disabled:opacity-50";

  function onInput(poleJmeno: FormPole) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      nastav(poleJmeno, e.target.value);
    };
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      aria-busy={uklada}
      aria-label="Osobní údaje"
      className="mx-auto w-full max-w-2xl text-left lg:mx-0 lg:max-w-none"
    >
      <div className={radky ? "flex flex-col gap-4 min-[90rem]:grid min-[90rem]:grid-cols-2" : "flex flex-col gap-4"}>
        {radky ? null : (
          <AvatarUpload
            hodnota={form.avatarUrl.trim().length === 0 ? null : form.avatarUrl}
            jmeno={form.jmeno}
            prijmeni={form.prijmeni}
            disabled={uklada}
            chyba={chyby["avatar"]}
            onZmena={(url) => nastav("avatarUrl", url ?? "")}
            onSouborZmena={setSouborAvatar}
          />
        )}

        <div className={`grid grid-cols-1 gap-4 ${radky ? "min-[90rem]:col-span-2 min-[90rem]:grid-cols-2" : "sm:grid-cols-2"}`}>
          {pole(
            "Jméno *",
            "profil-jmeno",
            chyby.jmeno,
            <input
              id="profil-jmeno"
              type="text"
              autoComplete="given-name"
              value={form.jmeno}
              disabled={uklada}
              onChange={onInput("jmeno")}
              maxLength={VALIDACE.jmenoMaxDelka}
              aria-invalid={chyby.jmeno !== undefined}
              aria-describedby={chyby.jmeno !== undefined ? "profil-jmeno-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
          {pole(
            "Příjmení",
            "profil-prijmeni",
            chyby.prijmeni,
            <input
              id="profil-prijmeni"
              type="text"
              autoComplete="family-name"
              value={form.prijmeni}
              disabled={uklada}
              onChange={onInput("prijmeni")}
              maxLength={VALIDACE.prijmeniMaxDelka}
              aria-invalid={chyby.prijmeni !== undefined}
              aria-describedby={chyby.prijmeni !== undefined ? "profil-prijmeni-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
        </div>

        {pole(
          "E-mail *",
          "profil-email",
          chyby.email,
          <input
            id="profil-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={form.email}
            disabled={uklada}
            onChange={onInput("email")}
            aria-invalid={chyby.email !== undefined}
            aria-describedby={chyby.email !== undefined ? "profil-email-chyba" : undefined}
            className={`${vstupTrida} break-words overflow-wrap-anywhere`}
          />,
        )}

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${radky ? "min-[90rem]:col-span-2" : ""}`}>
          {pole(
            "Telefon",
            "profil-telefon",
            chyby.telefon,
            <TelefonPole
              id="profil-telefon"
              hodnota={form.telefon}
              kodZeme={kodZeme}
              disabled={uklada}
              neplatny={chyby.telefon !== undefined}
              popisChybyId={chyby.telefon !== undefined ? "profil-telefon-chyba" : undefined}
              vstupTrida={vstupTrida}
              onZmena={(dalsi, zeme) => {
                nastav("telefon", dalsi);
                setKodZeme(zeme);
              }}
            />,
          )}
          {pole(
            "Discord nick",
            "profil-discord",
            chyby.discordNick,
            <input
              id="profil-discord"
              type="text"
              autoComplete="nickname"
              autoCapitalize="none"
              autoCorrect="off"
              value={form.discordNick}
              disabled={uklada}
              onChange={onInput("discordNick")}
              maxLength={VALIDACE.discordNickMaxDelka}
              aria-invalid={chyby.discordNick !== undefined}
              aria-describedby={chyby.discordNick !== undefined ? "profil-discord-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
        </div>

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${radky ? "min-[90rem]:col-span-2" : ""}`}>
          {pole(
            "Škola",
            "profil-skola",
            chyby.skola,
            <VstupSNabidkou
              id="profil-skola"
              value={form.skola}
              disabled={uklada}
              onChange={(hodnota) => nastav("skola", hodnota)}
              nabidky={skolySeznam}
              placeholder="Např. ZŠ Lesní"
              maxLength={VALIDACE.skolaMaxDelka}
              neplatny={chyby.skola !== undefined}
              popisId={chyby.skola !== undefined ? "profil-skola-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
          {pole(
            "Třída / klubovna",
            "profil-trida",
            chyby.trida,
            <VstupSNabidkou
              id="profil-trida"
              value={form.trida}
              disabled={uklada}
              onChange={(hodnota) => nastav("trida", hodnota)}
              nabidky={tridySeznam}
              placeholder="Např. 5.A"
              maxLength={VALIDACE.tridaMaxDelka}
              neplatny={chyby.trida !== undefined}
              popisId={chyby.trida !== undefined ? "profil-trida-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
        </div>

        {radky ? null : (
        <div className="flex flex-col gap-1.5">
          <span id="profil-oblibena-barva-popisek" className="text-sm font-bold">
            Oblíbená barva
          </span>
          <div ref={barvaObal} className={barvaOtevrena ? "relative z-20" : "relative"}>
            <button
              type="button"
              id="profil-oblibena-barva"
              disabled={uklada}
              aria-haspopup="listbox"
              aria-expanded={barvaOtevrena}
              aria-controls="profil-oblibena-barva-nabidka"
              aria-labelledby="profil-oblibena-barva-popisek"
              aria-invalid={chyby.oblibenaBarva !== undefined}
              aria-describedby={
                chyby.oblibenaBarva !== undefined ? "profil-oblibena-barva-chyba" : undefined
              }
              onClick={() => setBarvaOtevrena((otevreno) => !otevreno)}
              className={`bez-prejeti ${vstupTrida} flex items-center gap-2 text-left`}
            >
              {jeOblibenaBarva(form.oblibenaBarva) ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 rounded-full border border-linka"
                    style={{
                      backgroundColor: OBLIBENE_BARVY.find(
                        (barva) => barva.nazev === form.oblibenaBarva,
                      )?.hex,
                    }}
                  />
                  {form.oblibenaBarva.charAt(0).toLocaleUpperCase("cs-CZ") +
                    form.oblibenaBarva.slice(1)}
                </>
              ) : (
                <span className="text-inkoust/40">Vyber barvu</span>
              )}
            </button>
            {barvaOtevrena ? (
              <ul
                id="profil-oblibena-barva-nabidka"
                role="listbox"
                aria-labelledby="profil-oblibena-barva-popisek"
                className="registrace-nabidka absolute top-[calc(100%+4px)] right-0 left-0 z-20 max-h-60 overflow-y-auto rounded-md border border-linka bg-papir py-1 shadow-denik"
              >
                {OBLIBENE_BARVY.map((barva) => {
                  const vybrana = form.oblibenaBarva === barva.nazev;
                  return (
                    <li key={barva.nazev} role="option" aria-selected={vybrana}>
                      <button
                        type="button"
                        className={`bez-prejeti flex min-h-[44px] w-full items-center gap-2 px-3.5 text-left text-base text-inkoust ${
                          vybrana ? "bg-linka" : ""
                        }`}
                        onMouseDown={(udalost) => udalost.preventDefault()}
                        onClick={() => {
                          nastav("oblibenaBarva", vybrana ? "" : barva.nazev);
                          setBarvaOtevrena(false);
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="h-6 w-6 shrink-0 rounded-full border border-linka"
                          style={{ backgroundColor: barva.hex }}
                        />
                        {barva.nazev.charAt(0).toLocaleUpperCase("cs-CZ") + barva.nazev.slice(1)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          {chyby.oblibenaBarva !== undefined && (
            <p id="profil-oblibena-barva-chyba" role="alert" className="text-sm font-bold text-red-800">
              {chyby.oblibenaBarva}
            </p>
          )}
        </div>
        )}

        {pole(
          "Datum narození",
          "profil-narozeniny",
          chyby.narozeniny,
          <DatumVstup
            id="profil-narozeniny"
            value={form.narozeniny}
            disabled={uklada}
            min="1900-01-01"
            max={dnesISO()}
            onChange={(iso) => nastav("narozeniny", iso)}
            ariaInvalid={chyby.narozeniny !== undefined}
            ariaDescribedBy={chyby.narozeniny !== undefined ? "profil-narozeniny-chyba" : undefined}
            className={vstupTrida}
          />,
        )}

        <div className={radky && !sHeslem && !potrebaHesla ? "hidden" : `flex flex-col gap-1.5 ${radky ? "min-[90rem]:col-span-2" : ""}`}>
          {pole(
            "Současné heslo",
            "profil-soucasne-heslo",
            chyby.soucasneHeslo,
            <input
              ref={soucasneHesloVstup}
              id="profil-soucasne-heslo"
              type="password"
              autoComplete="current-password"
              value={form.soucasneHeslo}
              disabled={uklada}
              onChange={onInput("soucasneHeslo")}
              maxLength={VALIDACE.hesloMaxDelka}
              aria-invalid={chyby.soucasneHeslo !== undefined}
              aria-describedby={
                chyby.soucasneHeslo !== undefined
                  ? "profil-soucasne-heslo-napoveda profil-soucasne-heslo-chyba"
                  : "profil-soucasne-heslo-napoveda"
              }
              className={vstupTrida}
            />,
          )}
          <p id="profil-soucasne-heslo-napoveda" className="text-[11.5px] text-ink-3">
            Vyplň jen při změně e-mailu nebo hesla.
          </p>
        </div>

        <fieldset className={radky && !sHeslem ? "hidden" : `m-0 min-w-0 border-0 p-0 ${radky ? "min-[90rem]:col-span-2" : ""}`}>
          <legend className="sr-only">Nové heslo (prázdné = neměnit)</legend>
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${radky ? "min-[90rem]:col-span-2" : ""}`}>
            {pole(
              "Nové heslo",
              "profil-heslo",
              chyby.noveHeslo,
              <input
                id="profil-heslo"
                type="password"
                autoComplete="new-password"
                value={form.noveHeslo}
                disabled={uklada}
                onChange={onInput("noveHeslo")}
                maxLength={VALIDACE.hesloMaxDelka}
                aria-invalid={chyby.noveHeslo !== undefined}
                aria-describedby={chyby.noveHeslo !== undefined ? "profil-heslo-chyba" : undefined}
                className={vstupTrida}
              />,
            )}
            {pole(
              "Potvrzení hesla",
              "profil-heslo-potvrzeni",
              chyby.potvrzeniHesla,
              <input
                id="profil-heslo-potvrzeni"
                type="password"
                autoComplete="new-password"
                value={form.potvrzeniHesla}
                disabled={uklada}
                onChange={onInput("potvrzeniHesla")}
                maxLength={VALIDACE.hesloMaxDelka}
                aria-invalid={chyby.potvrzeniHesla !== undefined}
                aria-describedby={chyby.potvrzeniHesla !== undefined ? "profil-heslo-potvrzeni-chyba" : undefined}
                className={vstupTrida}
              />,
            )}
          </div>
        </fieldset>

        <div aria-live="polite" className={radky ? "empty:hidden min-[90rem]:col-span-2" : "min-h-[1.5rem]"}>
          {oznameni !== null && (
            <p
              role={oznameni.typ === "chyba" ? "alert" : "status"}
              className={
                oznameni.typ === "uspech"
                  ? "rounded-[10px] bg-mlha px-3 py-2 text-[13px] font-semibold text-smrk"
                  : oznameni.typ === "chyba"
                    ? "rounded-[10px] bg-akcent-100 px-3 py-2 text-[13px] font-semibold text-akcent"
                    : "rounded-[10px] bg-povrch-2 px-3 py-2 text-[13px] font-medium text-mech"
              }
            >
              {oznameni.text}
            </p>
          )}
        </div>
      </div>

      <div
        className={
          radky
            ? "sticky bottom-0 z-10 mt-5 bg-papir/95 py-3 backdrop-blur min-[90rem]:static min-[90rem]:bg-transparent min-[90rem]:py-0"
            : "sticky bottom-0 z-10 -mx-1 mt-2 border-t border-linka bg-papir/95 px-1 py-3 backdrop-blur"
        }
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-3" aria-live="polite">
            {maZmeny ? "Máš neuložené změny." : radky ? posledniZmena(pocatecni.updatedAt) : "Žádné změny."}
          </p>
          <button
            type="submit"
            disabled={uklada || !maZmeny}
            aria-busy={uklada}
            className={
              radky
                ? "nahled-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-povrch disabled:opacity-50 sm:w-auto min-[90rem]:h-[46px]"
                : "nahled-press nahled-prejeti min-h-[44px] min-w-[44px] touch-manipulation rounded border border-linka bg-papir px-6 py-2.5 text-base font-bold text-inkoust select-none disabled:opacity-50 focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25"
            }
          >
            {radky ? <Ikona nazev="check" className="hidden size-4 min-[90rem]:block" /> : null}
            {uklada ? "Ukládám…" : "Uložit změny"}
          </button>
        </div>
      </div>
    </form>
  );
}
