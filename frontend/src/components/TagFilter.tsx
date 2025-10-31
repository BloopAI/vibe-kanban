import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { tagsApi } from '@/lib/api';
import type { Tag } from 'shared/types';

interface TagFilterProps {
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
}

export function TagFilter({ selectedTagIds, onTagsChange }: TagFilterProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const allTags = await tagsApi.list();
        setTags(allTags);
      } catch (error) {
        console.error('Failed to fetch tags:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTags();
  }, []);

  const handleToggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  const handleClearAll = () => {
    onTagsChange([]);
  };

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Filter by tags
            </span>
            {selectedTagIds.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 rounded-sm px-1 font-normal"
              >
                {selectedTagIds.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuLabel>Filter by tags</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoading ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Loading tags...
            </div>
          ) : tags.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No tags available
            </div>
          ) : (
            tags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.id}
                checked={selectedTagIds.includes(tag.id)}
                onCheckedChange={() => handleToggleTag(tag.id)}
              >
                {tag.tag_name}
              </DropdownMenuCheckboxItem>
            ))
          )}
          {selectedTagIds.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm font-normal"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Display selected tags as removable badges */}
      {selectedTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => handleToggleTag(tag.id)}
            >
              {tag.tag_name}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
