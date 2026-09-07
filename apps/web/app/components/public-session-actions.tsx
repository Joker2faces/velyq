"use client";

import { translate, type Locale } from "@velyq/ui";
import { localePath } from "../locale-path";
import { useCustomerData } from "../customer/customer-data";

type CustomerContext = { plan: "FREE" | "PRO" | "ELITE" };

export function PublicSessionActions({ locale }: { locale: Locale }) {
  const state = useCustomerData<CustomerContext>("/api/v1/customer/context");
  const t = (
    key:
      | "navToday"
      | "navAccount"
      | "homeSignIn"
      | "homeCreateAccount"
      | "signOut",
  ) => translate(key, locale);

  if (state.status === "ready") {
    return (
      <>
        <a
          className="button button--ghost shell-header__signin"
          href={localePath("/today", locale)}
        >
          {t("navToday")}
        </a>
        <a
          className="button button--primary"
          href={localePath("/account", locale)}
        >
          {t("navAccount")}
        </a>
      </>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <>
        <a
          className="button button--ghost shell-header__signin"
          href={localePath("/sign-in", locale)}
        >
          {t("homeSignIn")}
        </a>
        <a
          className="button button--primary"
          href={localePath("/sign-up", locale)}
        >
          {t("homeCreateAccount")}
        </a>
      </>
    );
  }

  return (
    <span aria-live="polite" className="shell-header__session-status">
      Checking session…
    </span>
  );
}

export function PricingFreeAction({ locale }: { locale: Locale }) {
  const state = useCustomerData<CustomerContext>("/api/v1/customer/context");
  if (state.status === "ready") {
    return state.data.plan === "FREE" ? (
      <span
        className="button button--ghost button--block"
        aria-disabled="true"
        role="note"
      >
        {translate("pricingCurrentPlan", locale)}
      </span>
    ) : (
      <a
        className="button button--secondary button--block"
        href={localePath("/account", locale)}
      >
        {translate("navAccount", locale)}
      </a>
    );
  }
  if (state.status === "unauthenticated") {
    return (
      <a
        className="button button--secondary button--block"
        href={localePath("/sign-up", locale)}
      >
        {translate("homeCreateAccount", locale)}
      </a>
    );
  }
  return (
    <span className="button button--ghost button--block" aria-disabled="true">
      Checking session…
    </span>
  );
}
