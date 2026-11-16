import { lazy, Suspense, type JSX, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import RequireAuth from "./components/Auth/RequireAuth";
import StrankaKostra from "./components/StrankaKostra";
import { ClenProfilProvider } from "./components/clen/ClenProfil";
import DenikPlocha from "./components/denik/DenikPlocha";
import Navbar from "./components/Navbar/Navbar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { KonverzacePrehledProvider } from "./hooks/useKonverzacePrehled";
import DomuPage from "./pages/DomuPage";
import LoginPage from "./pages/LoginPage";

const AdminClenovePage = lazy(() => import("./pages/AdminClenovePage"));
const AdminKodyPage = lazy(() => import("./pages/AdminKodyPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const FotkyPage = lazy(() => import("./pages/FotkyPage"));
const ProfilPage = lazy(() => import("./pages/ProfilPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const VypravyNahledPage = lazy(() => import("./pages/VypravyNahledPage"));
const ZebrickyPage = lazy(() => import("./pages/ZebrickyPage"));
const ZpevnikPage = lazy(() => import("./pages/ZpevnikPage"));
const ZpevnikPisenPage = lazy(() => import("./pages/ZpevnikPisenPage"));
const ZpevnikNavrhPage = lazy(() => import("./pages/ZpevnikNavrhPage"));
const ZpevnikNavrhUpravaPage = lazy(() => import("./pages/ZpevnikNavrhUpravaPage"));
const ZpevnikFrontaPage = lazy(() => import("./pages/ZpevnikFrontaPage"));
const ZpevnikUpravaPage = lazy(() => import("./pages/ZpevnikUpravaPage"));

/** Route chunks load after the shell. The landing page and login stay in the first script. */
function OdlozenaStranka(props: { children: ReactNode }): JSX.Element {
  return <Suspense fallback={<StrankaKostra />}>{props.children}</Suspense>;
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

/** Vnitřek pod AuthProviderem — umí podmínit Navbar podle session (varianta A). */
function AppObsah(): JSX.Element {
  const { user, isLoading } = useAuth();
  const prihlasen = !isLoading && user !== null;
  if (isLoading) {
    return (
      <DenikPlocha>
        <div className="min-h-dvh bg-papir text-inkoust">
          <StrankaKostra />
        </div>
      </DenikPlocha>
    );
  }
  return (
    <DenikPlocha>
      <div className="flex min-h-dvh flex-col bg-papir text-inkoust">
        {prihlasen ? <Navbar /> : null}
        <div className={`flex-1 ${prihlasen ? "pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-8" : ""}`}>
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
