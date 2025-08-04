interface StdoutEntryProps {
  content: string;
  processName: string;
}

function StdoutEntry({ content, processName }: StdoutEntryProps) {
  return (
    <div className="flex gap-2 text-xs font-mono py-1">
      <span className="text-blue-600 shrink-0 font-semibold">
        [{processName}]
      </span>
      <span className="text-green-600 shrink-0">
        stdout:
      </span>
      <span className="text-gray-900 break-all">
        {content}
      </span>
    </div>
  );
}

export default StdoutEntry;
