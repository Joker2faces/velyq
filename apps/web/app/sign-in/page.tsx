import Link from "next/link";
import { formatDateTime } from "@velyq/ui";
export default function SignIn() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="kicker">VELYQ // STAGING</p>
        <h1>Welcome back.</h1>
        <p>Sign in to your sports market intelligence workspace.</p>
        <form action="/api/v1/auth/sign-in" method="post">
          <label htmlFor="email">
            Email
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Continue with Supabase Auth</button>
        </form>
        <small>Protected by the VELYQ server-side session boundary.</small>
        <Link href="/today">Preview synthetic workspace →</Link>
        <small>
          Latest synthetic snapshot:{" "}
          {formatDateTime("2026-09-04T10:00:00.000Z")}
        </small>
      </div>
    </main>
  );
}
