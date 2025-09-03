import { ObjectFieldTemplateProps } from '@rjsf/utils';

export const ObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
  const { properties } = props;

  return (
    <div className="space-y-6">
      {properties.map((element) => (
        <div key={element.name}>
          {element.content}
        </div>
      ))}
    </div>
  );
};
