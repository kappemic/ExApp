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

import { useMemo, useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type ApiUser,
  type UpravitProfilRequest,
} from "../../shared/api-types";
import { nahratAvatar, ulozProfil } from "../../hooks/useProfile";
import { vychoziStorage } from "../../config/storage";
import AvatarUpload from "./AvatarUpload";

interface ProfileFormProps {
  pocatecni: ApiUser;
  onUlozeno: (novy: ApiUser) => void;
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
  bio: string;
  narozeniny: string;
  noveHeslo: string;
  potvrzeniHesla: string;
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
    telefon: p.telefon ?? "",
    discordNick: p.discordNick ?? "",
    skola: p.skola ?? "",
    trida: p.trida ?? "",
    avatarUrl: p.avatarUrl ?? "",
    bio: p.bio ?? "",
    narozeniny: p.narozeniny ?? "",
    noveHeslo: "",
    potvrzeniHesla: "",
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

export default function ProfileForm({ pocatecni, onUlozeno }: ProfileFormProps): JSX.Element {
  const [form, setForm] = useState<FormHodnoty>(() => zApi(pocatecni));
  const [chyby, setChyby] = useState<Partial<Record<FormPole | "avatar", string>>>({});
  const [oznameni, setOznameni] = useState<StavOznameni | null>(null);
  const [uklada, setUklada] = useState<boolean>(false);
  const [souborAvatar, setSouborAvatar] = useState<File | null>(null);

  const puvodni = useMemo<FormHodnoty>(() => zApi(pocatecni), [pocatecni]);

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
      "bio",
      "narozeniny",
    ];
    for (const k of klice) {
      const a = k === "email" ? form[k].trim().toLowerCase() : form[k].trim();
      const b = k === "email" ? puvodni[k].trim().toLowerCase() : puvodni[k].trim();
      if (a !== b) return true;
    }
    return form.noveHeslo.length > 0 || form.potvrzeniHesla.length > 0;
  }, [form, puvodni]);
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
    if (telefon.length > 0) {
      if (telefon.length > VALIDACE.telefonMaxDelka) vysledek.telefon = VALIDACNI_ZPRAVY.telefonDlouhy;
      else if (telefon.length < 6 || !/^[+0-9][+0-9 /().-]*$/.test(telefon))
        vysledek.telefon = VALIDACNI_ZPRAVY.telefonNeplatny;
    }

    if (form.discordNick.trim().length > VALIDACE.discordNickMaxDelka)
      vysledek.discordNick = VALIDACNI_ZPRAVY.discordNickDlouhy;
    if (form.skola.trim().length > VALIDACE.skolaMaxDelka)
      vysledek.skola = VALIDACNI_ZPRAVY.skolaDlouha;
    if (form.trida.trim().length > VALIDACE.tridaMaxDelka)
      vysledek.trida = VALIDACNI_ZPRAVY.tridaDlouha;
    if (form.bio.length > VALIDACE.bioMaxDelka)
      vysledek.bio = VALIDACNI_ZPRAVY.bioDlouhe;

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
    if (norm(form.email).toLowerCase() !== norm(puvodni.email).toLowerCase())
      patch.email = norm(form.email).toLowerCase();
    if (norm(form.telefon) !== norm(puvodni.telefon))
      patch.telefon = norm(form.telefon).length === 0 ? null : norm(form.telefon);
    if (norm(form.discordNick) !== norm(puvodni.discordNick))
      patch.discordNick = norm(form.discordNick).length === 0 ? null : norm(form.discordNick);
    if (norm(form.skola) !== norm(puvodni.skola)) patch.skola = norm(form.skola);
    if (norm(form.trida) !== norm(puvodni.trida)) patch.trida = norm(form.trida);
    if (norm(form.avatarUrl) !== norm(puvodni.avatarUrl)) {
      const v = norm(form.avatarUrl);
      patch.avatarUrl = v.length === 0 ? null : v;
    }
    if (form.bio !== puvodni.bio) patch.bio = form.bio;
    if (norm(form.narozeniny) !== norm(puvodni.narozeniny))
      patch.narozeniny = norm(form.narozeniny).length === 0 ? null : norm(form.narozeniny);
    if (form.noveHeslo.length > 0) patch.heslo = form.noveHeslo;
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
          if (k === "jmeno" || k === "prijmeni" || k === "email" || k === "telefon" || k === "discordNick" || k === "skola" || k === "trida" || k === "bio" || k === "narozeniny" || k === "heslo" || k === "noveHeslo") {
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
      setForm((prev) => ({ ...prev, noveHeslo: "", potvrzeniHesla: "" }));
      setOznameni({ typ: "uspech", text: "Profil uložen." });
      onUlozeno(hotovo);
    } finally {
      setUklada(false);
    }
  }

  function pole(label: string, id: string, chyba: string | undefined, deti: JSX.Element): JSX.Element {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-bold">
          {label}
        </label>
        {deti}
        {chyba !== undefined && (
          <p id={`${id}-chyba`} role="alert" className="text-sm font-bold text-red-800">
            {chyba}
          </p>
        )}
      </div>
    );
  }

  const vstupTrida =
    "min-h-[44px] w-full rounded border-2 border-inkoust bg-white px-3 py-2 text-base text-inkoust placeholder:text-inkoust/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inkoust focus-visible:ring-offset-2 focus-visible:ring-offset-papir disabled:opacity-50";

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
      className="mx-auto w-full max-w-2xl text-left"
    >
      <div className="flex flex-col gap-4">
        <AvatarUpload
          hodnota={form.avatarUrl.trim().length === 0 ? null : form.avatarUrl}
          jmeno={form.jmeno}
          prijmeni={form.prijmeni}
          disabled={uklada}
          chyba={chyby["avatar"]}
          onZmena={(url) => nastav("avatarUrl", url ?? "")}
          onSouborZmena={setSouborAvatar}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pole(
            "Telefon",
            "profil-telefon",
            chyby.telefon,
            <input
              id="profil-telefon"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.telefon}
              disabled={uklada}
              onChange={onInput("telefon")}
              maxLength={VALIDACE.telefonMaxDelka}
              aria-invalid={chyby.telefon !== undefined}
              aria-describedby={chyby.telefon !== undefined ? "profil-telefon-chyba" : undefined}
              className={vstupTrida}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pole(
            "Škola",
            "profil-skola",
            chyby.skola,
            <input
              id="profil-skola"
              type="text"
              autoComplete="organization"
              value={form.skola}
              disabled={uklada}
              onChange={onInput("skola")}
              maxLength={VALIDACE.skolaMaxDelka}
              aria-invalid={chyby.skola !== undefined}
              aria-describedby={chyby.skola !== undefined ? "profil-skola-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
          {pole(
            "Třída / klubovna",
            "profil-trida",
            chyby.trida,
            <input
              id="profil-trida"
              type="text"
              value={form.trida}
              disabled={uklada}
              onChange={onInput("trida")}
              maxLength={VALIDACE.tridaMaxDelka}
              aria-invalid={chyby.trida !== undefined}
              aria-describedby={chyby.trida !== undefined ? "profil-trida-chyba" : undefined}
              className={`${vstupTrida} break-words overflow-wrap-anywhere`}
            />,
          )}
        </div>

        {pole(
          "Představení (bio)",
          "profil-bio",
          chyby.bio,
          <textarea
            id="profil-bio"
            rows={4}
            value={form.bio}
            disabled={uklada}
            onChange={onInput("bio")}
            maxLength={VALIDACE.bioMaxDelka}
            placeholder="Pár vět o sobě…"
            aria-invalid={chyby.bio !== undefined}
            aria-describedby={chyby.bio !== undefined ? "profil-bio-chyba" : undefined}
            className={`${vstupTrida} break-words overflow-wrap-anywhere resize-y`}
          />,
        )}

        {pole(
          "Datum narození",
          "profil-narozeniny",
          chyby.narozeniny,
          <input
            id="profil-narozeniny"
            type="date"
            value={form.narozeniny}
            disabled={uklada}
            min="1900-01-01"
            max={dnesISO()}
            onChange={onInput("narozeniny")}
            aria-invalid={chyby.narozeniny !== undefined}
            aria-describedby={chyby.narozeniny !== undefined ? "profil-narozeniny-chyba" : undefined}
            className={vstupTrida}
          />,
        )}

        <fieldset className="rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-4 py-3">
          <legend className="px-1 text-sm font-bold">Nové heslo (prázdné = neměnit)</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div aria-live="polite" className="min-h-[1.5rem]">
          {oznameni !== null && (
            <p
              role={oznameni.typ === "chyba" ? "alert" : "status"}
              className={
                oznameni.typ === "uspech"
                  ? "rounded border-2 border-green-700 bg-green-50 px-3 py-2 text-sm font-bold text-green-900"
                  : oznameni.typ === "chyba"
                    ? "rounded border-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-900"
                    : "rounded border border-inkoust/20 bg-papir px-3 py-2 text-sm font-medium"
              }
            >
              {oznameni.text}
            </p>
          )}
        </div>
      </div>

      <div
        className="sticky bottom-0 z-10 -mx-1 mt-2 border-t-2 border-inkoust bg-papir/95 px-1 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-inkoust/70" aria-live="polite">
            {maZmeny ? "Máš neuložené změny." : "Žádné změny."}
          </p>
          <button
            type="submit"
            disabled={uklada || !maZmeny}
            aria-busy={uklada}
            className="min-h-[44px] min-w-[44px] touch-manipulation rounded bg-inkoust px-6 py-2.5 text-base font-bold text-papir select-none transition-opacity disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inkoust focus-visible:ring-offset-2 focus-visible:ring-offset-papir"
          >
            {uklada ? "Ukládám…" : "Uložit změny"}
          </button>
        </div>
      </div>
    </form>
  );
}
