import RawLogText from '@/components/common/RawLogText';

interface StdoutEntryProps {
  content: string;
}

function StdoutEntry({ content }: StdoutEntryProps) {
  return <RawLogText content={content} channel="stdout" as="span" />;
}

export default StdoutEntry;
