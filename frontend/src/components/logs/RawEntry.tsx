interface RawEntryProps {
  content: string;
  processName: string;
  timestamp: number;
}

function RawEntry({ content, processName, timestamp }: RawEntryProps) {
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="flex gap-2 text-xs font-mono py-1">
      <span className="text-gray-500 shrink-0">
        {formatTime(timestamp)}
      </span>
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
