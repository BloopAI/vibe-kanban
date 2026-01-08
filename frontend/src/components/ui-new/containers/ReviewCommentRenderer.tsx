import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PrimaryButton } from '../primitives/PrimaryButton';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useReview, type ReviewComment } from '@/contexts/ReviewProvider';

interface ReviewCommentRendererProps {
  comment: ReviewComment;
  projectId?: string;
}

export function ReviewCommentRenderer({
  comment,
  projectId,
}: ReviewCommentRendererProps) {
  const { t } = useTranslation('common');
  const { deleteComment, updateComment } = useReview();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  const handleDelete = () => {
    deleteComment(comment.id);
  };

  const handleEdit = () => {
    setEditText(comment.text);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editText.trim()) {
      updateComment(comment.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(comment.text);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="p-base rounded-sm border border-brand bg-brand/10 font-sans">
        <WYSIWYGEditor
          value={editText}
          onChange={setEditText}
          placeholder={t('comments.editPlaceholder')}
          className="w-full text-normal min-h-[60px]"
          projectId={projectId}
          onCmdEnter={handleSave}
          autoFocus
        />
        <div className="mt-half flex gap-half">
          <PrimaryButton
            variant="default"
            onClick={handleSave}
            disabled={!editText.trim()}
          >
            {t('actions.saveChanges')}
          </PrimaryButton>
          <PrimaryButton variant="tertiary" onClick={handleCancel}>
            {t('actions.cancel')}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="p-base rounded-sm border border-brand bg-brand/10 font-sans">
      <WYSIWYGEditor
        value={comment.text}
        disabled={true}
        className="text-sm"
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
