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
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let autocomplete: any = null;

    const setupAutocomplete = () => {
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        return;
      }

      if (!inputRef.current) {
        return;
      }

      autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "de" },
        fields: ["formatted_address"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const formattedAddress = place?.formatted_address || "";
        onChange(formattedAddress);
      });
    };

    const timeout = setTimeout(setupAutocomplete, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [onChange]);

  return (
    <input
      ref={inputRef}
      id="adresse"
      type="text"
      placeholder="Straße, Hausnummer, PLZ, Ort"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}