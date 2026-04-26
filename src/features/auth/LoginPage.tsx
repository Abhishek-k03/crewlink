import { Anchor, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/context';
import { landingPathFor } from '@/auth/permissions';
import { DEMO_USERS } from '@/auth/users';
import { fieldClasses } from '@/components/ui/formStyles';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) {
    return <Navigate to={landingPathFor(user.role)} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const message = await login(email, password);
    setPending(false);
    if (message) {
      setError(message);
      return;
    }

    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? '/', { replace: true });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-2 flex items-center gap-2">
          <Anchor className="size-6 text-accent" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">CrewLink</h1>
        </div>
        <p className="mb-8 text-sm text-muted">
          Fleet crew rotation &amp; certification management.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              className={`${fieldClasses} font-normal`}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className={`${fieldClasses} font-normal`}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-opacity disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? 'Signing in' : 'Sign in'}
          </button>
        </form>

        <div className="mt-8 border-t border-line pt-6">
          <p className="mb-3 text-xs font-medium text-muted">Demo accounts</p>
          <div className="flex flex-col gap-2">
            {DEMO_USERS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                onClick={() => {
                  setEmail(demo.email);
                  setPassword(demo.password);
                  setError(null);
                }}
                className="rounded-md border border-line px-3 py-2 text-left text-sm transition-colors hover:bg-elevated"
              >
                <span className="font-medium">{demo.role}</span>
                <span className="block text-xs text-muted">{demo.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
