/**
 * When the profile form needs the current password. The server enforces the
 * same rule. It compares e-mails the same way, so an unchanged address never
 * asks for the password.
 */

/** True when the address really changes (case and outer spaces do not count). */
export function meniEmail(novy: string, puvodni: string): boolean {
  return novy.trim().toLowerCase() !== puvodni.trim().toLowerCase();
}

export function potrebujeSoucasneHeslo(hodnoty: {
  email: string;
  puvodniEmail: string;
  noveHeslo: string;
  potvrzeniHesla: string;
}): boolean {
  return (
    hodnoty.noveHeslo.length > 0 ||
    hodnoty.potvrzeniHesla.length > 0 ||
    meniEmail(hodnoty.email, hodnoty.puvodniEmail)
  );
}
