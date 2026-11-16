/**
 * Browser push subscription. The gesture must come from a click.
 * Dev mode has no service worker, so the call explains that.
 */
import { apiBase } from "./api-base";
import { ctiJsonTelo, jeRecord } from "./api-odpoved";
import { PUSH_KLIC_PATH, PUSH_ODBER_PATH } from "../shared/api-typy/push";

export type VysledekOdberu = { ok: true } | { ok: false; chyba: string };

function jeIphone(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function jeSamostatneOkno(): boolean {
  const ios = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || ios.standalone === true;
}

function klicZBase64(verejny: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (verejny.length % 4)) % 4);
  const base64 = (verejny + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function registrace(): Promise<ServiceWorkerRegistration> {
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => {
      window.setTimeout(() => reject(new Error("sw")), 4000);
    }),
  ]);
}

export async function zapniOznameni(): Promise<VysledekOdberu> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, chyba: "Tenhle prohlížeč oznámení na plochu neumí." };
  }
  if (jeIphone() && !jeSamostatneOkno()) {
    return {
      ok: false,
      chyba: "Na iPhonu přidej ExApp na plochu. Oznámení chodí od iOS 16.4 a jen z ikony na ploše.",
    };
  }
  const povoleni = await Notification.requestPermission();
  if (povoleni !== "granted") {
    return { ok: false, chyba: "Oznámení jsou v prohlížeči vypnutá." };
  }
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: "Oznámení se nepodařilo zapnout." };
  try {
    const klicOdpoved = await fetch(`${zaklad}${PUSH_KLIC_PATH}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const klicTelo = await ctiJsonTelo(klicOdpoved);
    const verejny = jeRecord(klicTelo) ? klicTelo["verejnyKlic"] : null;
    if (!klicOdpoved.ok || typeof verejny !== "string" || verejny.length === 0) {
      return { ok: false, chyba: "Oznámení na telefon teď nejsou zapnutá." };
    }
    const sw = await registrace();
    const odber = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: klicZBase64(verejny),
    });
    const json = odber.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      return { ok: false, chyba: "Prohlížeč odběr nevytvořil." };
    }
    const ulozeni = await fetch(`${zaklad}${PUSH_ODBER_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, p256dh, auth }),
    });
    if (!ulozeni.ok) return { ok: false, chyba: "Oznámení se nepodařilo uložit." };
    return { ok: true };
  } catch {
    return {
      ok: false,
      chyba: "Oznámení fungují v nainstalované aplikaci. Tady service worker neběží.",
    };
  }
}

export async function vypniOznameni(): Promise<VysledekOdberu> {
  const zaklad = apiBase();
  try {
    if ("serviceWorker" in navigator) {
      const sw = await registrace();
      const odber = await sw.pushManager.getSubscription();
      await odber?.unsubscribe();
    }
    if (zaklad.length > 0) {
      await fetch(`${zaklad}${PUSH_ODBER_PATH}`, { method: "DELETE", credentials: "include" });
    }
    return { ok: true };
  } catch {
    return { ok: false, chyba: "Oznámení se nepodařilo vypnout." };
  }
}
