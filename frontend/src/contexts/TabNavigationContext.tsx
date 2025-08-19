import { createContext, useContext } from 'react';
import type { TabType } from '@/types/tabs';

interface TabNavContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const TabNavContext = createContext<TabNavContextType | null>(null);

export const useTabNavigation = () => {
  const context = useContext(TabNavContext);
  if (!context) {
    throw new Error('useTabNavigation must be used within TabNavContext');
  }
  return context;
};
