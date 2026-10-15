import { useEffect, useState } from "react";
import { nactiNahledFotkaId } from "../lib/expedition-fotky";

/**
 * Cover id for one expedition. A list payload (`string` or `null`) wins
 * and does not fetch. `undefined` resolves in the background, cached per id.
 */
export function useNahledFotkaId(
  expeditionId: string,
  zname: string | null | undefined,
): string | null {
  const [id, setId] = useState<string | null>(zname ?? null);

  useEffect(() => {
    if (zname !== undefined) {
      setId(zname);
      return;
    }
    let zive = true;
    void nactiNahledFotkaId(expeditionId).then((nalezeno) => {
      if (zive) setId(nalezeno);
    });
    return () => {
      zive = false;
    };
  }, [expeditionId, zname]);

  return id;
}
