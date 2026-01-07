import { ChangeEvent } from 'react';
import {
  FileInfoType,
  FormContextType,
  getTemplate,
  Registry,
  RJSFSchema,
  StrictRJSFSchema,
  TranslatableString,
  UIOptionsType,
  useFileWidgetProps,
  WidgetProps,
} from '@rjsf/utils';
import Markdown from 'markdown-to-jsx';

function FileInfoPreview<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  fileInfo,
  registry,
}: {
  fileInfo: FileInfoType;
  registry: Registry<T, S, F>;
}) {
  const { translateString } = registry;
  const { dataURL, type, name } = fileInfo;
  if (!dataURL) {
    return null;
  }

  // If type is JPEG or PNG then show image preview.
  // Originally, any type of image was supported, but this was changed into a whitelist
  // since SVGs and animated GIFs are also images, which are generally considered a security risk.
  if (['image/jpeg', 'image/png'].includes(type)) {
    return <img src={dataURL} style={{ maxWidth: '100%' }} className='file-preview' />;
  }

  // otherwise, let users download file

  return (
    <>
      {' '}
      <a download={`preview-${name}`} href={dataURL} className='file-download'>
        {translateString(TranslatableString.PreviewLabel)}
      </a>
    </>
  );
}

function FilesInfo<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  filesInfo,
  registry,
  preview,
  onRemove,
  options,
}: {
  filesInfo: FileInfoType[];
  registry: Registry<T, S, F>;
  preview?: boolean;
  onRemove: (index: number) => void;
  options: UIOptionsType<T, S, F>;
}) {
  if (filesInfo.length === 0) {
    return null;
  }
  const { translateString } = registry;

  const { RemoveButton } = getTemplate<'ButtonTemplates', T, S, F>('ButtonTemplates', registry, options);

  return (
    <ul className='file-info'>
      {filesInfo.map((fileInfo, key) => {
        const { name, size, type } = fileInfo;
        const handleRemove = () => onRemove(key);
        return (
          <li key={key}>
            <Markdown>{translateString(TranslatableString.FilesInfo, [name, type, String(size)])}</Markdown>
            {preview && <FileInfoPreview<T, S, F> fileInfo={fileInfo} registry={registry} />}
            <RemoveButton onClick={handleRemove} registry={registry} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 *  The `FileWidget` is a widget for rendering file upload fields.
 *  It is typically used with a string property with data-url format.
 */
function FileWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const { disabled, readonly, required, multiple, onChange, value, options, registry } = props;
  const { filesInfo, handleChange, handleRemove } = useFileWidgetProps(value, onChange, multiple);
  const BaseInputTemplate = getTemplate<'BaseInputTemplate', T, S, F>('BaseInputTemplate', registry, options);

  const handleOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleChange(event.target.files);
    }
  };

  return (
    <div>
      <BaseInputTemplate
        {...props}
        disabled={disabled || readonly}
        type='file'
        required={value ? false : required} // this turns off HTML required validation when a value exists
        onChangeOverride={handleOnChangeEvent}
        value=''
        accept={options.accept ? String(options.accept) : undefined}
      />
      <FilesInfo<T, S, F>
        filesInfo={filesInfo}
        onRemove={handleRemove}
        registry={registry}
        preview={options.filePreview}
        options={options}
      />
    </div>
  );
}

export default FileWidget;
