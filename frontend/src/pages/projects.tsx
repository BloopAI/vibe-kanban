import { useParams, useNavigate } from 'react-router-dom';
import { ProjectList } from '@/components/projects/project-list';
import { ProjectDetail } from '@/components/projects/project-detail';

export function Projects() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/projects');
  };

  if (projectId) {
    return <ProjectDetail projectId={projectId} onBack={handleBack} />;
  }

  return <ProjectList />;
}
