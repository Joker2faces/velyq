"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PasswordField } from "../components/password-field";
import { FormError } from "../components/auth-shell";
import { readFragmentParameter } from "../components/browser";

/**
 * New-password form.
 *
 * The recovery token arrives in the URL fragment, which is never sent to the
 * server. It is therefore read in an effect after mount — reading it during
 * render produced a hydration mismatch (empty on the server, populated on the
 * client) and could submit an empty `access_token`.
 */
export function ResetForm({
  labels,
}: {
  labels: {
    newPassword: string;
    hint: string;
    show: string;
    hide: string;
    submit: string;
    invalid: string;
  };
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(readFragmentParameter("access_token"));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!token) {
      event.preventDefault();
      setError(labels.invalid);
    }
  }

  return (
    <>
      {error ? <FormError id="reset-error">{error}</FormError> : null}
      <form
        className="auth__form"
        action="/api/v1/auth/reset-password"
        method="post"
        onSubmit={submit}
      >
        <PasswordField
          label={labels.newPassword}
          hint={labels.hint}
          showLabel={labels.show}
          hideLabel={labels.hide}
          autoComplete="new-password"
          minLength={8}
        />
        <input type="hidden" name="access_token" value={token ?? ""} />
        <button
          className="button button--primary button--block"
          type="submit"
          /* Disabled only until the fragment has been read, so the button is
             never live before a token could exist. */
          disabled={token === null}
        >
          {labels.submit}
        </button>
      </form>
    </>
  );
}
