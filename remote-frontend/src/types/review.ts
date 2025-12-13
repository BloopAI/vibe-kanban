export interface CodeFragment {
  file: string;
  start_line: number;
  end_line: number;
  message: string;
}

export interface ReviewComment {
  comment: string;
  fragments: CodeFragment[];
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
  fileHashMap: Record<string, string>;
}
