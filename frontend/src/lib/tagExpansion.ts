import type { Tag } from 'shared/types';

export interface ParsedTagCommand {
  tagName: string;
  args: string;
  fullMatch: string;
  startPos: number;
  endPos: number;
}

/**
 * Parse text for /tag_name arguments patterns
 * Supports multiple / commands in the same text
 *
 * @param text - Input text to parse
 * @returns Array of parsed tag commands with their positions
 */
export function parseTagCommands(text: string): ParsedTagCommand[] {
  const commands: ParsedTagCommand[] = [];
  
  // Remove Markdown escape characters (like \_) before matching
  const unescapedText = text.replace(/\\_/g, '_');
  
  // Pattern matches /tag_name arguments
  // Simpler pattern: /tag_name followed by optional text
  const pattern = /\/([a-zA-Z0-9_-]+)(?:\s+(.+?))?$/g;
  
  let match;
  while ((match = pattern.exec(unescapedText)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    const argumentsText = match[2]?.trim() || '';
    
    commands.push({
      tagName,
      args: argumentsText,
      fullMatch,
      startPos: match.index,
      endPos: match.index + fullMatch.length,
    });
  }
  
  return commands;
}

/**
 * Expand tag commands by replacing them with their content
 * with $ARGUMENTS placeholders replaced
 *
 * @param text - Input text containing /tag_name commands
 * @param tags - Array of available tags
 * @returns Text with expanded tag commands
 */
export async function expandTagCommands(
  text: string,
  tags: Tag[]
): Promise<string> {
  // Remove Markdown escape characters before processing
  const unescapedText = text.replace(/\\_/g, '_');
  
  const commands = parseTagCommands(unescapedText);
  if (commands.length === 0) return text;
  
  // Build a map of tag_name -> content for quick lookup
  const tagMap = new Map(tags.map((t) => [t.tag_name, t.content]));
  
  // Replace commands from end to start to maintain correct positions
  let result = unescapedText;
  
  // Sort commands by position in descending order
  const sortedCommands = [...commands].sort((a, b) => b.startPos - a.startPos);
  
  for (const cmd of sortedCommands) {
    const tagContent = tagMap.get(cmd.tagName);
    
    if (tagContent) {
      // Replace placeholders with arguments
      const expanded = replacePlaceholders(tagContent, cmd.args);
      
      // Replace the command with expanded content
      const before = result.slice(0, cmd.startPos);
      const after = result.slice(cmd.endPos);
      result = before + expanded + after;
    }
  }
  
  return result;
}

/**
 * Replace placeholders in tag content with arguments
 * Supported placeholders:
 * - $ARGUMENTS
 * - {args}
 * - {{args}}
 *
 * @param content - Tag content with placeholders
 * @param arguments - Arguments to replace placeholders with
 * @returns Content with placeholders replaced
 */
export function replacePlaceholders(
  content: string,
  args: string
): string {
  return content
    .replace(/\$ARGUMENTS\b/g, args)
    .replace(/\{args\}/g, args)
    .replace(/\{\{args\}\}/g, args);
}

/**
 * Check if a tag contains any argument placeholders
 *
 * @param content - Tag content to check
 * @returns True if content contains placeholders
 */
export function hasPlaceholders(content: string): boolean {
  return /\$ARGUMENTS\b|\{args\}|\{\{args\}\}/.test(content);
}

/**
 * Extract tag names from text that contain placeholders
 *
 * @param text - Input text containing / commands
 * @param tags - Array of available tags
 * @returns Array of tag names that accept arguments
 */
export function extractTagsWithArguments(
  text: string,
  tags: Tag[]
): string[] {
  const commands = parseTagCommands(text);
  const tagMap = new Map(tags.map((t) => [t.tag_name, t.content]));
  
  return commands
    .filter((cmd) => {
      const content = tagMap.get(cmd.tagName);
      return content && hasPlaceholders(content);
    })
    .map((cmd) => cmd.tagName);
}
