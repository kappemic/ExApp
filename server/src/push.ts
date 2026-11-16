/**
 * Web Push for an installed PWA. A failed send never fails the message.
 * VAPID keys are read only through prostredi.ts.
 */
import { createRequire } from "node:module";
import { eq, inArray } from "drizzle-orm";
import type { PushSubscription, RequestOptions, SendResult } from "web-push";
import { pushOdbery } from "../../drizzle/schema/push_odbery";
import { users } from "../../drizzle/schema/users";
import { idPrijemcu, rozparsujZminky, type ClenProZminku } from "../../src/shared/zminky";
import { getDb } from "./db";
import { ctiEnv } from "./prostredi";

const webpush = createRequire(import.meta.url)("web-push") as {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions,
  ): Promise<SendResult>;
};

interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushTelo {
  title: string;
  body: string;
  url: string;
}

function ctiVapid(): Vapid | null {
  const publicKey = ctiEnv("VAPID_PUBLIC_KEY")?.trim() ?? "";
  const privateKey = ctiEnv("VAPID_PRIVATE_KEY")?.trim() ?? "";
  const subject = ctiEnv("VAPID_SUBJECT")?.trim() ?? "";
  if (publicKey.length === 0 || privateKey.length === 0 || subject.length === 0) return null;
  return { publicKey, privateKey, subject };
}

export function verejnyKlicPush(): string | null {
  return ctiVapid()?.publicKey ?? null;
}

function nahled(text: string): string {
  const cisty = text.replace(/\s+/g, " ").trim();
  if (cisty.length === 0) return "Poslal přílohu.";
  if (cisty.length <= 140) return cisty;
  return `${cisty.slice(0, 137)}…`;
}

function kodOdpovedi(chyba: unknown): number | null {
  if (typeof chyba !== "object" || chyba === null) return null;
  const status = (chyba as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

async function odesli(prijemci: readonly string[], telo: PushTelo): Promise<void> {
  const vapid = ctiVapid();
  if (vapid === null || prijemci.length === 0) return;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const db = getDb();
  const odbery = await db
    .select()
    .from(pushOdbery)
    .where(inArray(pushOdbery.userId, [...prijemci]));
  await Promise.all(
    odbery.map(async (odber) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: odber.endpoint,
            keys: { p256dh: odber.p256dh, auth: odber.auth },
          },
          JSON.stringify(telo),
          { TTL: 60 * 60 * 12 },
        );
      } catch (chyba: unknown) {
        const kod = kodOdpovedi(chyba);
        if (kod === 404 || kod === 410) {
          await db.delete(pushOdbery).where(eq(pushOdbery.id, odber.id));
        }
      }
    }),
  );
}

/** Mention notifications for General and Důležité. Missing table is ignored. */
export async function oznameZminky(vstup: {
  text: string;
  autorId: string;
  autorJmeno: string;
  kanal: "general" | "dulezite";
}): Promise<void> {
  try {
    const zminky = rozparsujZminky(vstup.text);
    if (zminky.length === 0) return;
    const db = getDb();
    const radky = await db
      .select({
        id: users.id,
        clenstvi: users.clenstvi,
        funkce: users.funkce,
        isAdmin: users.isAdmin,
        isSuperadmin: users.isSuperadmin,
      })
      .from(users);
    const lide: ClenProZminku[] = radky.map((radek) => ({
      id: radek.id,
      clenstvi: radek.clenstvi,
      funkce: radek.funkce,
      isAdmin: radek.isAdmin,
      isSuperadmin: radek.isSuperadmin,
    }));
    const prijemci = idPrijemcu(zminky, lide, vstup.autorId);
    const kanal = vstup.kanal === "dulezite" ? "Důležité" : "General";
    await odesli(prijemci, {
      title: kanal,
      body: `${vstup.autorJmeno.length > 0 ? vstup.autorJmeno : "Člen"}: ${nahled(vstup.text)}`,
      url: `/chat?konverzace=${vstup.kanal}`,
    });
  } catch {
    /* The message is already stored. */
  }
}

/** Private message wakes the other person. */
export async function oznameSoukromou(vstup: {
  partnerId: string;
  autorJmeno: string;
  text: string;
  klic: string;
}): Promise<void> {
  try {
    await odesli([vstup.partnerId], {
      title: "Soukromá zpráva",
      body: `${vstup.autorJmeno.length > 0 ? vstup.autorJmeno : "Člen"}: ${nahled(vstup.text)}`,
      url: `/chat?konverzace=${encodeURIComponent(vstup.klic)}`,
    });
  } catch {
    /* The message is already stored. */
  }
}
