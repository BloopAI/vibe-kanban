import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';

interface SearchState {
  query: string;
  setQuery: (query: string) => void;
  active: boolean;
  clear: () => void;
}

const SearchContext = createContext<SearchState | null>(null);

interface SearchProviderProps {
  children: ReactNode;
}

export function SearchProvider({ children }: SearchProviderProps) {
  const [query, setQuery] = useState('');
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  // Check if we're on a tasks route
  const isTasksRoute = /^\/projects\/[^/]+\/tasks/.test(location.pathname);

  // Clear search when leaving tasks pages
  useEffect(() => {
    if (!isTasksRoute && query !== '') {
      setQuery('');
    }
  }, [isTasksRoute, query]);

  // Clear search when project changes
  useEffect(() => {
    setQuery('');
  }, [projectId]);

  const clear = () => setQuery('');

  const value: SearchState = {
    query,
    setQuery,
    active: isTasksRoute,
    clear,
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): SearchState {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
