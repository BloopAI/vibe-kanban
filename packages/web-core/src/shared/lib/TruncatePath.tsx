export function DisplayTruncatedPath({ path }: { path: string }) {
  return (
    <span
      className="block overflow-hidden text-ellipsis whitespace-nowrap font-ibm-plex-mono"
      style={{ direction: 'rtl', unicodeBidi: 'plaintext', textAlign: 'left' }}
      title={path}
    >
      {path}
    </span>
  );
}
