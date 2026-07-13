import type { DocStatus } from '../api';

const STYLES: Record<DocStatus, string> = {
  draft: 'bg-panel text-muted',
  new: 'bg-warn text-white',
  modified: 'bg-mod text-white',
  synced: 'bg-ok text-white',
  built: 'bg-accent text-white',
  orphaned: 'bg-err text-white',
};

export default function StatusBadge({
  status,
}: {
  status: DocStatus;
}): JSX.Element {
  return (
    <span
      className={`inline-block border-2 border-ink px-2 py-0.5 text-xs font-black uppercase ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
