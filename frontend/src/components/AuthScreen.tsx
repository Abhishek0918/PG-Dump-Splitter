import { FormEvent, useState } from "react";
import { passwordStrength } from "../hooks/useAuth";

export function AuthScreen({ onSignIn, onSignUp }: { onSignIn: (email: string, password: string, remember: boolean) => Promise<unknown>; onSignUp: (name: string, email: string, password: string, confirm: string) => Promise<unknown> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupPassword, setSignupPassword] = useState("");
  const score = passwordStrength(signupPassword);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSignIn(String(form.get("email") || ""), String(form.get("password") || ""), Boolean(form.get("remember")));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSignUp(String(form.get("name") || ""), String(form.get("email") || ""), String(form.get("password") || ""), String(form.get("confirm") || ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-visual"><div className="auth-brand"><div className="brand-mark auth-mark">PG</div><div><h1>PG Dump Splitter</h1><p>Local workspace for splitting, exploring, and restoring PostgreSQL dumps.</p></div></div><div className="auth-points"><span>React workspace</span><span>Server-side auth</span><span>Private sessions</span></div></div>
      <div className="auth-card">
        <div className="auth-card-header"><span className="eyebrow">Private workspace</span><h2>{mode === "signup" ? "Create your local account" : "Sign in to continue"}</h2><p>Use your workspace email and password to access your dump analysis jobs.</p></div>
        <div className="segmented auth-tabs"><button className={`segment ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setMessage(""); }}>Login</button><button className={`segment ${mode === "signup" ? "active" : ""}`} onClick={() => { setMode("signup"); setMessage(""); }}>Sign up</button></div>
        {mode === "login" ? <form className="auth-form active" onSubmit={handleLogin}><label>Email</label><input name="email" type="email" placeholder="you@example.com" /><label>Password</label><div className="password-field"><input name="password" type={showPassword ? "text" : "password"} placeholder="Your password" /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div><label className="check-row"><input name="remember" type="checkbox" defaultChecked /> Keep me signed in</label><button className="run-button auth-submit">Login</button></form> : <form className="auth-form active" onSubmit={handleSignup}><label>Name</label><input name="name" placeholder="Your name" /><label>Email</label><input name="email" type="email" placeholder="you@example.com" /><label>Password</label><input name="password" type="password" placeholder="At least 8 characters" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} /><div className="strength-meter"><span className={score >= 4 ? "strong" : score >= 3 ? "medium" : ""} style={{ width: `${[0, 18, 42, 72, 100][score]}%` }} /></div><p className="auth-hint">{score >= 4 ? "Strong password." : "Use 8+ characters with letters, numbers, and symbols."}</p><label>Confirm password</label><input name="confirm" type="password" placeholder="Repeat password" /><button className="run-button auth-submit">Create Account</button></form>}
        <div className={`auth-message ${message ? "error" : ""}`}>{message}</div>
        <div className="auth-footer"><span>Server-side session</span></div>
      </div>
    </section>
  );
}
