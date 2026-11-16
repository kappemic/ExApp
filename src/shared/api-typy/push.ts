/**
 * Device notifications for a home-screen PWA.
 * The public VAPID key is not a secret. The private key never leaves the server.
 */

export const PUSH_KLIC_PATH = "/api/push/verejny-klic" as const;
export const PUSH_ODBER_PATH = "/api/push/odber" as const;

export interface PushVerejnyKlicResponse {
  verejnyKlic: string | null;
}

export interface PushOdberRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushOdberResponse {
  ok: true;
}
