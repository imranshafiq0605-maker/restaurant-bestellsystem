"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { fetchProfile } from "../lib/account-client";

// Kopfzeilen-Button der Website: führt zum Kundenkonto und zeigt das Rosenguthaben.
// Nutzt die globalen Header-Klassen (call-button, call-icon, call-text) aus app/page.tsx.
export default function RoseAccountChip() {
  const [user, setUser] = useState<User | null>(null);
  const [roses, setRoses] = useState<number | null>(null);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setRoses(null);
    if (!nextUser) return;
    fetchProfile(nextUser)
      .then((profile) => setRoses(profile.roses))
      .catch(() => setRoses(null));
  }), []);

  const label = user
    ? roses === null ? "Mein Konto" : `${roses} Rosen`
    : "Anmelden";

  return (
    <a
      className="call-button rose-account-chip"
      href="/konto"
      aria-label={user ? `Mein Konto${roses !== null ? `, ${roses} Rosen` : ""}` : "Anmelden und Rosen sammeln"}
    >
      <span className="call-icon rose-account-icon" aria-hidden="true">🌹</span>
      <span className="call-text">
        <small>{user ? "Mein Konto" : "Rosen sammeln"}</small>
        <strong>{label}</strong>
      </span>
      {user && roses !== null && <span className="rose-account-badge" aria-hidden="true">{roses > 999 ? "999+" : roses}</span>}
    </a>
  );
}
