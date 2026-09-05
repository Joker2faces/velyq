export default async function ForgotPassword({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; recovery?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="kicker">VELYQ // ACCOUNT RECOVERY</p>
        <h1>Reset your password.</h1>
        <p>Enter your email and Supabase Auth will send a recovery link.</p>
        {params.error && (
          <p role="alert">
            Recovery is temporarily unavailable. Please try again later.
          </p>
        )}
        <form action="/api/v1/auth/forgot-password" method="post">
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
          <button type="submit">Send recovery link</button>
        </form>
        <p>
          <a href="/sign-in">Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
