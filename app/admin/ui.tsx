"use client";

import type { ReactNode } from "react";
import styles from "./admin.module.css";

// Gemeinsame Bausteine für das Admin-Panel.

export class AdminAuthError extends Error {}

export async function adminFetch<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new AdminAuthError(data.error || "Bitte melde dich erneut an.");
  if (!response.ok) throw new Error(data.error || "Das hat gerade nicht geklappt.");
  return data as T;
}

export const euro = (value: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value || 0);
export const number = (value: number) => new Intl.NumberFormat("de-DE").format(value || 0);

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

export type IconName =
  | "home" | "clock" | "menu" | "users" | "mail" | "logout" | "plus" | "trash" | "edit" | "up" | "down"
  | "copy" | "close" | "eye" | "eyeOff" | "refresh" | "download" | "rose" | "send";

export function Icon({ name, className = styles.iconSvg }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    menu: <><path d="M5 5h14v14H5z" /><path d="M9 9h6M9 12h6M9 15h4" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    logout: <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    up: <path d="m6 14 6-6 6 6" />,
    down: <path d="m6 10 6 6 6-6" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
    download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    rose: <><path d="M12 21c0-5 0-9 1-12" /><path d="M13 9c-5-1-6-7-1-7 4 0 7 4 3 8-2 2-5 1-6-1" /><path d="M12 15c-4-3-7-1-7-1 2 4 5 4 7 3M13 13c3-3 6-2 6-2-1 4-4 5-6 4" /></>,
    send: <><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4 18-7Z" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function Switch({ on, onChange, label, danger = false, disabled = false }: { on: boolean; onChange: (next: boolean) => void; label: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`${styles.switch} ${on ? styles.switchOn : ""} ${danger ? styles.switchDanger : ""}`}
      onClick={() => onChange(!on)}
    />
  );
}

export function PageHead({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <header className={styles.pageHead}>
      <div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </header>
  );
}

export type AdminCustomer = {
  key: string;
  type: "konto" | "gast";
  uid: string | null;
  customerNumber: number | null;
  email: string;
  name: string;
  phone: string;
  address: string;
  provider: string;
  emailVerified: boolean;
  roses: number;
  orders: number;
  revenue: number;
  lastOrderAt: string | null;
  createdAt: string | null;
  newsletter: boolean;
  newsletterSince: string | null;
};

export type CustomerStats = {
  registered: number;
  guests: number;
  withRoses: number;
  totalRoses: number;
  newsletter: number;
  orders: number;
  revenue: number;
  newLast30Days: number;
};
