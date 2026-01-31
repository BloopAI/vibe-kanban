import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Search } from 'lucide-react';
import { SwarmCard } from './SwarmCard';
import type { Swarm } from './types';

interface SwarmListProps {
  swarms: Swarm[];
  isLoading?: boolean;
  onCreateSwarm?: () => void;
  onPauseSwarm?: (id: string) => void;
  onResumeSwarm?: (id: string) => void;
}

export function SwarmList({
  swarms,
  isLoading = false,
  onCreateSwarm,
  onPauseSwarm,
  onResumeSwarm,
}: SwarmListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSwarms = useMemo(
    () =>
      swarms.filter(
        (swarm) =>
          swarm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          swarm.description?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [swarms, searchQuery]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6 px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Swarms</h1>
          <p className="text-sm text-muted-foreground">
            Manage your task swarms and monitor execution
          </p>
        </div>
        <Button onClick={onCreateSwarm}>
          <Plus className="h-4 w-4 mr-2" />
          New Swarm
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search swarms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredSwarms.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {searchQuery ? 'No swarms match your search.' : 'No swarms yet.'}
          </p>
          {!searchQuery && (
            <Button className="mt-4" onClick={onCreateSwarm}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first swarm
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSwarms.map((swarm) => (
            <SwarmCard
              key={swarm.id}
              swarm={swarm}
              onPause={onPauseSwarm}
              onResume={onResumeSwarm}
            />
          ))}
        </div>
      )}
    </div>
  );
}
