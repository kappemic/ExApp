import { useEffect } from "react";
import type { JSX, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import "../vypravy-nahled/nocturne.css";

/**
 * Shell celé aplikace: proměnné žijí v `.nocturne` a tenký posuvník stránky
 * se zapíná jen na výpravách (`html.nahled-stranka`). Písma (Onest, Bricolage
 * Grotesque) jsou self-hosted a importují se v `main.tsx`.
 */
export default function DenikPlocha({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { pathname } = useLocation();
  const jeDenik = pathname === "/vypravy";

  useEffect(() => {
    if (!jeDenik) return;
    const html = document.documentElement;
    html.classList.add("nahled-stranka");
    let casovac = 0;
    function ukaz(): void {
      html.classList.add("nahled-scrolluje");
      window.clearTimeout(casovac);
      casovac = window.setTimeout(() => {
        html.classList.remove("nahled-scrolluje");
      }, 700);
    }
    window.addEventListener("scroll", ukaz, { passive: true });
    window.addEventListener("wheel", ukaz, { passive: true });
    window.addEventListener("touchmove", ukaz, { passive: true });
    return () => {
      window.clearTimeout(casovac);
      html.classList.remove("nahled-stranka", "nahled-scrolluje");
      window.removeEventListener("scroll", ukaz);
      window.removeEventListener("wheel", ukaz);
      window.removeEventListener("touchmove", ukaz);
    };
  }, [jeDenik]);

  return <div className="nocturne">{children}</div>;
}
