import { useEffect, useState } from 'react';
import { api, type Overview as OverviewData, type DocStatus } from '../api';
import StatusBadge from '../components/StatusBadge';

const STATUS_ORDER: DocStatus[] = ['draft', 'pending', 'synced', 'built', 'orphaned'];

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export default function Overview(): JSX.Element {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.overview().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-err font-bold">Failed to load overview: {error}</p>;
  if (!data) return <p className="font-bold">Loading…</p>;

  const pipeline: Array<{ label: string; at: string | null }> = [
    { label: 'Last sync', at: data.pipeline.lastSyncAt },
    { label: 'Last build', at: data.pipeline.lastBuildAt },
    { label: 'Last deploy', at: data.pipeline.lastDeployAt },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-black">Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="brutal p-4">
          <p className="text-3xl font-black">{data.total}</p>
          <p className="text-sm font-bold text-muted">documents</p>
        </div>
        {STATUS_ORDER.map((status) => (
          <div key={status} className="brutal p-4">
            <p className="text-3xl font-black">{data.counts[status]}</p>
            <StatusBadge status={status} />
          </div>
        ))}
      </div>

      <div className="brutal p-4">
        <h3 className="font-black mb-3">Pipeline</h3>
        <div className="flex flex-wrap items-center gap-3">
          {pipeline.map((step, i) => (
            <div key={step.label} className="flex items-center gap-3">
              {i > 0 && <span className="font-black text-accent">→</span>}
              <div className="border-2 border-ink px-3 py-2">
                <p className="text-xs font-black uppercase">{step.label}</p>
                <p className="text-sm">{formatTime(step.at)}</p>
              </div>
            </div>
          ))}
          <span className="text-sm font-bold text-muted ml-2">{data.translatedCount} translated</span>
        </div>
      </div>

      <div className="brutal p-4">
        <h3 className="font-black mb-3">Recent jobs</h3>
        {data.recentJobs.length === 0 && <p className="text-sm text-muted">No jobs yet.</p>}
        <ul className="space-y-1">
          {data.recentJobs.map((job) => (
            <li key={job.id} className="flex gap-3 text-sm font-bold">
              <span className="uppercase w-20">{job.type}</span>
              <span
                className={
                  job.status === 'succeeded' ? 'text-ok' : job.status === 'failed' ? 'text-err' : 'text-muted'
                }
              >
                {job.status}
              </span>
              <span className="text-muted">{formatTime(job.startedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
