"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

type OrderItem = {
  id?: number;
  name: string;
  price: number;
  quantity: number;
  variantName?: string;
  selectedOptions?: string[];
};

type OrderData = {
  orderNumber?: number;
  kunde?: {
    name?: string;
    telefon?: string;
    adresse?: string;
  };
  artikel?: OrderItem[];
  gesamtpreis?: number;
  bestellart?: "abholung" | "lieferung";
  status?: string;
  bezahlt?: boolean;
  confirmedMinutes?: number;
  lieferzeitMinuten?: number;
  estimatedMinutes?: number;
  confirmedAt?: any;
  updatedAt?: any;
  createdAt?: any;
};

function formatEuro(value?: number) {
  return `${(value || 0).toFixed(2)} €`;
}

function getDateFromFirestoreField(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function OrderStatusContent() {
  const searchParams = useSearchParams();
  const orderId =
    searchParams.get("id") || searchParams.get("pendingOrderId");
  const paidFromUrl = searchParams.get("paid") === "true";

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    const orderRef = doc(db, "bestellungen", orderId);

    const unsubscribe = onSnapshot(
      orderRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setOrder(snapshot.data() as OrderData);
        } else {
          setOrder(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Fehler beim Laden der Bestellung:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId]);

  useEffect(() => {
    if (!paidFromUrl || order) {
      setWaitedTooLong(false);
      return;
    }

    const timeout = setTimeout(() => {
      setWaitedTooLong(true);
    }, 15000);

    return () => clearTimeout(timeout);
  }, [paidFromUrl, order]);

  const confirmedMinutes = useMemo(() => {
  if (!order) return null;

  const value =
    (order as any).annahmeZeitMinuten ??
    (order as any).confirmedMinutes ??
    (order as any).lieferzeitMinuten ??
    (order as any).estimatedMinutes;

  return typeof value === "number" && value > 0 ? value : null;
}, [order]);

  const countdownStart = useMemo(() => {
    if (!order || !confirmedMinutes) return null;

    return (
      getDateFromFirestoreField(order.confirmedAt) ||
      getDateFromFirestoreField(order.updatedAt) ||
      getDateFromFirestoreField(order.createdAt)
    );
  }, [order, confirmedMinutes]);

  useEffect(() => {
    if (!confirmedMinutes || !countdownStart) {
      setRemainingSeconds(null);
      return;
    }

    const totalSeconds = confirmedMinutes * 60;

    const updateCountdown = () => {
      const endTime = countdownStart.getTime() + totalSeconds * 1000;
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
      setRemainingSeconds(diffSeconds);
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [confirmedMinutes, countdownStart]);

  const minutes = remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : 0;
  const seconds = remainingSeconds !== null ? remainingSeconds % 60 : 0;

  const progress = useMemo(() => {
    if (!confirmedMinutes || remainingSeconds === null) return 0;
    const total = confirmedMinutes * 60;
    return Math.min(100, Math.max(0, ((total - remainingSeconds) / total) * 100));
  }, [confirmedMinutes, remainingSeconds]);

  if (!orderId) {
    return (
      <main style={{ minHeight: "100vh", background: "#f7f7f8", padding: 24 }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          }}
        >
          Bestellung nicht gefunden.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#f7f7f8", padding: 24 }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          }}
        >
          Zahlung wird verarbeitet. Bestellung wird geladen...
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={{ minHeight: "100vh", background: "#f7f7f8", padding: 24 }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          }}
        >
          {paidFromUrl && !waitedTooLong
            ? "Zahlung erfolgreich. Bestellung wird gerade verarbeitet..."
            : "Bestellung nicht gefunden."}
        </div>
      </main>
    );
  }

  const artikel = order.artikel || [];
  const kunde = order.kunde || {};
  const bestellart = order.bestellart || "abholung";

  const displayStatus = (() => {
    const bezahlt = order?.bezahlt || paidFromUrl;

    if (!bezahlt) {
      return {
        badge: "Zahlung offen",
        title: "Zahlung wird geprüft",
        subtitle: "Sobald die Zahlung bestätigt ist, erscheint hier dein aktueller Status.",
        tone: "#b91c1c",
        soft: "#fef2f2",
      };
    }

    if (!confirmedMinutes || remainingSeconds === null) {
      return {
        badge: "Bezahlt",
        title: "Lieferzeit wird noch bestätigt",
        subtitle: "Deine Bestellung ist eingegangen. Die genaue Zeit wird in Kürze bestätigt.",
        tone: "#166534",
        soft: "#f0fdf4",
      };
    }

    if (remainingSeconds > 0) {
      return {
        badge: "Bestätigt",
        title: `${minutes}:${seconds.toString().padStart(2, "0")}`,
        subtitle:
          bestellart === "lieferung"
            ? "Deine Lieferung ist unterwegs in der bestätigten Zeit."
            : "Deine Abholung läuft in der bestätigten Zeit.",
        tone: "#111827",
        soft: "#f3f4f6",
      };
    }

    if (bestellart === "lieferung") {
      return {
        badge: "Fast da",
        title: "Fast da",
        subtitle: "Deine Bestellung sollte jeden Moment ankommen.",
        tone: "#1d4ed8",
        soft: "#eff6ff",
      };
    }

    return {
      badge: "Abholbereit",
      title: "Abholbereit",
      subtitle: "Deine Bestellung kann jetzt abgeholt werden.",
      tone: "#7c3aed",
      soft: "#f5f3ff",
    };
  })();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #f7f7f8 40%, #f3f4f6 100%)",
        padding: "28px 18px 40px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 0.9fr",
            gap: 20,
          }}
        >
          <section
            style={{
              background: "#ffffff",
              borderRadius: 30,
              padding: 32,
              boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
              border: "1px solid rgba(15,23,42,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#6b7280",
                    marginBottom: 10,
                  }}
                >
                  La Rosa
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: 56,
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                    color: "#0f172a",
                  }}
                >
                  Dein Bestellstatus
                </h1>

                <p
                  style={{
                    marginTop: 16,
                    marginBottom: 0,
                    color: "#64748b",
                    fontSize: 18,
                    maxWidth: 720,
                    lineHeight: 1.5,
                  }}
                >
                  Hier siehst du jederzeit den aktuellen Stand deiner Bestellung
                  in Echtzeit.
                </p>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: displayStatus.soft,
                  color: displayStatus.tone,
                  padding: "12px 16px",
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: displayStatus.tone,
                    display: "inline-block",
                  }}
                />
                {displayStatus.badge}
              </div>
            </div>

            <div
              style={{
                marginTop: 28,
                background: "#0f172a",
                color: "#fff",
                borderRadius: 26,
                padding: 26,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr auto",
                  gap: 16,
                  alignItems: "end",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.65,
                      marginBottom: 8,
                    }}
                  >
                    Status
                  </div>
                  <div
                    style={{
                      fontSize: remainingSeconds !== null && remainingSeconds > 0 ? 48 : 34,
                      fontWeight: 800,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                    }}
                  >
                    {displayStatus.title}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 16,
                      lineHeight: 1.5,
                    }}
                  >
                    {displayStatus.subtitle}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.65,
                      marginBottom: 8,
                    }}
                  >
                    Bestellart
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>
                    {bestellart === "lieferung" ? "Lieferung" : "Abholung"}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "16px 18px",
                    borderRadius: 18,
                    minWidth: 140,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      opacity: 0.65,
                      textTransform: "uppercase",
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    Gesamt
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {formatEuro(order.gesamtpreis)}
                  </div>
                </div>
              </div>

              {confirmedMinutes && remainingSeconds !== null && remainingSeconds > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 10,
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    <span>Fortschritt</span>
                    <span>{Math.round(progress)}%</span>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      height: 12,
                      background: "rgba(255,255,255,0.12)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        borderRadius: 999,
                        background:
                          "linear-gradient(90deg, #ffffff 0%, #94a3b8 100%)",
                        transition: "width 0.8s ease",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gap: 20,
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: 30,
                padding: 28,
                boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
                border: "1px solid rgba(15,23,42,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: "#94a3b8",
                  marginBottom: 10,
                }}
              >
                Bestellnummer
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  color: "#0f172a",
                }}
              >
                #{order.orderNumber || "—"}
              </div>
            </div>

            <div
              style={{
                background: "#ffffff",
                borderRadius: 30,
                padding: 28,
                boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
                border: "1px solid rgba(15,23,42,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: "#94a3b8",
                  marginBottom: 12,
                }}
              >
                Kundendaten
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>
                    Name
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 17 }}>
                    {kunde.name || "—"}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>
                    Adresse
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 17 }}>
                    {kunde.adresse || "—"}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>
                    Telefon
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 17 }}>
                    {kunde.telefon || "—"}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section
          style={{
            marginTop: 20,
            background: "#ffffff",
            borderRadius: 30,
            padding: 30,
            boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
            border: "1px solid rgba(15,23,42,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 20,
              alignItems: "center",
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: "#94a3b8",
                  marginBottom: 8,
                }}
              >
                Bestellübersicht
              </div>
              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: 32,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                Deine Artikel
              </h2>
            </div>

            <div
              style={{
                background: "#0f172a",
                color: "#fff",
                padding: "14px 18px",
                borderRadius: 18,
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              {formatEuro(order.gesamtpreis)}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {artikel.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 16,
                  alignItems: "start",
                  padding: 20,
                  borderRadius: 22,
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    background: "#111827",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {item.quantity}x
                </div>

                <div>
                  <div
                    style={{
                      color: "#0f172a",
                      fontWeight: 800,
                      fontSize: 20,
                      marginBottom: 6,
                    }}
                  >
                    {item.name}
                  </div>

                  {item.variantName && (
                    <div style={{ color: "#475569", fontSize: 15, marginBottom: 6 }}>
                      Variante: {item.variantName}
                    </div>
                  )}

                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      {item.selectedOptions.map((option, optionIndex) => (
                        <span
                          key={`${option}-${optionIndex}`}
                          style={{
                            background: "#e2e8f0",
                            color: "#334155",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    color: "#0f172a",
                    fontWeight: 800,
                    fontSize: 20,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatEuro((item.price || 0) * (item.quantity || 1))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Lädt...</div>}>
      <OrderStatusContent />
    </Suspense>
  );
}