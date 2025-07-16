import { useEffect, useState } from 'react';
import { Plus, Search, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/ui/loader';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { IntegrationForm } from '@/components/integrations/IntegrationForm';
import { CategoryFilter } from '@/components/integrations/CategoryFilter';
import { 
  IntegrationWithCategory, 
  IntegrationCategory,
  CreateIntegrationRequest,
  UpdateIntegrationRequest,
  getProviderDisplayName 
} from '@/lib/types/integrations';
import { integrationsApi } from '@/lib/api/integrations';
import { useToast } from '@/hooks/use-toast';

export function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationWithCategory[]>([]);
  const [categories, setCategories] = useState<IntegrationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<IntegrationWithCategory | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [integrationsData, categoriesData] = await Promise.all([
        integrationsApi.listIntegrations(),
        integrationsApi.getCategories(),
      ]);
      setIntegrations(integrationsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load integrations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load integrations. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleToggleIntegration = async (id: string, enabled: boolean) => {
    try {
      await integrationsApi.toggleIntegration(id, enabled);
      setIntegrations(prev => 
        prev.map(integration => 
          integration.id === id 
            ? { ...integration, enabled }
            : integration
        )
      );
      toast({
        title: 'Success',
        description: `Integration ${enabled ? 'enabled' : 'disabled'} successfully.`,
      });
    } catch (error) {
      console.error('Failed to toggle integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to update integration status.',
        variant: 'destructive',
      });
    }
  };

  const handleTestIntegration = async (id: string) => {
    try {
      const result = await integrationsApi.testIntegration(id);
      toast({
        title: result.success ? 'Test Successful' : 'Test Failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      
      // Refresh to update health status
      await loadData();
    } catch (error) {
      console.error('Failed to test integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to test integration.',
        variant: 'destructive',
      });
    }
  };

  const handleSyncIntegration = async (id: string) => {
    try {
      await integrationsApi.syncIntegration(id);
      toast({
        title: 'Success',
        description: 'Integration synced successfully.',
      });
      
      // Refresh to update sync status
      await loadData();
    } catch (error) {
      console.error('Failed to sync integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to sync integration.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteIntegration = async (id: string) => {
    try {
      await integrationsApi.deleteIntegration(id);
      setIntegrations(prev => prev.filter(integration => integration.id !== id));
      toast({
        title: 'Success',
        description: 'Integration deleted successfully.',
      });
    } catch (error) {
      console.error('Failed to delete integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete integration.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateIntegration = async (data: CreateIntegrationRequest | UpdateIntegrationRequest) => {
    try {
      await integrationsApi.createIntegration(data as CreateIntegrationRequest);
      await loadData();
      setShowCreateForm(false);
      toast({
        title: 'Success',
        description: 'Integration created successfully.',
      });
    } catch (error) {
      console.error('Failed to create integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to create integration.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateIntegration = async (id: string, data: CreateIntegrationRequest | UpdateIntegrationRequest) => {
    try {
      await integrationsApi.updateIntegration(id, data as UpdateIntegrationRequest);
      await loadData();
      setEditingIntegration(null);
      toast({
        title: 'Success',
        description: 'Integration updated successfully.',
      });
    } catch (error) {
      console.error('Failed to update integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to update integration.',
        variant: 'destructive',
      });
    }
  };

  // Filter integrations based on search and category
  const filteredIntegrations = integrations.filter(integration => {
    const matchesSearch = integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         getProviderDisplayName(integration.provider).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || integration.category.id === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Group integrations by category
  const integrationsByCategory = categories.map(category => ({
    category,
    integrations: filteredIntegrations.filter(integration => integration.category.id === category.id),
  })).filter(group => group.integrations.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">
            Connect your favorite tools and services to enhance your workflow.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Integration
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search integrations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>
        </div>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{integrations.length}</div>
          <div className="text-sm text-muted-foreground">Total Integrations</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {integrations.filter(i => i.enabled).length}
          </div>
          <div className="text-sm text-muted-foreground">Active</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {integrations.filter(i => i.health_status === 'healthy').length}
          </div>
          <div className="text-sm text-muted-foreground">Healthy</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-600">
            {integrations.filter(i => i.health_status === 'error').length}
          </div>
          <div className="text-sm text-muted-foreground">Errors</div>
        </Card>
      </div>

      {/* Integrations by Category */}
      {integrationsByCategory.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            {searchTerm || selectedCategory !== 'all' 
              ? 'No integrations match your filters.' 
              : 'No integrations configured yet.'}
          </div>
          {!searchTerm && selectedCategory === 'all' && (
            <Button 
              className="mt-4" 
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Integration
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          {integrationsByCategory.map(({ category, integrations }) => (
            <div key={category.id} className="space-y-4">
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold">{category.display_name}</h2>
                <Badge variant="secondary">{integrations.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {integrations.map(integration => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onToggle={handleToggleIntegration}
                    onTest={handleTestIntegration}
                    onSync={handleSyncIntegration}
                    onEdit={setEditingIntegration}
                    onDelete={handleDeleteIntegration}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Integration Form */}
      {showCreateForm && (
        <IntegrationForm
          categories={categories}
          onSubmit={handleCreateIntegration}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Edit Integration Form */}
      {editingIntegration && (
        <IntegrationForm
          categories={categories}
          integration={editingIntegration}
          onSubmit={(data) => handleUpdateIntegration(editingIntegration.id, data)}
          onCancel={() => setEditingIntegration(null)}
        />
      )}
    </div>
  );
}