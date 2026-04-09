import { siGithub } from 'simple-icons';

type Props = {
  className?: string;
};

/** GitHub brand icon via simple-icons (lucide-react removed brand icons in v1). */
function GithubIcon({ className }: Props) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-label="GitHub"
    >
      <path d={siGithub.path} />
    </svg>
  );
}

export default GithubIcon;
