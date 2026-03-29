import { useEffect, useState } from "react";
import { apiFetch } from "./api/client";

type HealthResponse = {
  status: string;
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<HealthResponse>("/health")
      .then((response) => {
        setHealth(response);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error ? requestError.message : "Request failed"
        );
      });
  }, []);

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-16 text-stone-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
            Versmedit
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            React + TypeScript + Vite
          </h1>
          <p className="max-w-2xl text-base text-stone-300">
            Frontend listo y conectado al backend mediante el proxy de Vite.
          </p>
        </div>

        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <p className="text-sm font-medium text-emerald-200">Backend health</p>
          <p className="mt-2 text-lg text-white">
            {health ? JSON.stringify(health) : error ?? "Consultando /api/health..."}
          </p>
        </section>
      </div>
    </main>
  );
}