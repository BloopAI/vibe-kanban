import RawLogText from '@/components/common/RawLogText';

interface StderrEntryProps {
  content: string;
}

function StderrEntry({ content }: StderrEntryProps) {
  return (
    <div className="flex gap-2 px-4">
      <RawLogText content={content} channel="stderr" as="span" />
    </div>
  );
}

export default StderrEntry;
