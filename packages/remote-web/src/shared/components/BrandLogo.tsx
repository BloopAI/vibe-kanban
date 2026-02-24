interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export function BrandLogo({
  className = "h-8 w-auto",
  alt = "Vibe Kanban",
}: BrandLogoProps) {
  return (
    <picture>
      <source
        srcSet="/vibe-kanban-logo-dark.svg"
        media="(prefers-color-scheme: dark)"
      />
      <img src="/vibe-kanban-logo.svg" alt={alt} className={className} />
    </picture>
  );
}
