"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
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
  vorbestellung?: string;
  uhrzeit?: string;
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
  if (!orderId) {
    setLoading(false);
    return;
  }

  let unsubscribeBestellung: (() => void) | null = null;
  let unsubscribePending: (() => void) | null = null;

  const startListening = async () => {
    try {
      const bestellungRef = doc(db, "bestellungen", orderId);
      const bestellungSnap = await getDoc(bestellungRef);

      if (bestellungSnap.exists()) {
        unsubscribeBestellung = onSnapshot(
          bestellungRef,
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
        return;
      }

      const pendingRef = doc(db, "pendingOrders", orderId);

      unsubscribePending = onSnapshot(
        pendingRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setOrder(snapshot.data() as OrderData);
          } else {
            setOrder(null);
          }
          setLoading(false);
        },
        (error) => {
          console.error("Fehler beim Laden der pendingOrder:", error);
          setLoading(false);
        }
      );
    } catch (error) {
      console.error("Fehler beim Initialisieren des Bestellstatus:", error);
      setLoading(false);
    }
  };

  startListening();

  return () => {
    if (unsubscribeBestellung) unsubscribeBestellung();
    if (unsubscribePending) unsubscribePending();
  };
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

  const minutes =
    remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : 0;
  const seconds = remainingSeconds !== null ? remainingSeconds % 60 : 0;

  const progress = useMemo(() => {
    if (!confirmedMinutes || remainingSeconds === null) return 0;
    const total = confirmedMinutes * 60;
    return Math.min(
      100,
      Math.max(0, ((total - remainingSeconds) / total) * 100)
    );
  }, [confirmedMinutes, remainingSeconds]);

  if (!orderId) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.simpleCard}>Bestellung nicht gefunden.</div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.simpleCard}>
            Zahlung wird verarbeitet. Bestellung wird geladen...
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.simpleCard}>
            {paidFromUrl && !waitedTooLong
              ? "Zahlung erfolgreich. Bestellung wird gerade verarbeitet..."
              : "Bestellung nicht gefunden."}
          </div>
        </div>
      </main>
    );
  }

  const artikel = order.artikel || [];
  const kunde = order.kunde || {};
  const bestellart = order.bestellart || "abholung";

  const displayStatus = (() => {
    const bezahlt = order?.bezahlt || paidFromUrl;
    const istVorbestellung = order?.vorbestellung === "spaeter";
    const vorbestellUhrzeit = order?.uhrzeit;

    if (!bezahlt) {
      return {
        badge: "Zahlung offen",
        title: "Zahlung wird geprüft",
        subtitle:
          "Sobald die Zahlung bestätigt ist, erscheint hier dein aktueller Status.",
        tone: "#b91c1c",
        soft: "#fef2f2",
      };
    }

    if (istVorbestellung && vorbestellUhrzeit) {
      return {
        badge: "Vorbestellung",
        title: `${vorbestellUhrzeit} Uhr`,
        subtitle: "Deine Bestellung wurde als Vorbestellung gespeichert.",
        tone: "#7c3aed",
        soft: "#f5f3ff",
      };
    }

    if (!confirmedMinutes || remainingSeconds === null) {
      return {
        badge: "Bezahlt",
        title: "Lieferzeit wird noch bestätigt",
        subtitle:
          "Deine Bestellung ist eingegangen. Die genaue Zeit wird in Kürze bestätigt.",
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
    <main style={styles.page}>
      <div style={styles.container}>
        <div
          style={{
            ...styles.topGrid,
            gridTemplateColumns: isMobile ? "1fr" : "1.4fr 0.9fr",
          }}
        >
          <section style={styles.mainCard}>
            <div
              style={{
                ...styles.heroTop,
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "flex-start",
              }}
            >
              <div>
                <div style={styles.brandLabel}>La Rosa</div>

                <h1
                  style={{
                    ...styles.mainTitle,
                    fontSize: isMobile ? 34 : 56,
                  }}
                >
                  Dein Bestellstatus
                </h1>

                <p
                  style={{
                    ...styles.mainSubtitle,
                    fontSize: isMobile ? 15 : 18,
                    marginTop: isMobile ? 12 : 16,
                  }}
                >
                  Hier siehst du jederzeit den aktuellen Stand deiner Bestellung
                  in Echtzeit.
                </p>
              </div>

              <div
                style={{
                  ...styles.statusBadge,
                  background: displayStatus.soft,
                  color: displayStatus.tone,
                  alignSelf: isMobile ? "flex-start" : "auto",
                }}
              >
                <span
                  style={{
                    ...styles.statusDot,
                    background: displayStatus.tone,
                  }}
                />
                {displayStatus.badge}
              </div>
            </div>

            <div style={styles.darkStatusCard}>
              <div
                style={{
                  ...styles.darkStatusGrid,
                  gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr auto",
                }}
              >
                <div>
                  <div style={styles.darkLabel}>Status</div>
                  <div
                    style={{
                      ...styles.darkMainValue,
                      fontSize:
                        remainingSeconds !== null && remainingSeconds > 0
                          ? isMobile
                            ? 34
                            : 48
                          : isMobile
                          ? 26
                          : 34,
                    }}
                  >
                    {displayStatus.title}
                  </div>
                  <div
                    style={{
                      ...styles.darkText,
                      fontSize: isMobile ? 14 : 16,
                    }}
                  >
                    {displayStatus.subtitle}
                  </div>
                </div>

                <div>
                  <div style={styles.darkLabel}>Bestellart</div>
                  <div
                    style={{
                      fontSize: isMobile ? 20 : 24,
                      fontWeight: 700,
                    }}
                  >
                    {bestellart === "lieferung" ? "Lieferung" : "Abholung"}
                  </div>
                </div>

                <div
                  style={{
                    ...styles.totalBox,
                    minWidth: isMobile ? "100%" : 140,
                  }}
                >
                  <div style={styles.totalLabel}>Gesamt</div>
                  <div
                    style={{
                      fontSize: isMobile ? 24 : 28,
                      fontWeight: 800,
                    }}
                  >
                    {formatEuro(order.gesamtpreis)}
                  </div>
                </div>
              </div>

              {confirmedMinutes &&
                remainingSeconds !== null &&
                remainingSeconds > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={styles.progressTop}>
                      <span>Fortschritt</span>
                      <span>{Math.round(progress)}%</span>
                    </div>

                    <div style={styles.progressTrack}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${progress}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
            </div>
          </section>

          <section style={styles.sideGrid}>
            <div style={styles.sideCard}>
              <div style={styles.smallCardLabel}>Bestellnummer</div>
              <div
                style={{
                  ...styles.orderNumber,
                  fontSize: isMobile ? 28 : 36,
                }}
              >
                #{order.orderNumber || "—"}
              </div>
            </div>

            <div style={styles.sideCard}>
              <div style={styles.smallCardLabel}>Kundendaten</div>

              <div style={styles.customerGrid}>
                <div>
                  <div style={styles.metaLabel}>Name</div>
                  <div style={styles.metaValue}>{kunde.name || "—"}</div>
                </div>

                <div>
                  <div style={styles.metaLabel}>Adresse</div>
                  <div style={styles.metaValue}>{kunde.adresse || "—"}</div>
                </div>

                <div>
                  <div style={styles.metaLabel}>Telefon</div>
                  <div style={styles.metaValue}>{kunde.telefon || "—"}</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section style={styles.itemsSection}>
          <div
            style={{
              ...styles.itemsHeader,
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
            }}
          >
            <div>
              <div style={styles.smallCardLabel}>Bestellübersicht</div>
              <h2
                style={{
                  ...styles.itemsTitle,
                  fontSize: isMobile ? 26 : 32,
                }}
              >
                Deine Artikel
              </h2>
            </div>

            <div
              style={{
                ...styles.itemsTotalPill,
                fontSize: isMobile ? 18 : 20,
                alignSelf: isMobile ? "flex-start" : "auto",
              }}
            >
              {formatEuro(order.gesamtpreis)}
            </div>
          </div>

          <div style={styles.itemsList}>
            {artikel.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                style={{
                  ...styles.itemCard,
                  gridTemplateColumns: isMobile ? "1fr" : "auto 1fr auto",
                }}
              >
                <div style={styles.qtyBadge}>{item.quantity}x</div>

                <div>
                  <div
                    style={{
                      ...styles.itemName,
                      fontSize: isMobile ? 18 : 20,
                    }}
                  >
                    {item.name}
                  </div>

                  {item.variantName && (
                    <div style={styles.variantText}>
                      Variante: {item.variantName}
                    </div>
                  )}

                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div style={styles.optionWrap}>
                      {item.selectedOptions.map((option, optionIndex) => (
                        <span
                          key={`${option}-${optionIndex}`}
                          style={styles.optionPill}
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    ...styles.itemPrice,
                    fontSize: isMobile ? 18 : 20,
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #f8fafc 0%, #f7f7f8 40%, #f3f4f6 100%)",
    padding: "20px 14px 36px",
  },
  container: {
    maxWidth: 1180,
    margin: "0 auto",
  },
  simpleCard: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  topGrid: {
    display: "grid",
    gap: 20,
  },
  mainCard: {
    background: "#ffffff",
    borderRadius: 30,
    padding: 24,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(15,23,42,0.05)",
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
  },
  brandLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#6b7280",
    marginBottom: 10,
  },
  mainTitle: {
    margin: 0,
    lineHeight: 1,
    letterSpacing: "-0.04em",
    color: "#0f172a",
    fontWeight: 800,
  },
  mainSubtitle: {
    marginBottom: 0,
    color: "#64748b",
    maxWidth: 720,
    lineHeight: 1.5,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 15,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },
  darkStatusCard: {
    marginTop: 28,
    background: "#0f172a",
    color: "#fff",
    borderRadius: 26,
    padding: 22,
  },
  darkStatusGrid: {
    display: "grid",
    gap: 18,
    alignItems: "end",
  },
  darkLabel: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    opacity: 0.65,
    marginBottom: 8,
  },
  darkMainValue: {
    fontWeight: 800,
    letterSpacing: "-0.04em",
    lineHeight: 1,
  },
  darkText: {
    marginTop: 10,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.5,
  },
  totalBox: {
    background: "rgba(255,255,255,0.08)",
    padding: "16px 18px",
    borderRadius: 18,
  },
  totalLabel: {
    fontSize: 13,
    opacity: 0.65,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 8,
  },
  progressTop: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 10,
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontWeight: 600,
  },
  progressTrack: {
    width: "100%",
    height: 12,
    background: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #ffffff 0%, #94a3b8 100%)",
    transition: "width 0.8s ease",
  },
  sideGrid: {
    display: "grid",
    gap: 20,
  },
  sideCard: {
    background: "#ffffff",
    borderRadius: 30,
    padding: 24,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(15,23,42,0.05)",
  },
  smallCardLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
    color: "#94a3b8",
    marginBottom: 10,
  },
  orderNumber: {
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: "#0f172a",
  },
  customerGrid: {
    display: "grid",
    gap: 14,
  },
  metaLabel: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 4,
  },
  metaValue: {
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 17,
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  itemsSection: {
    marginTop: 20,
    background: "#ffffff",
    borderRadius: 30,
    padding: 24,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(15,23,42,0.05)",
  },
  itemsHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  itemsTitle: {
    margin: 0,
    color: "#0f172a",
    lineHeight: 1,
    letterSpacing: "-0.04em",
  },
  itemsTotalPill: {
    background: "#0f172a",
    color: "#fff",
    padding: "14px 18px",
    borderRadius: 18,
    fontWeight: 800,
  },
  itemsList: {
    display: "grid",
    gap: 16,
  },
  itemCard: {
    display: "grid",
    gap: 16,
    alignItems: "start",
    padding: 18,
    borderRadius: 22,
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
  },
  qtyBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: "#111827",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    flexShrink: 0,
  },
  itemName: {
    color: "#0f172a",
    fontWeight: 800,
    marginBottom: 6,
    lineHeight: 1.25,
  },
  variantText: {
    color: "#475569",
    fontSize: 15,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  optionWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  optionPill: {
    background: "#e2e8f0",
    color: "#334155",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
  },
  itemPrice: {
    color: "#0f172a",
    fontWeight: 800,
    alignSelf: "center",
  },
};