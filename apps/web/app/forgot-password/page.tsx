import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell } from "../components/auth-shell";
import { AuthError } from "../components/auth-error";
import { localePath } from "../locale-path";

export default async function ForgotPassword() {
  const locale = await getLocale();
  const t = translator(locale);
  const errorId = "forgot-error";

  return (
    <AuthShell
      locale={locale}
      kicker={t("authForgotKicker")}
      title={t("authForgotTitle")}
      body={t("authForgotBody")}
    >
      <AuthError
        locale={locale}
        id={errorId}
        invalidKey="authForgotError"
        unavailableKey="authForgotError"
        fieldIds={["email"]}
      />

      <form
        className="auth__form"
        action="/api/v1/auth/forgot-password"
        method="post"
      >
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

        <button className="button button--primary button--block" type="submit">
          {t("authForgotSubmit")}
        </button>
      </form>

      <div className="auth__links">
        <p>
          <a className="link" href={localePath("/sign-in", locale)}>
            {t("backToSignIn")}
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
