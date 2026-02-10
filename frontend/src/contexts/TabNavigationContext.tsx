import { createHmrContext } from '@/lib/hmr-context';
import type { TabType } from '@/types/tabs';

interface TabNavContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const TabNavContext = createHmrContext<TabNavContextType | null>(
  'TabNavContext',
  null
);
