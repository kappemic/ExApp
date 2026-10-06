import type { JSX } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import { useAdminFlag } from "./hooks/useAdminFlag";
import AdminClenovePage from "./pages/AdminClenovePage";
import ChatPage from "./pages/ChatPage";
import DomuPage from "./pages/DomuPage";
import ProfilPage from "./pages/ProfilPage";
import VypravyPage from "./pages/VypravyPage";
import ZebrickyPage from "./pages/ZebrickyPage";

/** Guard pro /admin/clenove — pouze UI, bez backendu. */
function AdminGate(): JSX.Element {
  const [jeAdmin] = useAdminFlag();

  if (!jeAdmin) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div
          role="alert"
          className="rounded-lg border-2 border-inkoust bg-white/60 p-6 text-center shadow-denik"
        >
          <h1 className="text-2xl font-extrabold tracking-tight">
            Nemáš přístup
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Tato stránka je jen pro demo admin režim. Zapni přepínač
            „Admin demo“ nebo otevři adresu s&nbsp;parametrem{" "}
            <code className="rounded border border-linka bg-papir px-1 font-mono text-[13px]">
              ?admin=1
            </code>
            .
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md border-2 border-inkoust bg-smrk px-4 py-2 text-sm font-bold text-papir transition-colors hover:bg-inkoust"
          >
            <span aria-hidden="true">←</span> Domů
          </Link>
        </div>
      </main>
    );
  }

  return <AdminClenovePage />;
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <div className="flex min-h-dvh flex-col bg-papir text-inkoust">
        <Navbar />
        <div className="flex-1 pb-12 lg:pb-8">
          <Routes>
            <Route path="/" element={<DomuPage />} />
            <Route path="/vypravy" element={<VypravyPage />} />
            <Route path="/zebricky" element={<ZebrickyPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/profil" element={<ProfilPage />} />
            <Route path="/admin/clenove" element={<AdminGate />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
