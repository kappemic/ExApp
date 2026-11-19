import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import { NavrhPisneForm } from "../components/zpevnik/NavrhPisneForm";
import HlavickaZpet from "../components/HlavickaZpet";

export default function ZpevnikNavrhPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-8 pt-6 sm:px-6 sm:pt-8 lg:max-w-2xl lg:px-8">
      <HlavickaZpet zpet="/zpevnik" zpetPopisek="Zpět do zpěvníku" titulek="Návrh písně" varianta="nadpis" />
      <div className="mt-6">
        <NavrhPisneForm
          onZavrit={() => void navigate("/zpevnik")}
          onHotovo={() => void navigate("/zpevnik/fronta")}
        />
      </div>
    </main>
  );
}