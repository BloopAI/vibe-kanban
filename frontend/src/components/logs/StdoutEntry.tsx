import RawLogText from '@/components/common/RawLogText';

interface StdoutEntryProps {
  content: string;
}

function StdoutEntry({ content }: StdoutEntryProps) {
  return (
    <div className="flex gap-2 px-4">
      <RawLogText content={content} channel="stdout" as="span" />
    </div>
  );
}

export default StdoutEntry;
