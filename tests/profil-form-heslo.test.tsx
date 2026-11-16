import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileForm from "../src/components/profil/ProfileForm";
import type { ApiUser } from "../src/shared/api-types";

const uzivatel = {
  id: "u1",
  email: "jan@example.cz",
  jmeno: "Jan",
  prijmeni: "Novák",
} as ApiUser;

describe("ProfileForm: současné heslo", () => {
  const html = renderToStaticMarkup(
    <ProfileForm pocatecni={uzivatel} onUlozeno={() => undefined} />,
  );

  it("pole je vidět mimo sekci nového hesla, s nápovědou", () => {
    const pole = html.indexOf('id="profil-soucasne-heslo"');
    expect(pole).toBeGreaterThan(-1);
    expect(pole).toBeLessThan(html.indexOf("<fieldset"));
    expect(html).toContain("Vyplň jen při změně e-mailu nebo hesla.");
    expect(html).toContain('aria-describedby="profil-soucasne-heslo-napoveda"');
  });
});
