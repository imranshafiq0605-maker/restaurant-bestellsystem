"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { fetchProfile } from "../lib/account-client";

// Konto-Knopf in der Kopfleiste der Website: führt zum Kundenkonto (/konto) und zeigt das Rosenguthaben.
// Ohne Anmeldung landet man auf /konto bei Anmeldung bzw. Registrierung. Styles: .lr-konto in app/page.tsx.
export default function RoseAccountChip() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [roses, setRoses] = useState<number | null>(null);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setReady(true);
    setUser(nextUser);
    setRoses(null);
    if (!nextUser) return;
    fetchProfile(nextUser)
      .then((profile) => setRoses(profile.roses))
      .catch(() => setRoses(null));
  }), []);

  const label = !ready ? "Mein Konto" : user ? "Mein Konto" : "Anmelden / Registrieren";

  return (
    <a
      className="lr-konto"
      href="/konto"
      aria-label={user ? `Mein Konto${roses !== null ? `, ${roses} Rosen` : ""}` : "Anmelden oder registrieren und Rosen sammeln"}
    >
      <span className="lr-konto-main">
        <svg className="lr-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
        <span className="lr-konto-label">{label}</span>
      </span>
      <span className="lr-konto-roses">
        {user && roses !== null && (
          <>
            <img src="/images/rose-navy.png" alt="" />
            <span>{roses} Rosen</span>
          </>
        )}
        <svg className="lr-icon lr-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </a>
  );
}
