export default async function SignIn({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="kicker">VELYQ // CUSTOMER ACCESS</p>
        <h1>Welcome back.</h1>
        <p>Sign in to your sports market intelligence workspace.</p>
        {params.error && (
          <p role="alert">Email or password is incorrect. Please try again.</p>
        )}
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
        <p>
          New to VELYQ? <a href="/sign-up">Create an account</a>
        </p>
        <p>
          <a href="/forgot-password">Forgot your password?</a>
        </p>
        <small>Protected by the VELYQ server-side session boundary.</small>
      </div>
    </main>
  );
}
