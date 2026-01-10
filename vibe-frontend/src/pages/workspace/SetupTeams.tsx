import { useCallback, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TeamSetupData } from '@/types/workspace';

interface SetupTeamsProps {
  teams: TeamSetupData[];
  onChange: (teams: TeamSetupData[]) => void;
}

export function SetupTeams({ teams, onChange }: SetupTeamsProps) {
  const [newTeamName, setNewTeamName] = useState('');

  // Generate identifier from name
  const generateIdentifier = (name: string): string => {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 3) || 'TEM';
  };

  const addTeam = useCallback(() => {
    if (!newTeamName.trim()) return;

    const newTeam: TeamSetupData = {
      id: crypto.randomUUID(),
      name: newTeamName.trim(),
      identifier: generateIdentifier(newTeamName),
      icon: null,
    };

    onChange([...teams, newTeam]);
    setNewTeamName('');
  }, [newTeamName, teams, onChange]);

  const removeTeam = useCallback(
    (id: string) => {
      onChange(teams.filter((t) => t.id !== id));
    },
    [teams, onChange]
  );

  const updateTeam = useCallback(
    (id: string, updates: Partial<TeamSetupData>) => {
      onChange(
        teams.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        )
      );
    },
    [teams, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTeam();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Create Teams
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Teams help organize work and people. You can create more teams later.
        </p>
      </div>

      {/* Add new team */}
      <div className="flex gap-2">
        <Input
          placeholder="Enter team name (e.g., Engineering, Design)"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button onClick={addTeam} disabled={!newTeamName.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Team
        </Button>
      </div>

      {/* Team list */}
      {teams.length > 0 ? (
        <div className="space-y-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded bg-primary/10 text-primary font-semibold">
                {team.identifier}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={team.name}
                    onChange={(e) =>
                      updateTeam(team.id, { name: e.target.value })
                    }
                    className="h-8 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Identifier (3 chars)
                  </Label>
                  <Input
                    value={team.identifier}
                    onChange={(e) =>
                      updateTeam(team.id, {
                        identifier: e.target.value.toUpperCase().substring(0, 3),
                      })
                    }
                    maxLength={3}
                    className="h-8 mt-1 uppercase font-mono"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeTeam(team.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No teams yet</p>
          <p className="text-sm">Add teams to organize your workspace</p>
        </div>
      )}

      {/* Skip hint */}
      <p className="text-sm text-muted-foreground text-center">
        This step is optional. You can skip it and create teams later.
      </p>
    </div>
  );
}
