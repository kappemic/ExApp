import type { JSX } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/Auth/RequireAuth";
import Navbar from "./components/Navbar/Navbar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import AdminClenovePage from "./pages/AdminClenovePage";
import AdminKodyPage from "./pages/AdminKodyPage";
import ChatPage from "./pages/ChatPage";
import DomuPage from "./pages/DomuPage";
import LoginPage from "./pages/LoginPage";
import ProfilPage from "./pages/ProfilPage";
import RegisterPage from "./pages/RegisterPage";
import VypravyPage from "./pages/VypravyPage";
import ZebrickyPage from "./pages/ZebrickyPage";

/** Vnitřek pod AuthProviderem — umí podmínit Navbar podle session (varianta A). */
function GaleriePaticka(): JSX.Element {
  return (
    <footer className="border-t-2 border-inkoust bg-inkoust text-papir">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3">
        <div>
          <p className="font-galerie text-4xl italic">ExApp</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-papir/70">
            Umělecký prostor a digitální galerie s nejlepšími trasami
            našeho oddílu.
          </p>
        </div>
        <nav aria-label="Mapa galerie" className="flex gap-10 text-sm">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-papir/50">
              Galerie
            </span>
            <a href="/vypravy" className="text-papir/80 hover:text-papir">Výpravy</a>
            <a href="/zebricky" className="text-papir/80 hover:text-papir">Žebříčky</a>
            <a href="/chat" className="text-papir/80 hover:text-papir">Nástěnka</a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-papir/50">
              Oddíl
            </span>
            <a href="/profil" className="text-papir/80 hover:text-papir">Profil</a>
            <a href="/login" className="text-papir/80 hover:text-papir">Přihlášení</a>
            <a href="/register" className="text-papir/80 hover:text-papir">Registrace</a>
          </div>
        </nav>
        <div className="lg:text-right">
          <p className="font-galerie text-5xl italic tabular-nums">13 945</p>
          <p className="mt-1 text-[12px] uppercase tracking-[0.2em] text-papir/60">
            kroků v kronice
          </p>
          <p className="mt-4 text-[12px] text-papir/50">
            © 2026 ExApp · všechna práva vyhrazena
          </p>
        </div>
      </div>
    </footer>
  );
}

function AppObsah(): JSX.Element {
  const { user, isLoading } = useAuth();
  const prihlasen = !isLoading && user !== null;
  return (
    <div className="flex min-h-dvh flex-col bg-papir text-inkoust">
      {prihlasen ? <Navbar /> : null}
      <div className={`flex-1 ${prihlasen ? "pb-28 lg:pb-8" : ""}`}>
        <Routes>
          <Route path="/" element={<DomuPage />} />
          <Route
            path="/vypravy"
            element={
              <RequireAuth>
                <VypravyPage />
              </RequireAuth>
            }
          />
          <Route path="/zebricky" element={<ZebrickyPage />} />
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
              <RequireAuth adminOnly>
                <AdminClenovePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <GaleriePaticka />
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppObsah />
      </AuthProvider>
    </BrowserRouter>
  );
}
