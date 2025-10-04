import { Input } from './input';
import WYSIWYGEditor from './wysiwyg';

type Props = {
  title: string;
  description: string | null | undefined;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
};

const TitleDescriptionEditor = ({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
}: Props) => {
  return (
    <div className="space-y-3 flex-1">
      <Input
        className="text-2xl h-auto border-0 p-0"
        placeholder="Title*"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />
      <WYSIWYGEditor
        placeholder="Description"
        value={description ?? ''}
        onChange={onDescriptionChange}
      />
    </div>
  );
};

export default TitleDescriptionEditor;
