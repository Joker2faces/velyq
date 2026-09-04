import Link from "next/link";
export default function SignIn() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="kicker">VELYQ // STAGING</p>
        <h1>Welcome back.</h1>
        <p>Sign in to your sports market intelligence workspace.</p>
        <button>Continue with Supabase Auth</button>
        <small>Authentication is enabled in the next integration step.</small>
        <Link href="/today">Preview synthetic workspace →</Link>
      </div>
    </main>
  );
}
