import Link from "next/link";
export default function SignIn() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="kicker">VELYQ // STAGING</p>
        <h1>Welcome back.</h1>
        <p>Sign in to your sports market intelligence workspace.</p>
        <form action="/api/v1/auth/sign-in" method="post">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Continue with Supabase Auth</button>
        </form>
        <small>Authentication is enabled in the next integration step.</small>
        <Link href="/today">Preview synthetic workspace →</Link>
      </div>
    </main>
  );
}
