import { SignUp } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { Layers, ArrowLeft } from 'lucide-react';

export function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <p className="text-zinc-400">Your AI Task Tracker</p>
      </div>

      {/* Clerk SignUp Component */}
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/workspace/new"
      />

      {/* Back link */}
      <Link
        to="/"
        className="mt-8 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}
