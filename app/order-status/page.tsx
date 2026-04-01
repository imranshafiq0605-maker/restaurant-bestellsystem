"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function OrderStatusContent() {
  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "5.50";

  const [timeLeft, setTimeLeft] = useState(900);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = ((900 - timeLeft) / 900) * 100;

  return (
    <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="max-w-3xl w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dein Bestellstatus</h1>
          <p className="text-gray-500">
            Hier siehst du den aktuellen Stand deiner Bestellung
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow space-y-4">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-400">STATUS</p>
              <p className="font-semibold text-green-600">
                {timeLeft === 0 ? "Abholbereit" : "Fast da"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-400">GESAMT</p>
              <p className="font-semibold">{amount} €</p>
            </div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-black h-3 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-center text-xl font-semibold">
            {timeLeft === 0
              ? "Bereit zur Abholung"
              : `${minutes}:${seconds.toString().padStart(2, "0")}`}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow">
          <h2 className="font-semibold mb-4">Bestellübersicht</h2>
          <div className="flex justify-between">
            <span>Roghani Naan</span>
            <span>{amount} €</span>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Lädt...</p>}>
      <OrderStatusContent />
    </Suspense>
  );
}