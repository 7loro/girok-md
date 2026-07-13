import { useEffect, useRef } from 'react';

export default function LogView({ lines }: { lines: string[] }): JSX.Element {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <pre
      ref={ref}
      role="log"
      aria-live="polite"
      className="brutal p-3 text-xs font-mono h-72 overflow-y-auto whitespace-pre-wrap bg-ink text-paper"
    >
      {lines.length > 0 ? lines.join('\n') : 'No output yet.'}
    </pre>
  );
}
