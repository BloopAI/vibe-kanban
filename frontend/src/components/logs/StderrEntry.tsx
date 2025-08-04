interface StderrEntryProps {
  content: string;
}

function StderrEntry({ content }: StderrEntryProps) {
  return (
    <div className="flex gap-2 text-xs font-mono py-1">
      <span className="text-red-800 break-all">
        {content}
      </span>
    </div>
  );
}

export default StderrEntry;
