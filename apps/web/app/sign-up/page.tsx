import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell } from "../components/auth-shell";
import { AuthError } from "../components/auth-error";
import { PasswordField } from "../components/password-field";
import { localePath } from "../locale-path";

export default async function SignUp() {
  const locale = await getLocale();
  const t = translator(locale);
  const errorId = "sign-up-error";

  return (
    <AuthShell
      locale={locale}
      kicker={t("authSignUpKicker")}
      title={t("authSignUpTitle")}
      body={t("authSignUpBody")}
    >
      <AuthError
        locale={locale}
        id={errorId}
        invalidKey="authSignUpError"
        unavailableKey="authSignUpUnavailable"
        fieldIds={["email", "password"]}
      />

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
          />
        </div>

        <PasswordField
          label={t("authPasswordLabel")}
          hint={t("authPasswordHint")}
          showLabel={t("authShowPassword")}
          hideLabel={t("authHidePassword")}
          autoComplete="new-password"
          minLength={8}
        />

        <button className="button button--primary button--block" type="submit">
          {t("authSignUpSubmit")}
        </button>
      </form>

      <p className="field__hint">
        {t("authSignUpLegal")}{" "}
        <a className="link" href={localePath("/terms", locale)}>
          {t("footerTerms")}
        </a>{" "}
        <a className="link" href={localePath("/privacy", locale)}>
          {t("footerPrivacy")}
        </a>
      </p>

      <div className="auth__links">
        <p>
          {t("authHaveAccount")}{" "}
          <a className="link" href={localePath("/sign-in", locale)}>
            {t("homeSignIn")}
          </a>
        </p>
      </div>

      <p className="auth__footnote">{t("authSignUpFooter")}</p>
    </AuthShell>
  );
}
