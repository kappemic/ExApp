import { lazy, Suspense, useLayoutEffect, useRef, type JSX, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import RequireAuth from "./components/Auth/RequireAuth";
import StrankaKostra from "./components/StrankaKostra";
import { ClenProfilProvider } from "./components/clen/ClenProfil";
import DenikPlocha from "./components/denik/DenikPlocha";
import Navbar from "./components/Navbar/Navbar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { KonverzacePrehledProvider } from "./hooks/useKonverzacePrehled";
import DomuPage from "./pages/DomuPage";
import LoginPage from "./pages/LoginPage";
import { useNabeh } from "./lib/pohyb";

const AdminClenovePage = lazy(() => import("./pages/AdminClenovePage"));
const AdminKodyPage = lazy(() => import("./pages/AdminKodyPage"));
const ClenDetailPage = lazy(() => import("./pages/ClenDetailPage"));
const NastaveniPage = lazy(() => import("./pages/NastaveniPage"));
const VicePage = lazy(() => import("./pages/VicePage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const FotkyPage = lazy(() => import("./pages/FotkyPage"));
const ProfilPage = lazy(() => import("./pages/ProfilPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const VypravyNahledPage = lazy(() => import("./pages/VypravyNahledPage"));
const VypravaDetailPage = lazy(() => import("./pages/VypravaDetailPage"));
const KdoJedePage = lazy(() => import("./pages/KdoJedePage"));
const NovaVypravaPage = lazy(() => import("./pages/NovaVypravaPage"));
const KilometryPage = lazy(() => import("./pages/KilometryPage"));
const ZebrickyPage = lazy(() => import("./pages/ZebrickyPage"));
const ZpevnikPage = lazy(() => import("./pages/ZpevnikPage"));
const ZpevnikPisenPage = lazy(() => import("./pages/ZpevnikPisenPage"));
const ZpevnikNavrhPage = lazy(() => import("./pages/ZpevnikNavrhPage"));
const ZpevnikNavrhUpravaPage = lazy(() => import("./pages/ZpevnikNavrhUpravaPage"));
const ZpevnikFrontaPage = lazy(() => import("./pages/ZpevnikFrontaPage"));
const ZpevnikUpravaPage = lazy(() => import("./pages/ZpevnikUpravaPage"));

/** Route chunks load after the shell. The landing page and login stay in the first script. */
function OdlozenaStranka(props: { children: ReactNode }): JSX.Element {
  return <Suspense fallback={<StrankaKostra vnitrni />}>{props.children}</Suspense>;
}

/** Old preview URL keeps its query and lands on the journal. */
function NahledNaVypravy(): JSX.Element {
  const [params] = useSearchParams();
  const dotaz = params.toString();
  return (
    <Navigate to={dotaz.length > 0 ? `/vypravy?${dotaz}` : "/vypravy"} replace />
  );
}

/** Unknown URL: public landing when signed out, expeditions when signed in. */
function NeznamaCesta(): JSX.Element {
  const { user, isLoading } = useAuth();
  if (isLoading) return <StrankaKostra />;
  return <Navigate to={user === null ? "/" : "/vypravy"} replace />;
}

/** Posun stránky podle záznamu v historii, drží se jen po dobu běhu aplikace. */
const posunyStranek = new Map<string, number>();

/**
 * Nová stránka začíná nahoře, zpět a vpřed se vrací tam, kde člověk byl.
 * Prohlížeč to sám neumí, protože data se načítají až po návratu a stránka je
 * chvíli kratší: posun se proto zkouší, dokud obsah nedoroste.
 */
function usePosunStranky(): void {
  const { pathname, key } = useLocation();
  const typ = useNavigationType();
  const predchozi = useRef(pathname);
  const klic = useRef(key);

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
    const zapis = (): void => {
      posunyStranek.set(klic.current, window.scrollY);
    };
    window.addEventListener("scroll", zapis, { passive: true });
    return () => window.removeEventListener("scroll", zapis);
  }, []);

  useLayoutEffect(() => {
    klic.current = key;
    if (predchozi.current === pathname) return;
    predchozi.current = pathname;
    const cil = typ === "POP" ? (posunyStranek.get(key) ?? 0) : 0;
    window.scrollTo(0, cil);
    if (cil === 0) return;
    const konec = performance.now() + 2000;
    let snimek = 0;
    const dorovnej = (): void => {
      if (Math.abs(window.scrollY - cil) > 1) window.scrollTo(0, cil);
      if (Math.abs(window.scrollY - cil) > 1 && performance.now() < konec) snimek = requestAnimationFrame(dorovnej);
    };
    const prerus = (): void => cancelAnimationFrame(snimek);
    snimek = requestAnimationFrame(dorovnej);
    window.addEventListener("wheel", prerus, { passive: true, once: true });
    window.addEventListener("touchstart", prerus, { passive: true, once: true });
    return () => {
      prerus();
      window.removeEventListener("wheel", prerus);
      window.removeEventListener("touchstart", prerus);
    };
  }, [pathname, key, typ]);
}

/** Obloha pod stavovým řádkem telefonu a hřebeny pod ní. iOS píše čas bíle, potřebuje tmavý podklad. */
function Vrsek(): JSX.Element {
  return (
    <div aria-hidden="true">
      <div className="vrsek-hreben" />
      <div className="vrsek-pruh" />
    </div>
  );
}

/** Vnitřek pod AuthProviderem — umí podmínit Navbar podle session (varianta A). */
function AppObsah(): JSX.Element {
  const { user, isLoading } = useAuth();
  const prihlasen = !isLoading && user !== null;
  const { pathname } = useLocation();
  const strankaRef = useNabeh<HTMLDivElement>(pathname, "zadna");
  usePosunStranky();
  if (isLoading) {
    return (
      <DenikPlocha>
        <div className="relative min-h-dvh bg-papir pt-(--horni-okraj) text-inkoust">
          <Vrsek />
          <StrankaKostra />
        </div>
      </DenikPlocha>
    );
  }
  return (
    <DenikPlocha>
      <div className="relative flex min-h-dvh flex-col bg-papir text-inkoust">
        {prihlasen ? (
          <>
            <Vrsek />
            <Navbar />
          </>
        ) : null}
        <div ref={strankaRef} className={`exapp-vstup w-full min-w-0 flex-1 ${prihlasen ? "pt-(--horni-okraj) pb-[calc(76px+env(safe-area-inset-bottom,0px))] min-[90rem]:pb-8" : ""}`}>
          <Routes>
            <Route path="/" element={<DomuPage />} />
            <Route
              path="/vypravy"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <VypravyNahledPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route path="/vypravy/nahled" element={<NahledNaVypravy />} />
            <Route
              path="/vypravy/nova"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <NovaVypravaPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/vypravy/:id/kdo-jede"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <KdoJedePage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/vypravy/:id"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <VypravaDetailPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zpevnik"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZpevnikPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zpevnik/navrh"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZpevnikNavrhPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zpevnik/navrh/:id"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZpevnikNavrhUpravaPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zpevnik/fronta"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZpevnikFrontaPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zpevnik/:id/upravit"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZpevnikUpravaPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zpevnik/:id"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZpevnikPisenPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zebricky"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ZebrickyPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/zebricky/kilometry"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <KilometryPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/fotky"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <FotkyPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/fotky/:albumId"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <FotkyPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/chat"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ChatPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/profil"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ProfilPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/vice"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <VicePage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/nastaveni"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <NastaveniPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/register"
              element={
                <OdlozenaStranka>
                  <RegisterPage />
                </OdlozenaStranka>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin/kody"
              element={
                <RequireAuth adminOnly povolitBootstrap>
                  <OdlozenaStranka>
                    <AdminKodyPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route path="/admin/clenove" element={<Navigate to="/cleny" replace />} />
            <Route
              path="/cleny"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <AdminClenovePage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route
              path="/cleny/:id"
              element={
                <RequireAuth>
                  <OdlozenaStranka>
                    <ClenDetailPage />
                  </OdlozenaStranka>
                </RequireAuth>
              }
            />
            <Route path="*" element={<NeznamaCesta />} />
          </Routes>
        </div>
      </div>
    </DenikPlocha>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <KonverzacePrehledProvider>
          <ClenProfilProvider>
            <AppObsah />
          </ClenProfilProvider>
        </KonverzacePrehledProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
