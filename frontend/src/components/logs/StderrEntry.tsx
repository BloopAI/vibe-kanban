import RawLogText from '@/components/common/RawLogText';

interface StderrEntryProps {
  content: string;
}

function StderrEntry({ content }: StderrEntryProps) {
  return <RawLogText content={content} channel="stderr" as="span" />;
}

export default StderrEntry;
