/**
 * drizzle/schema/index.ts — centrální re-export všech drizzle tabulek.
 *
 * Server-only read/write model (Neon + Drizzle). Nové tabulky se přidávají
 * aditivně — vždy přidat export zde + idempotentní SQL migraci
 * v `drizzle/migrations/` (pouze CREATE / ADD IF NOT EXISTS, nikdy DROP).
 */
export { users } from "./users";
export type { User, NewUser } from "./users";
export { clenove } from "./clenove";
export type { ClenRow, NewClenRow } from "./clenove";
export { expeditions } from "./expeditions";
export type { ExpeditionRow, NewExpeditionRow } from "./expeditions";
export { participants } from "./participants";
export type { Participant, NewParticipant } from "./participants";
export { photos } from "./photos";
export type { Photo, NewPhoto } from "./photos";
export { meetings, meetingExceptions } from "./meetings";
export type {
  Meeting,
  NewMeeting,
  MeetingException,
  NewMeetingException,
} from "./meetings";
export { registrationCodes } from "./registration_codes";
export type {
  RegistrationCode,
  NewRegistrationCode,
} from "./registration_codes";
export { stravaTokens } from "./strava_tokens";
export type { StravaTokensRow, NewStravaTokensRow } from "./strava_tokens";
export { zpravy } from "./zpravy";
export type { Zprava, NovaZprava } from "./zpravy";
