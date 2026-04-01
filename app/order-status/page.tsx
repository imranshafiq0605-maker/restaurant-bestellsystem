"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

type Order = {
  orderNumber: number;
  kunde: {
    name: string;
    telefon: string;
    adresse: string;
  };
  artikel: any[];
  gesamtpreis: number;
  bestellart: "abholung" | "lieferung";
  confirmedMinutes?: number;
  createdAt?: any;
};

export default function OrderStatusPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const paid = params.get("paid");

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;

    const loadOrder = async () => {
      const ref = doc(db, "bestellungen", id);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setOrder(snap.data() as Order);
      }

      setLoading(false);
    };

    loadOrder();
  }, [id]);

  // 🔥 Countdown berechnen
  useEffect(() => {
    if (!order?.confirmedMinutes || !order?.createdAt) return;

    const start = order.createdAt?.toDate?.() || new Date();
    const totalMs = order.confirmedMinutes * 60 * 1000;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const diff = start.getTime() + totalMs - now;

      const minutes = Math.max(0, Math.floor(diff / 60000));
      setRemaining(minutes);
    }, 1000);

    return () => clearInterval(interval);
  }, [order]);

  if (loading) return <p style={{ padding: 40 }}>Lädt...</p>;
  if (!order) return <p style={{ padding: 40 }}>Bestellung nicht gefunden</p>;

  // 🔥 STATUS LOGIK
  let statusText = "Wird geladen...";
  let subText = "";

  if (paid === "true" && !order.confirmedMinutes) {
    statusText = "Bezahlt";
    subText = "Lieferzeit wird noch bestätigt";
  }

  if (order.confirmedMinutes && remaining !== null && remaining > 0) {
    statusText = "Bezahlt";
    subText = `Noch ${remaining} Minuten`;
  }

  if (order.confirmedMinutes && remaining === 0) {
    if (order.bestellart === "lieferung") {
      statusText = "Fast da";
    } else {
      statusText = "Abholbereit";
    }
    subText = "";
  }

  // 🔥 Fortschritt berechnen
  let progress = 0;

  if (order.confirmedMinutes && remaining !== null) {
    progress =
      ((order.confirmedMinutes - remaining) / order.confirmedMinutes) * 100;
  }

  return (
    <main className="container" style={{ padding: "40px 20px" }}>
      {/* 🔥 STATUS CARD */}
      <div
        style={{
          background: "#111",
          color: "#fff",
          padding: 30,
          borderRadius: 16,
          marginBottom: 30,
        }}
      >
        <h1 style={{ margin: 0 }}>{statusText}</h1>
        <p style={{ opacity: 0.7 }}>{subText}</p>

        {order.confirmedMinutes && remaining !== null && remaining > 0 && (
          <>
            <div
              style={{
                height: 8,
                background: "#333",
                borderRadius: 10,
                marginTop: 20,
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "#22c55e",
                  borderRadius: 10,
                  transition: "0.3s",
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* 🔥 KUNDEN INFO */}
      <div
        style={{
          background: "#fff",
          padding: 20,
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <h3>Kundendaten</h3>
        <p><strong>Name:</strong> {order.kunde.name}</p>
        <p><strong>Telefon:</strong> {order.kunde.telefon}</p>
        <p><strong>Adresse:</strong> {order.kunde.adresse}</p>
        <p><strong>Art:</strong> {order.bestellart}</p>
      </div>

      {/* 🔥 BESTELLUNG */}
      <div
        style={{
          background: "#fff",
          padding: 20,
          borderRadius: 12,
        }}
      >
        <h3>Bestellung</h3>

        {order.artikel.map((item, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <strong>
              {item.quantity}× {item.name}
            </strong>
            <div style={{ fontSize: 14, opacity: 0.7 }}>
              {item.variantName}
            </div>
            <div>{(item.price * item.quantity).toFixed(2)} €</div>
          </div>
        ))}

        <hr />

        <h3>{order.gesamtpreis.toFixed(2)} €</h3>
      </div>
    </main>
  );
}