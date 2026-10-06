import type { CSSProperties, JSX } from "react";
import { ROLE_LIST, getRoleStyle, type Role } from "../../config/roles";

interface RoleBadgeProps {
  role: Role;
}

const NAZVY: Record<Role, string> = Object.fromEntries(
  ROLE_LIST.map((r) => [r.id, r.nazev]),
) as Record<Role, string>;

/**
 * Badge hodnosti — barvy čte výhradně z getRoleStyle (roles.ts),
 * v komponentě není žádný hardcoded hex.
 */
export default function RoleBadge({ role }: RoleBadgeProps): JSX.Element {
  const styl = getRoleStyle(role);
  const inline: CSSProperties = {
    backgroundColor: styl.background,
    color: styl.color,
    borderColor: styl.border,
  };

  return (
    <span
      style={inline}
      className="inline-flex min-h-[28px] items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide"
    >
      {NAZVY[role] ?? role}
    </span>
  );
}
