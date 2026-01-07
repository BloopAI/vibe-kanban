import { createContext } from 'react';
import type { TabType } from '@/types/tabs';

interface TabNavContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const TabNavContext = createContext<TabNavContextType | null>(null);
