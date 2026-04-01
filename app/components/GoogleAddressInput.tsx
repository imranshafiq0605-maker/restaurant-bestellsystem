"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: any;
  }
}

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function GoogleAddressInput({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey || !containerRef.current) return;

      if (!window.google?.maps?.importLibrary) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-google-maps="true"]'
          ) as HTMLScriptElement | null;

          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(), { once: true });
            return;
          }

          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
          script.async = true;
          script.defer = true;
          script.setAttribute("data-google-maps", "true");
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Google Maps konnte nicht geladen werden."));
          document.head.appendChild(script);
        });
      }

      if (cancelled || !window.google?.maps?.importLibrary) return;

      const { PlaceAutocompleteElement } =
        await window.google.maps.importLibrary("places");

      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = "";

      const autocomplete = new PlaceAutocompleteElement({
        includedRegionCodes: ["de"],
      });

      autocomplete.style.width = "100%";

      autocomplete.addEventListener("gmp-select", async (event: any) => {
        const place = event.placePrediction?.toPlace?.();
        if (!place) return;

        await place.fetchFields({
          fields: ["formattedAddress"],
        });

        const formattedAddress = place.formattedAddress || "";
        onChange(formattedAddress);
      });

      containerRef.current.appendChild(autocomplete);
    }

    setup().catch((error) => {
      console.error("Google Maps Fehler:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [onChange]);

  return (
    <div>
      <div ref={containerRef} />
      <input
        type="text"
        placeholder="Straße, Hausnummer, PLZ, Ort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 8, width: "100%" }}
      />
    </div>
  );
}