import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell, FormError } from "../components/auth-shell";
import { PasswordField } from "../components/password-field";

export default async function SignIn({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getLocale();
  const t = translator(locale);
  const errorId = "sign-in-error";
  const hasError = Boolean(params.error);
  const hasCredentialError = hasError && params.error !== "unavailable";

  return (
    <AuthShell
      locale={locale}
      kicker={t("authSignInKicker")}
      title={t("authSignInTitle")}
      body={t("authSignInBody")}
    >
      {hasError ? (
        <FormError id={errorId}>
          {params.error === "unavailable"
            ? t("authSignInUnavailable")
            : t("authSignInError")}
        </FormError>
      ) : null}

      <form className="auth__form" action="/api/v1/auth/sign-in" method="post">
        <div className="field">
          <label className="field__label" htmlFor="email">
            {t("authEmailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            {...(hasCredentialError
              ? { "aria-describedby": errorId, "aria-invalid": true as const }
              : {})}
          />
        </div>

        <PasswordField
          label={t("authPasswordLabel")}
          showLabel={t("authShowPassword")}
          hideLabel={t("authHidePassword")}
          autoComplete="current-password"
          invalid={hasCredentialError}
          {...(hasCredentialError ? { describedBy: errorId } : {})}
        />

        <button className="button button--primary button--block" type="submit">
          {t("authSignInSubmit")}
        </button>
      </form>

      <div className="auth__links">
        <p>
          {t("authNoAccount")}{" "}
          <a className="link" href="/sign-up">
            {t("homeCreateAccount")}
          </a>
        </p>
        <p>
          <a className="link" href="/forgot-password">
            {t("authForgotPassword")}
          </a>
        </p>
      </div>

      <p className="auth__footnote">{t("authSignInFooter")}</p>
    </AuthShell>
  );
}
