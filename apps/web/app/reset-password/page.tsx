"use client";

import { FormEvent, useState } from "react";

export default function ResetPassword() {
  const [message, setMessage] = useState("");
  const browser = globalThis as unknown as { location?: { hash: string } };
  const token = browser.location?.hash
    ? (new URLSearchParams(browser.location.hash.replace(/^#/, "")).get(
        "access_token",
      ) ?? "")
    : "";
  function submit(event: FormEvent<HTMLFormElement>) {
    if (!token) {
      event.preventDefault();
      setMessage("This recovery link is invalid or expired.");
      return;
    }
  }
  return (
    <main className="public-page">
      <p className="kicker">ACCOUNT RECOVERY</p>
      <h1>Set a new password.</h1>
      <p>Choose a new password for your VELYQ account.</p>
      <form
        className="auth-card"
        action="/api/v1/auth/reset-password"
        method="post"
        onSubmit={submit}
      >
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
        <input type="hidden" name="access_token" value={token} />
        <button type="submit">Save password</button>
        {message && <p role="alert">{message}</p>}
      </form>
    </main>
  );
}
