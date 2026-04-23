import { Link } from 'react-router-dom';

function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-16">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">{message}</p>
      <Link to="/" className="text-sm font-medium text-brand underline underline-offset-4">
        Back to start
      </Link>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <StatusPage title="Not authorised" message="Your role does not have access to this section." />
  );
}

export function NotFoundPage() {
  return <StatusPage title="Page not found" message="That address does not match any screen." />;
}
