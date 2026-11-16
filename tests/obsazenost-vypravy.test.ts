import { describe, expect, it } from "vitest";
import { stavPodleObsazenosti } from "../src/shared/obsazenost-vypravy";

describe("stavPodleObsazenosti", () => {
  it("je skoro plno jen při 1 až 3 volných místech", () => {
    expect(stavPodleObsazenosti(16, 13)).toBe("skoro plno");
    expect(stavPodleObsazenosti(16, 14)).toBe("skoro plno");
    expect(stavPodleObsazenosti(16, 15)).toBe("skoro plno");
  });

  it("čtyři a víc volných míst je volno", () => {
    expect(stavPodleObsazenosti(16, 12)).toBe("volno");
    expect(stavPodleObsazenosti(16, 0)).toBe("volno");
  });

  it("plná výprava a výprava bez omezení nejsou skoro plno", () => {
    expect(stavPodleObsazenosti(16, 16)).toBe("volno");
    expect(stavPodleObsazenosti(0, 4)).toBe("volno");
  });
});
