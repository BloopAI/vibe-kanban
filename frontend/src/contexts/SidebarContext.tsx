import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const SIDEBAR_SECTIONS_KEY = 'sidebar-sections';
const SIDEBAR_EXPANDED_TEAMS_KEY = 'sidebar-expanded-teams';

interface SidebarSections {
  workspace: boolean;
  teams: boolean;
  yourTeams: boolean;
  trySection: boolean;
}

interface SidebarContextType {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  sections: SidebarSections;
  toggleSection: (section: keyof SidebarSections) => void;
  expandedTeams: Record<string, boolean>;
  toggleTeamExpanded: (teamId: string) => void;
}

const defaultSections: SidebarSections = {
  workspace: true,
  teams: true,
  yourTeams: true,
  trySection: false,
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored ? JSON.parse(stored) : false;
  });

  const [sections, setSections] = useState<SidebarSections>(() => {
    const stored = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
    return stored ? JSON.parse(stored) : defaultSections;
  });

  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem(SIDEBAR_EXPANDED_TEAMS_KEY);
    return stored ? JSON.parse(stored) : {};
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(sections));
  }, [sections]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_TEAMS_KEY, JSON.stringify(expandedTeams));
  }, [expandedTeams]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev: boolean) => !prev);
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
  }, []);

  const toggleSection = useCallback((section: keyof SidebarSections) => {
    setSections((prev: SidebarSections) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const toggleTeamExpanded = useCallback((teamId: string) => {
    setExpandedTeams((prev: Record<string, boolean>) => ({
      ...prev,
      [teamId]: !prev[teamId],
    }));
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        toggleCollapsed,
        setCollapsed,
        sections,
        toggleSection,
        expandedTeams,
        toggleTeamExpanded,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
