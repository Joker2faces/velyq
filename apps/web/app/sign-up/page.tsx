export default function SignUp() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="kicker">VELYQ // PUBLIC ACCESS</p>
        <h1>Create your account.</h1>
        <p>Start with the free VELYQ intelligence preview.</p>
        <form action="/api/v1/auth/sign-up" method="post">
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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button type="submit">Create free account</button>
        </form>
        <p>
          Already have an account? <a href="/sign-in">Sign in</a>
        </p>
        <small>
          Every new account starts as a customer. Access is assigned
          server-side.
        </small>
      </div>
    </main>
  );
}
