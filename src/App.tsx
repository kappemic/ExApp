import type { JSX } from "react";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import RequireAuth from "./components/Auth/RequireAuth";
import { ClenProfilProvider } from "./components/clen/ClenProfil";
import Navbar from "./components/Navbar/Navbar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import AdminClenovePage from "./pages/AdminClenovePage";
import AdminKodyPage from "./pages/AdminKodyPage";
import ChatPage from "./pages/ChatPage";
import DomuPage from "./pages/DomuPage";
import FotkyPage from "./pages/FotkyPage";
import LoginPage from "./pages/LoginPage";
import ProfilPage from "./pages/ProfilPage";
import RegisterPage from "./pages/RegisterPage";
import VypravyNahledPage from "./pages/VypravyNahledPage";
import ZebrickyPage from "./pages/ZebrickyPage";

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
  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 pt-8">
        <p aria-busy="true">Načítám…</p>
      </main>
    );
  }
  return <Navigate to={user === null ? "/" : "/vypravy"} replace />;
}

/** Vnitřek pod AuthProviderem — umí podmínit Navbar podle session (varianta A). */
function AppObsah(): JSX.Element {
  const { user, isLoading } = useAuth();
  const prihlasen = !isLoading && user !== null;
  return (
    <div className="flex min-h-dvh flex-col bg-papir text-inkoust">
      {prihlasen ? <Navbar /> : null}
      <div className={`flex-1 ${prihlasen ? "pb-12 lg:pb-8" : ""}`}>
        <Routes>
          <Route path="/" element={<DomuPage />} />
          <Route
            path="/vypravy"
            element={
              <RequireAuth>
                <VypravyNahledPage />
              </RequireAuth>
            }
          />
          <Route path="/vypravy/nahled" element={<NahledNaVypravy />} />
          <Route path="/zebricky" element={<ZebrickyPage />} />
          <Route
            path="/fotky"
            element={
              <RequireAuth>
                <FotkyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/fotky/:albumId"
            element={
              <RequireAuth>
                <FotkyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profil"
            element={
              <RequireAuth>
                <ProfilPage />
              </RequireAuth>
            }
          />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin/kody"
            element={
              <RequireAuth adminOnly povolitBootstrap>
                <AdminKodyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/clenove"
            element={
              <RequireAuth>
                <AdminClenovePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NeznamaCesta />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ClenProfilProvider>
          <AppObsah />
        </ClenProfilProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
