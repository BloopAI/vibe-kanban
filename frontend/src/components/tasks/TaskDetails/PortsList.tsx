interface PortsListProps {
  ports: Record<string, number>;
}

export function PortsList({ ports }: PortsListProps) {
  const entries = Object.entries(ports);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between py-1">
          <span className="text-muted-foreground">{key}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
    </div>
  );
}
