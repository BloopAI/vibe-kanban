import { ObjectFieldTemplateProps } from '@rjsf/utils';

export const ObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
  const { properties } = props;

  return (
    <div className="divide-y">
      {properties.map((element) => (
        <div key={element.name}>{element.content}</div>
      ))}
    </div>
  );
};
