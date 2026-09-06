import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell } from "../components/auth-shell";
import { AuthError } from "../components/auth-error";
import { PasswordField } from "../components/password-field";
import { localePath } from "../locale-path";

export default async function SignIn() {
  const locale = await getLocale();
  const t = translator(locale);
  const errorId = "sign-in-error";

  return (
    <AuthShell
      locale={locale}
      kicker={t("authSignInKicker")}
      title={t("authSignInTitle")}
      body={t("authSignInBody")}
    >
      <AuthError
        locale={locale}
        id={errorId}
        invalidKey="authSignInError"
        unavailableKey="authSignInUnavailable"
        fieldIds={["email", "password"]}
      />

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
          />
        </div>

        <PasswordField
          label={t("authPasswordLabel")}
          showLabel={t("authShowPassword")}
          hideLabel={t("authHidePassword")}
          autoComplete="current-password"
        />

        <button className="button button--primary button--block" type="submit">
          {t("authSignInSubmit")}
        </button>
      </form>

      <div className="auth__links">
        <p>
          {t("authNoAccount")}{" "}
          <a className="link" href={localePath("/sign-up", locale)}>
            {t("homeCreateAccount")}
          </a>
        </p>
        <p>
          <a className="link" href={localePath("/forgot-password", locale)}>
            {t("authForgotPassword")}
          </a>
        </p>
      </div>

      <p className="auth__footnote">{t("authSignInFooter")}</p>
    </AuthShell>
  );
}
