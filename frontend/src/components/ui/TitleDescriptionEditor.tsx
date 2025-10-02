import { Input } from './input';
import WYSIWYGEditor from './wysiwyg';

const TitleDescriptionEditor = () => {
  return (
    <div>
      <Input className="text-2xl h-auto border-0 p-0" placeholder="Title*" />
      <WYSIWYGEditor placeholder="Description" />
    </div>
  );
};

export default TitleDescriptionEditor;
