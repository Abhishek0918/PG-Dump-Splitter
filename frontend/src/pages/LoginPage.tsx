import { Navigate, useNavigate } from "react-router-dom";
import { useAppAuth } from "../contexts/AppContext";
import { AuthScreen } from "../components/AuthScreen";

export default function LoginPage() {
  const { user, signIn, signUp, loading } = useAppAuth();
  const navigate = useNavigate();

  if (loading) return <div className="app-loading">Loading workspace...</div>;
  if (user) return <Navigate to="/" replace />;

  const handleSignIn = async (email: string, password: string, remember: boolean) => {
    await signIn(email, password, remember);
    navigate("/", { replace: true });
  };

  const handleSignUp = async (name: string, email: string, password: string, confirm: string) => {
    await signUp(name, email, password, confirm);
    navigate("/", { replace: true });
  };

  return <AuthScreen onSignIn={handleSignIn} onSignUp={handleSignUp} />;
}
