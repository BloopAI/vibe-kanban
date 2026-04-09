import { useState, useMemo, type ComponentType, type SVGProps } from 'react';
import {
  Tag,
  Bookmark,
  Star,
  Heart,
  Flag,
  Pin,
  Circle,
  Square,
  Check,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Pause,
  Play,
  Loader,
  Code,
  Terminal,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Bug,
  Wrench,
  Cog,
  File,
  FileText,
  Clipboard,
  ClipboardList,
  Scroll,
  Book,
  Notebook,
  PenTool,
  MessageCircle,
  MessageSquare,
  Mail,
  AtSign,
  Bell,
  Megaphone,
  Users,
  User,
  Zap,
  Flame,
  Sparkles,
  Crown,
  Award,
  Target,
  Crosshair,
  Focus,
  Palette,
  Brush,
  Image,
  Layout,
  Grid3X3,
  Layers,
  Component,
  Lightbulb,
  Rocket,
  Package,
  Box,
  Archive,
  Trash,
  Folder,
  Database,
  Search,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Map of icon names to components
const ICON_MAP: Record<string, IconComponent> = {
  tag: Tag,
  bookmark: Bookmark,
  star: Star,
  heart: Heart,
  flag: Flag,
  pin: Pin,
  circle: Circle,
  square: Square,
  check: Check,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'alert-circle': AlertCircle,
  clock: Clock,
  pause: Pause,
  play: Play,
  loader: Loader,
  code: Code,
  terminal: Terminal,
  'git-branch': GitBranch,
  'git-merge': GitMerge,
  'git-pull-request': GitPullRequest,
  bug: Bug,
  wrench: Wrench,
  cog: Cog,
  file: File,
  'file-text': FileText,
  clipboard: Clipboard,
  'clipboard-list': ClipboardList,
  scroll: Scroll,
  book: Book,
  notebook: Notebook,
  'pen-tool': PenTool,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  mail: Mail,
  'at-sign': AtSign,
  bell: Bell,
  megaphone: Megaphone,
  users: Users,
  user: User,
  zap: Zap,
  flame: Flame,
  sparkles: Sparkles,
  crown: Crown,
  award: Award,
  target: Target,
  crosshair: Crosshair,
  focus: Focus,
  palette: Palette,
  brush: Brush,
  image: Image,
  layout: Layout,
  grid: Grid3X3,
  layers: Layers,
  component: Component,
  figma: PenTool,
  lightbulb: Lightbulb,
  rocket: Rocket,
  package: Package,
  box: Box,
  archive: Archive,
  trash: Trash,
  folder: Folder,
  database: Database,
};

const ALL_ICONS = Object.keys(ICON_MAP);

// Helper to get a Lucide icon by name
export function getLucideIcon(iconName: string): IconComponent | null {
  return ICON_MAP[iconName] || null;
}

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}

export function IconPicker({ value, onChange, disabled }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const CurrentIcon = getLucideIcon(value);

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return ALL_ICONS;
    return ALL_ICONS.filter((icon) =>
      icon.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          disabled={disabled}
        >
          {CurrentIcon ? (
            <CurrentIcon className="h-4 w-4" />
          ) : (
            <HelpCircle className="h-4 w-4" />
          )}
          <span className="text-sm">{value || 'Select icon'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search icons..."
              className="pl-8 h-8"
            />
          </div>

          {/* Icons grid */}
          <div className="h-48 overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {filteredIcons.map((iconName) => {
                const IconComp = getLucideIcon(iconName);
                if (!IconComp) return null;

                return (
                  <button
                    key={iconName}
                    type="button"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded border transition-colors hover:bg-accent',
                      value === iconName
                        ? 'border-foreground bg-accent'
                        : 'border-transparent'
                    )}
                    onClick={() => {
                      onChange(iconName);
                      setOpen(false);
                    }}
                    title={iconName}
                  >
                    <IconComp className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            {filteredIcons.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No icons found
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
