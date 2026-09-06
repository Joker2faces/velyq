import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { AuthShell } from "../components/auth-shell";
import { ResetForm } from "./reset-form";
import { localePath } from "../locale-path";

export default async function ResetPassword() {
  const locale = await getLocale();
  const t = translator(locale);
  return (
    <AuthShell
      locale={locale}
      kicker={t("authResetKicker")}
      title={t("authResetTitle")}
      body={t("authResetBody")}
    >
      <ResetForm
        labels={{
          newPassword: t("authNewPasswordLabel"),
          hint: t("authPasswordHint"),
          show: t("authShowPassword"),
          hide: t("authHidePassword"),
          submit: t("authResetSubmit"),
          invalid: t("authResetInvalid"),
        }}
      />
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
