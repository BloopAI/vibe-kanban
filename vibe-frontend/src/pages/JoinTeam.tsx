import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { userInvitationsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { InvitationByTokenResponse, TeamMember } from 'shared/types';
import { formatDistanceToNow } from 'date-fns';

type PageState = 'loading' | 'valid' | 'invalid' | 'expired' | 'already_used' | 'accepted' | 'declined';

export function JoinTeam() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationByTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdMember, setCreatedMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      setError('No invitation token provided');
      return;
    }

    const fetchInvitation = async () => {
      try {
        const data = await userInvitationsApi.getInvitationByToken(token);
        setInvitation(data);

        // Check invitation status
        const expiresAt = new Date(data.invitation.expires_at);
        const isExpired = expiresAt < new Date();

        if (data.invitation.status === 'accepted') {
          setState('already_used');
        } else if (data.invitation.status === 'declined') {
          setState('already_used');
        } else if (isExpired || data.invitation.status === 'expired') {
          setState('expired');
        } else {
          setState('valid');
        }
      } catch (err) {
        setState('invalid');
        setError('Invitation not found or has expired');
      }
    };

    fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;

    setIsProcessing(true);
    try {
      const member = await userInvitationsApi.acceptInvitationByToken(token);
      setCreatedMember(member);
      setState('accepted');
    } catch (err) {
      setError('Failed to accept invitation. It may have expired or already been used.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;

    setIsProcessing(true);
    try {
      await userInvitationsApi.declineInvitationByToken(token);
      setState('declined');
    } catch (err) {
      setError('Failed to decline invitation.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGoToTeam = () => {
    if (createdMember) {
      navigate(`/teams/${createdMember.team_id}/issues`);
    }
  };

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or no token
  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              {error || 'This invitation link is invalid or has expired.'}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Expired invitation
  if (state === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle>Invitation Expired</CardTitle>
            <CardDescription>
              This invitation has expired. Please ask the team admin to send you a new invite.
            </CardDescription>
          </CardHeader>
          {invitation && (
            <CardContent>
              <div className="text-center text-sm text-muted-foreground">
                <p>Team: <span className="font-medium">{invitation.team_name}</span></p>
                <p>Email: <span className="font-medium">{invitation.invitation.email}</span></p>
              </div>
            </CardContent>
          )}
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Already used
  if (state === 'already_used') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Invitation Already Used</CardTitle>
            <CardDescription>
              This invitation has already been {invitation?.invitation.status}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Accepted state
  if (state === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Welcome to the Team!</CardTitle>
            <CardDescription>
              You've successfully joined <span className="font-medium">{invitation?.team_name}</span>.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={handleGoToTeam}>
              <Users className="h-4 w-4 mr-2" />
              Go to Team
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Declined state
  if (state === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Invitation Declined</CardTitle>
            <CardDescription>
              You've declined the invitation to join {invitation?.team_name}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Valid invitation - show accept/decline options
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You're Invited!</CardTitle>
          <CardDescription>
            You've been invited to join a team on iKanban.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Team</span>
              <span className="font-medium">{invitation?.team_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Your email</span>
              <span className="font-medium">{invitation?.invitation.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="secondary" className="capitalize">
                {invitation?.invitation.role}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Expires</span>
              <span className="text-sm">
                {invitation && formatDistanceToNow(new Date(invitation.invitation.expires_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Decline'
            )}
          </Button>
          <Button
            className="flex-1"
            onClick={handleAccept}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Accept Invitation'
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
