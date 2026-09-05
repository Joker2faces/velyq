import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell, FormError } from "../components/auth-shell";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; recovery?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getLocale();
  const t = translator(locale);
  const errorId = "forgot-error";
  const hasError = Boolean(params.error);

  return (
    <AuthShell
      locale={locale}
      kicker={t("authForgotKicker")}
      title={t("authForgotTitle")}
      body={t("authForgotBody")}
    >
      {hasError ? (
        <FormError id={errorId}>{t("authForgotError")}</FormError>
      ) : null}

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
            {...(hasError
              ? { "aria-describedby": errorId, "aria-invalid": true as const }
              : {})}
          />
        </div>

        <button className="button button--primary button--block" type="submit">
          {t("authForgotSubmit")}
        </button>
      </form>

      <div className="auth__links">
        <p>
          <a className="link" href="/sign-in">
            {t("backToSignIn")}
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
