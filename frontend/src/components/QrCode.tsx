import { useEffect, useState } from 'react';

/** QR code drawn as SVG squares (no HTML injection); the generator is loaded only when needed. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [cells, setCells] = useState<boolean[][] | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const rows = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
      if (alive) setCells(rows);
    });
    return () => {
      alive = false;
    };
  }, [text]);
  if (!cells) return <div className="qr" aria-busy="true" />;
  const n = cells.length;
  return (
    <svg className="qr" viewBox={`-4 -4 ${n + 8} ${n + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x="-4" y="-4" width={n + 8} height={n + 8} fill="#fff" />
      {cells.flatMap((row, r) =>
        row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#0b1f17" /> : null)),
      )}
    </svg>
  );
}
