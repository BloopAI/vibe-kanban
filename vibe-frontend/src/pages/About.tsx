import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SignInButton, SignUpButton, useUser } from '@clerk/clerk-react';
import {
  Layers,
  GitBranch,
  Users,
  FileText,
  Zap,
  Shield,
  Globe,
  Terminal,
  Loader2,
} from 'lucide-react';
import NiceModal from '@ebay/nice-modal-react';
import { useUserRegistration } from '@/hooks/useUserRegistration';

// Check if Clerk is configured
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function About() {
  return CLERK_ENABLED ? <AboutWithClerk /> : <AboutContent isSignedIn={false} />;
}

function AboutWithClerk() {
  const { isSignedIn, user } = useUser();
  const {
    registration,
    isLoading: isLoadingRegistration,
    hasRegistration,
    isApproved,
    isPending,
    isRejected,
    refresh,
  } = useUserRegistration();

  // Show onboarding wizard for first-time sign-ups
  useEffect(() => {
    if (isSignedIn && user && !isLoadingRegistration && !hasRegistration) {
      // First-time user - show onboarding wizard
      import('@/components/dialogs/OnboardingWizard').then(() => {
        NiceModal.show('onboarding-wizard', {
          clerkUserId: user.id,
          email: user.primaryEmailAddress?.emailAddress || '',
          firstName: user.firstName,
          lastName: user.lastName,
        });
      });
    }
  }, [isSignedIn, user, isLoadingRegistration, hasRegistration]);

  // Show pending/rejected dialog
  useEffect(() => {
    if (isSignedIn && registration && (isPending || isRejected)) {
      import('@/components/dialogs/PendingApprovalDialog').then(() => {
        NiceModal.show('pending-approval-dialog', {
          registration,
          onRefresh: refresh,
        });
      });
    }
  }, [isSignedIn, registration, isPending, isRejected, refresh]);

  // Determine welcome message
  const welcomeMessage = isSignedIn && user?.firstName ? `Welcome back, ${user.firstName}!` : null;

  // Show loading state while checking registration
  if (isSignedIn && isLoadingRegistration) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AboutContent
      isSignedIn={!!isSignedIn}
      isApproved={isApproved}
      welcomeMessage={welcomeMessage}
    />
  );
}

interface AboutContentProps {
  isSignedIn: boolean;
  isApproved?: boolean;
  welcomeMessage?: string | null;
}

function AboutContent({ isSignedIn, isApproved = false, welcomeMessage }: AboutContentProps) {
  // If user is signed in but not approved, they can see the page but not access dashboard
  const canAccessDashboard = isSignedIn && isApproved;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Vibe Kanban</span>
          </div>
          <nav className="flex items-center gap-4">
            {welcomeMessage && (
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {welcomeMessage}
              </span>
            )}
            {canAccessDashboard ? (
              <Link to="/projects">
                <Button>Go to Dashboard</Button>
              </Link>
            ) : isSignedIn ? (
              <Button disabled variant="outline">
                Awaiting Approval
              </Button>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="ghost">Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button>Get Started</Button>
                </SignUpButton>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          {welcomeMessage && (
            <p className="text-lg text-primary mb-4">{welcomeMessage}</p>
          )}
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Task Management for
            <span className="text-primary"> AI Coding Agents</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Orchestrate Claude Code, Gemini CLI, Codex, Cursor, and other AI
            assistants with a unified kanban board designed for modern
            development workflows.
          </p>
          <div className="flex gap-4 justify-center">
            {canAccessDashboard ? (
              <Link to="/projects">
                <Button size="lg">Open Dashboard</Button>
              </Link>
            ) : isSignedIn ? (
              <Button size="lg" disabled variant="outline">
                Registration Pending
              </Button>
            ) : (
              <>
                <SignUpButton mode="modal">
                  <Button size="lg">Start Free</Button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <Button size="lg" variant="outline">
                    Sign In
                  </Button>
                </SignInButton>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Built for AI-Assisted Development
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Layers className="h-8 w-8" />}
              title="Kanban Boards"
              description="Visual task management with drag-and-drop. Track issues through todo, in-progress, review, and done stages."
            />
            <FeatureCard
              icon={<GitBranch className="h-8 w-8" />}
              title="GitHub Integration"
              description="Sync documents with repositories. Push and pull markdown files directly from your GitHub repos."
            />
            <FeatureCard
              icon={<Users className="h-8 w-8" />}
              title="Team Collaboration"
              description="Invite team members, assign tasks, and collaborate in real-time with role-based permissions."
            />
            <FeatureCard
              icon={<FileText className="h-8 w-8" />}
              title="Document Management"
              description="Create and organize planning documents. Support for markdown, PDF, CSV, and more."
            />
            <FeatureCard
              icon={<Terminal className="h-8 w-8" />}
              title="MCP Integration"
              description="Model Context Protocol support for seamless AI agent interaction via CLI tools."
            />
            <FeatureCard
              icon={<Zap className="h-8 w-8" />}
              title="Distributed Sync"
              description="Turso-powered distributed SQLite keeps your data in sync across all devices."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="Secure by Design"
              description="Clerk authentication, encrypted secrets, and per-team data isolation."
            />
            <FeatureCard
              icon={<Globe className="h-8 w-8" />}
              title="Self-Hostable"
              description="Run locally via npx or deploy to your own infrastructure with Docker."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              number="1"
              title="Create a Team"
              description="Set up your workspace with custom projects and invite collaborators."
            />
            <StepCard
              number="2"
              title="Add Tasks"
              description="Create issues on your kanban board with descriptions, priorities, and assignees."
            />
            <StepCard
              number="3"
              title="Let AI Work"
              description="Use MCP tools to let AI agents pick up tasks and update progress automatically."
            />
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Quick Start</h2>
          <p className="text-muted-foreground mb-8">
            Get up and running in seconds with npx
          </p>
          <div className="bg-card border rounded-lg p-6 max-w-md mx-auto font-mono text-left">
            <code className="text-sm">
              <span className="text-muted-foreground">$</span> npx vibe-kanban
            </code>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            No installation required. Just run and start managing tasks.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to Supercharge Your Workflow?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join developers who are using Vibe Kanban to orchestrate AI coding
            agents and ship faster.
          </p>
          {canAccessDashboard ? (
            <Link to="/projects">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          ) : isSignedIn ? (
            <Button size="lg" disabled variant="outline">
              Awaiting Approval
            </Button>
          ) : (
            <SignUpButton mode="modal">
              <Button size="lg">Get Started Free</Button>
            </SignUpButton>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Vibe Kanban - Task Management for AI Agents
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://github.com/AviKKi/vibe-kanban"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/vibe-kanban"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              npm
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
        {number}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
