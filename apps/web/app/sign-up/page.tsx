import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell, FormError } from "../components/auth-shell";
import { PasswordField } from "../components/password-field";

export default async function SignUp({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getLocale();
  const t = translator(locale);
  const errorId = "sign-up-error";
  const hasError = Boolean(params.error);
  const hasCredentialError = hasError && params.error !== "unavailable";

  return (
    <AuthShell
      locale={locale}
      kicker={t("authSignUpKicker")}
      title={t("authSignUpTitle")}
      body={t("authSignUpBody")}
    >
      {hasError ? (
        <FormError id={errorId}>
          {params.error === "unavailable"
            ? t("authSignUpUnavailable")
            : t("authSignUpError")}
        </FormError>
      ) : null}

      <form className="auth__form" action="/api/v1/auth/sign-up" method="post">
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
            {...(hasError ? { "aria-describedby": errorId } : {})}
            {...(hasCredentialError ? { "aria-invalid": true as const } : {})}
          />
        </div>

        <PasswordField
          label={t("authPasswordLabel")}
          hint={t("authPasswordHint")}
          showLabel={t("authShowPassword")}
          hideLabel={t("authHidePassword")}
          autoComplete="new-password"
          minLength={8}
          invalid={hasCredentialError}
          {...(hasError ? { describedBy: errorId } : {})}
        />

        <button className="button button--primary button--block" type="submit">
          {t("authSignUpSubmit")}
        </button>
      </form>

      <p className="field__hint">
        {t("authSignUpLegal")}{" "}
        <a className="link" href="/terms">
          {t("footerTerms")}
        </a>{" "}
        <a className="link" href="/privacy">
          {t("footerPrivacy")}
        </a>
      </p>

      <div className="auth__links">
        <p>
          {t("authHaveAccount")}{" "}
          <a className="link" href="/sign-in">
            {t("homeSignIn")}
          </a>
        </p>
      </div>

      <p className="auth__footnote">{t("authSignUpFooter")}</p>
    </AuthShell>
  );
}
