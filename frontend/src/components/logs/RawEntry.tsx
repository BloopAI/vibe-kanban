interface RawEntryProps {
  content: string;
  processName: string;
}

function RawEntry({ content, processName }: RawEntryProps) {
  return (
    <div className="flex gap-2 text-xs font-mono py-1">
      <span className="text-blue-600 shrink-0 font-semibold">
        [{processName}]
      </span>
      <span className="text-gray-700 break-all">
        {content}
      </span>
    </div>
  );
}

export default RawEntry;
