import { Component, type ReactNode } from "react";

interface Vlastnosti {
  /** Jiná adresa chybu zruší. Není to `key`, ten by stránku vždy namontoval znovu. */
  cesta: string;
  children: ReactNode;
}

interface Stav {
  spadla: boolean;
}

/**
 * Stránka, jejíž kód se nenačetl (bez sítě, nebo po nasazení nové verze),
 * nesmí shodit celou aplikaci do prázdna. Lišta zůstává, jde odejít jinam.
 */
export default class ChybaStranky extends Component<Vlastnosti, Stav> {
  state: Stav = { spadla: false };

  static getDerivedStateFromError(): Stav {
    return { spadla: true };
  }

  componentDidUpdate(predchozi: Vlastnosti): void {
    if (this.state.spadla && predchozi.cesta !== this.props.cesta) this.setState({ spadla: false });
  }

  render(): ReactNode {
    if (!this.state.spadla) return this.props.children;
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-10" role="alert">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust">
          Stránka se neotevřela
        </h1>
        <p className="mt-3 text-base leading-relaxed text-mech">
          Nejspíš chybí spojení, nebo mezitím vyšla nová verze. Zkus stránku načíst znovu, ostatní stránky jsou dál v
          menu.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="nahled-press mt-6 inline-flex min-h-11 items-center rounded-xl bg-smrk px-5 text-sm font-semibold text-papir focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Načíst znovu
        </button>
      </main>
    );
  }
}
