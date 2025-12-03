import { useParams, useNavigate } from 'react-router-dom';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationSelection } from '@/hooks/useOrganizationSelection';
import { NodesProvider, useNodes } from '@/contexts/NodesContext';
import { NodeList } from '@/components/nodes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, RefreshCw, Server } from 'lucide-react';
import type { Node } from '@/types/nodes';

function NodesPageContent() {
  const { nodes, isLoading, isError, error, refetch } = useNodes();
  const navigate = useNavigate();

  const handleNodeClick = (node: Node) => {
    navigate(`/nodes/${node.id}`);
  };

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load nodes: {error?.message ?? 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading nodes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      <NodeList nodes={nodes} onNodeClick={handleNodeClick} />
    </div>
  );
}

export function Nodes() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const { data: organizations, isLoading: orgsLoading } = useUserOrganizations();
  const { selectedOrgId, selectedOrg, handleOrgSelect } = useOrganizationSelection({
    organizations,
  });

  // If viewing a specific node, show detail view (TODO: implement NodeDetail)
  if (nodeId) {
    return (
      <div className="space-y-6 p-8 pb-16 md:pb-8 h-full overflow-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/nodes')}>
            Back to Nodes
          </Button>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Node detail view coming soon. Node ID: {nodeId}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8 pb-16 md:pb-8 h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-8 w-8" />
            Nodes
          </h1>
          <p className="text-muted-foreground">
            Manage the nodes in your swarm that execute tasks
          </p>
        </div>
        <div className="flex items-center gap-4">
          {orgsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : organizations?.organizations && organizations.organizations.length > 1 ? (
            <Select value={selectedOrgId} onValueChange={handleOrgSelect}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : selectedOrg ? (
            <span className="text-sm text-muted-foreground">{selectedOrg.name}</span>
          ) : null}
        </div>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Select an organization to view its nodes
            </p>
          </CardContent>
        </Card>
      ) : (
        <NodesProvider organizationId={selectedOrgId}>
          <NodesPageContent />
        </NodesProvider>
      )}
    </div>
  );
}
