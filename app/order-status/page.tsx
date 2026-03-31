"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

type ArtikelItem = {
  name?: string;
  price?: number;
  preis?: number;
  quantity?: number;
  anzahl?: number;
};

type Kunde = {
  name?: string;
  adresse?: string;
  telefon?: string;
};

type Bestellung = {
  status?: string;
  annahmeZeitMinuten?: number;
  gesamtpreis?: number;
  gesamt?: number;
  artikel?: ArtikelItem[];
  kunde?: Kunde;
};

export default function OrderStatusPage() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Bestellung | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    setOrderId(id);
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const ref = doc(db, "bestellungen", orderId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setOrder(snap.data() as Bestellung);
        } else {
          setOrder(null);
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  const statusConfig = useMemo(() => {
    const status = (order?.status || "").toLowerCase();

    if (status === "neu") {
      return {
        label: "Bestellung eingegangen",
        bg: "#FFF7ED",
        color: "#C2410C",
        dot: "#F97316",
      };
    }

    if (status === "angenommen") {
      return {
        label: "Bestellung angenommen",
        bg: "#ECFDF3",
        color: "#027A48",
        dot: "#12B76A",
      };
    }

    if (status === "in zubereitung") {
      return {
        label: "In Zubereitung",
        bg: "#EFF8FF",
        color: "#175CD3",
        dot: "#2E90FA",
      };
    }

    if (status === "geliefert" || status === "fertig" || status === "abgeschlossen") {
      return {
        label: "Abgeschlossen",
        bg: "#F4F3FF",
        color: "#5925DC",
        dot: "#7A5AF8",
      };
    }

    return {
      label: order?.status || "Unbekannt",
      bg: "#F2F4F7",
      color: "#344054",
      dot: "#98A2B3",
    };
  }, [order?.status]);

  const total = ((order?.gesamtpreis || order?.gesamt || 0) as number).toFixed(2);

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundGlowTop} />
        <div style={styles.backgroundGlowBottom} />
        <div style={styles.container}>
          <div style={styles.heroCard}>
            <div style={styles.badge}>La Rosa</div>
            <h1 style={styles.title}>Bestellung wird geladen ...</h1>
            <p style={styles.subtitle}>
              Einen kleinen Moment bitte, wir holen gerade die aktuellen Daten deiner Bestellung.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!orderId) {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundGlowTop} />
        <div style={styles.backgroundGlowBottom} />
        <div style={styles.container}>
          <div style={styles.heroCard}>
            <div style={styles.badge}>La Rosa</div>
            <h1 style={styles.title}>Keine Bestell-ID angegeben</h1>
            <p style={styles.subtitle}>
              Der Link ist unvollständig. Öffne bitte den Status-Link direkt aus deiner Bestellung.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundGlowTop} />
        <div style={styles.backgroundGlowBottom} />
        <div style={styles.container}>
          <div style={styles.heroCard}>
            <div style={styles.badge}>La Rosa</div>
            <h1 style={styles.title}>Bestellung nicht gefunden</h1>
            <p style={styles.subtitle}>
              Wir konnten zu dieser Bestell-ID keine Bestellung finden.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundGlowTop} />
      <div style={styles.backgroundGlowBottom} />

      <div style={styles.container}>
        <section style={styles.heroCard}>
          <div style={styles.heroTopRow}>
            <div>
              <div style={styles.badge}>La Rosa</div>
              <h1 style={styles.title}>Dein Bestellstatus</h1>
              <p style={styles.subtitle}>
                Hier siehst du den aktuellen Stand deiner Bestellung in Echtzeit.
              </p>
            </div>

            <div
              style={{
                ...styles.statusPill,
                backgroundColor: statusConfig.bg,
                color: statusConfig.color,
              }}
            >
              <span
                style={{
                  ...styles.statusDot,
                  backgroundColor: statusConfig.dot,
                }}
              />
              {statusConfig.label}
            </div>
          </div>

          <div style={styles.heroInfoGrid}>
            <div style={styles.heroInfoCard}>
              <div style={styles.infoLabel}>Status</div>
              <div style={styles.infoValue}>{order.status || "Unbekannt"}</div>
            </div>

            <div style={styles.heroInfoCard}>
              <div style={styles.infoLabel}>Lieferzeit</div>
              <div style={styles.infoValue}>
                {order.annahmeZeitMinuten ? `${order.annahmeZeitMinuten} Minuten` : "Wird noch bestätigt"}
              </div>
            </div>

            <div style={styles.heroInfoCard}>
              <div style={styles.infoLabel}>Gesamtbetrag</div>
              <div style={styles.infoValue}>{total} €</div>
            </div>
          </div>
        </section>

        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Kundendaten</div>
                <div style={styles.cardSub}>Deine angegebenen Bestelldaten</div>
              </div>
            </div>

            <div style={styles.list}>
              <div style={styles.listRow}>
                <span style={styles.listLabel}>Name</span>
                <span style={styles.listValue}>{order.kunde?.name || "-"}</span>
              </div>
              <div style={styles.divider} />
              <div style={styles.listRow}>
                <span style={styles.listLabel}>Adresse</span>
                <span style={styles.listValue}>{order.kunde?.adresse || "-"}</span>
              </div>
              <div style={styles.divider} />
              <div style={styles.listRow}>
                <span style={styles.listLabel}>Telefon</span>
                <span style={styles.listValue}>{order.kunde?.telefon || "-"}</span>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Bestellübersicht</div>
                <div style={styles.cardSub}>Alle Artikel deiner Bestellung</div>
              </div>
            </div>

            <div style={styles.itemsWrap}>
              {order.artikel && order.artikel.length > 0 ? (
                order.artikel.map((item, index) => {
                  const qty = item.quantity || item.anzahl || 1;
                  const price = (item.price || item.preis || 0) as number;

                  return (
                    <div key={index} style={styles.itemRow}>
                      <div style={styles.itemLeft}>
                        <div style={styles.qtyBubble}>{qty}x</div>
                        <div style={styles.itemName}>{item.name || "Artikel"}</div>
                      </div>
                      <div style={styles.itemPrice}>{price.toFixed(2)} €</div>
                    </div>
                  );
                })
              ) : (
                <div style={styles.emptyText}>Keine Artikel vorhanden</div>
              )}
            </div>

            <div style={styles.totalBox}>
              <span style={styles.totalLabel}>Gesamt</span>
              <span style={styles.totalValue}>{total} €</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 45%, #F8FAFC 100%)",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#101828",
    padding: "32px 16px 48px",
  },
  backgroundGlowTop: {
    position: "absolute",
    top: "-120px",
    right: "-80px",
    width: "320px",
    height: "320px",
    borderRadius: "999px",
    background: "rgba(122, 90, 248, 0.16)",
    filter: "blur(70px)",
    pointerEvents: "none",
  },
  backgroundGlowBottom: {
    position: "absolute",
    bottom: "-120px",
    left: "-80px",
    width: "320px",
    height: "320px",
    borderRadius: "999px",
    background: "rgba(46, 144, 250, 0.14)",
    filter: "blur(70px)",
    pointerEvents: "none",
  },
  container: {
    maxWidth: "1120px",
    margin: "0 auto",
    position: "relative",
    zIndex: 2,
  },
  heroCard: {
    background: "rgba(255,255,255,0.78)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 20px 60px rgba(16,24,40,0.10)",
    borderRadius: "28px",
    padding: "28px",
  },
  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 14px",
    borderRadius: "999px",
    background: "#FFFFFF",
    border: "1px solid #EAECF0",
    color: "#344054",
    fontSize: "14px",
    fontWeight: 700,
    marginBottom: "14px",
    boxShadow: "0 8px 24px rgba(16,24,40,0.06)",
  },
  title: {
    margin: 0,
    fontSize: "clamp(34px, 5vw, 56px)",
    lineHeight: 1.02,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: "#101828",
  },
  subtitle: {
    marginTop: "14px",
    marginBottom: 0,
    maxWidth: "680px",
    fontSize: "17px",
    lineHeight: 1.7,
    color: "#475467",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 18px",
    borderRadius: "999px",
    fontSize: "15px",
    fontWeight: 800,
    whiteSpace: "nowrap",
    boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
  },
  statusDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    display: "inline-block",
  },
  heroInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "16px",
    marginTop: "28px",
  },
  heroInfoCard: {
    background: "#FFFFFF",
    border: "1px solid #EAECF0",
    borderRadius: "22px",
    padding: "18px 18px 20px",
    boxShadow: "0 8px 24px rgba(16,24,40,0.05)",
  },
  infoLabel: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#667085",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "8px",
  },
  infoValue: {
    fontSize: "20px",
    fontWeight: 800,
    color: "#101828",
    lineHeight: 1.3,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "22px",
    marginTop: "22px",
  },
  card: {
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 18px 50px rgba(16,24,40,0.08)",
    borderRadius: "28px",
    padding: "24px",
  },
  cardHeader: {
    marginBottom: "18px",
  },
  cardTitle: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#101828",
    letterSpacing: "-0.02em",
  },
  cardSub: {
    marginTop: "6px",
    fontSize: "15px",
    color: "#667085",
    lineHeight: 1.6,
  },
  list: {
    background: "#FFFFFF",
    border: "1px solid #EAECF0",
    borderRadius: "22px",
    overflow: "hidden",
  },
  listRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    padding: "18px 18px",
  },
  listLabel: {
    fontSize: "14px",
    color: "#667085",
    fontWeight: 700,
    minWidth: "92px",
  },
  listValue: {
    fontSize: "16px",
    color: "#101828",
    fontWeight: 700,
    textAlign: "right",
    lineHeight: 1.5,
  },
  divider: {
    height: "1px",
    background: "#EAECF0",
    width: "100%",
  },
  itemsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    background: "#FFFFFF",
    border: "1px solid #EAECF0",
    borderRadius: "20px",
    padding: "16px 16px",
    boxShadow: "0 8px 24px rgba(16,24,40,0.04)",
  },
  itemLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    minWidth: 0,
  },
  qtyBubble: {
    minWidth: "48px",
    height: "48px",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #7A5AF8 0%, #2E90FA 100%)",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "15px",
    boxShadow: "0 10px 24px rgba(122,90,248,0.24)",
  },
  itemName: {
    fontSize: "17px",
    fontWeight: 700,
    color: "#101828",
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  itemPrice: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#101828",
    whiteSpace: "nowrap",
  },
  totalBox: {
    marginTop: "18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 20px",
    borderRadius: "22px",
    background: "linear-gradient(135deg, #111827 0%, #1D2939 100%)",
    color: "#FFFFFF",
    boxShadow: "0 18px 40px rgba(17,24,39,0.22)",
  },
  totalLabel: {
    fontSize: "17px",
    fontWeight: 700,
    opacity: 0.92,
  },
  totalValue: {
    fontSize: "28px",
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  emptyText: {
    fontSize: "15px",
    color: "#667085",
    padding: "4px 2px",
  },
};