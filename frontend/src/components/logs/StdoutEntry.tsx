interface StdoutEntryProps {
  content: string;
}

function StdoutEntry({ content }: StdoutEntryProps) {
  return (
    <div className="flex gap-2 text-xs font-mono px-4">
      <span className="text-gray-900 break-all">
        {content}
      </span>
    </div>
  );
}

export default StdoutEntry;
