import type { ReactNode } from "react";
import { translator, type Locale } from "@velyq/ui";
import { LanguageSwitcher } from "../language-switcher";
import { Brand } from "./site-chrome";
import { IconAlert, IconCheck } from "./icons";

/**
 * Split layout shared by sign-in, sign-up and password recovery.
 *
 * Below 62rem the brand panel is dropped entirely rather than stacked, so the
 * form is the first thing on screen on a phone.
 */
export function AuthShell({
  locale,
  kicker,
  title,
  body,
  children,
}: {
  locale: Locale;
  kicker: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const t = translator(locale);
  return (
    <div className="auth">
      <aside className="auth__aside">
        <Brand />
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <h2>{t("authAsideTitle")}</h2>
          <ul className="auth__aside-points">
            <li>
              <IconCheck size={16} />
              {t("authAsidePoint1")}
            </li>
            <li>
              <IconCheck size={16} />
              {t("authAsidePoint2")}
            </li>
            <li>
              <IconCheck size={16} />
              {t("authAsidePoint3")}
            </li>
          </ul>
        </div>
        <p className="card__hint">{t("authAsideNotice")}</p>
      </aside>

      <main className="auth__main" id="main-content">
        <div className="auth__brandbar">
          <Brand />
          <LanguageSwitcher locale={locale} />
        </div>
        <div className="auth__card">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <p className="eyebrow">{kicker}</p>
            <h1>{title}</h1>
            <p>{body}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Form-level error.
 *
 * These messages are present in the initial HTML after a redirect, so
 * `role="alert"` alone would never be announced — nothing is *inserted* into
 * an already-rendered document. `tabIndex={-1}` plus an `id` referenced by
 * each input's `aria-describedby` gives the message a real relationship to
 * the fields and a focusable target.
 */
export function FormError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p className="form-error" id={id} role="alert" tabIndex={-1}>
      <IconAlert size={17} />
      <span>{children}</span>
    </p>
  );
}
