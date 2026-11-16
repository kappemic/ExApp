/**
 * Superadmin flag rules: auth role mapping and admin/superadmin coupling.
 */
import { describe, expect, it } from "vitest";
import { authRoleZRadku, slucAdminASuperadmin } from "../server/src/auth";

describe("authRoleZRadku", () => {
  it("superadmin beats admin", () => {
    expect(authRoleZRadku(true, true)).toBe("SUPERADMIN");
    expect(authRoleZRadku(false, true)).toBe("SUPERADMIN");
  });

  it("admin bez superadmin bitu zustava ADMIN", () => {
    expect(authRoleZRadku(true, false)).toBe("ADMIN");
  });

  it("bez obou bitu je USER", () => {
    expect(authRoleZRadku(false, false)).toBe("USER");
  });
});

describe("slucAdminASuperadmin", () => {
  const beznyAdmin = { isAdmin: true, isSuperadmin: false };

  it("zapnuti hlavniho admina zapne i admina", () => {
    expect(
      slucAdminASuperadmin(
        { isAdmin: false, isSuperadmin: false },
        { isSuperadmin: true },
      ),
    ).toEqual({ isAdmin: true, isSuperadmin: true });
  });

  it("sundani admina sundá i hlavniho admina", () => {
    expect(
      slucAdminASuperadmin(
        { isAdmin: true, isSuperadmin: true },
        { isAdmin: false },
      ),
    ).toEqual({ isAdmin: false, isSuperadmin: false });
  });

  it("bezny admin muze dostat jen admin bit", () => {
    expect(slucAdminASuperadmin(beznyAdmin, { isAdmin: true })).toEqual(beznyAdmin);
  });
});
