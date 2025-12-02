import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Folder,
  FolderGit,
  Image,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  isGitRepo?: boolean;
  className?: string;
}

/**
 * Returns the appropriate icon for a file or directory based on its name/extension
 */
export function FileIcon({
  name,
  isDirectory,
  isGitRepo,
  className,
}: FileIconProps) {
  const iconClass = cn('h-4 w-4 flex-shrink-0', className);

  if (isDirectory) {
    if (isGitRepo) {
      return <FolderGit className={cn(iconClass, 'text-green-600')} />;
    }
    return <Folder className={cn(iconClass, 'text-blue-500')} />;
  }

  const lower = name.toLowerCase();
  const ext = lower.split('.').pop() ?? '';

  // Code files
  if (
    ['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt'].includes(ext)
  ) {
    return <FileCode className={cn(iconClass, 'text-blue-400')} />;
  }

  // JSON/Config files
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) {
    return <FileJson className={cn(iconClass, 'text-yellow-500')} />;
  }

  // Markdown/Text files
  if (['md', 'markdown', 'mdx', 'txt', 'rtf'].includes(ext)) {
    return <FileText className={cn(iconClass, 'text-gray-500')} />;
  }

  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return <Image className={cn(iconClass, 'text-purple-400')} />;
  }

  // Config/dotfiles
  if (
    lower.startsWith('.') ||
    ['env', 'gitignore', 'dockerignore', 'editorconfig', 'prettierrc', 'eslintrc'].includes(ext) ||
    ['Dockerfile', 'Makefile', 'Gemfile', 'Rakefile'].includes(name)
  ) {
    return <Settings className={cn(iconClass, 'text-gray-400')} />;
  }

  // Font/Binary files
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) {
    return <FileType className={cn(iconClass, 'text-gray-400')} />;
  }

  // Default file icon
  return <File className={cn(iconClass, 'text-gray-400')} />;
}

export default FileIcon;
