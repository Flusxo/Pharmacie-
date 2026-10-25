import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

interface Detector {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/**
 * "Scan a code" for the stock search: reads an EAN-13 / Data Matrix with the camera through the browser's BarcodeDetector.
 * Only shown where that API exists (Chrome and Android); everywhere else the code can be typed in the search box.
 */
export function BarcodeScan({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const Detector = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

  useEffect(() => {
    if (!open || !Detector) return;
    let stop = false;
    let stream: MediaStream | null = null;
    const det = new Detector({ formats: ['ean_13', 'data_matrix', 'code_128'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stop) {
          const found = await det.detect(video.current).catch(() => []);
          // A French pharmacy pack carries a CIP13 (EAN-13 starting with 3400): keep the digits.
          const code = found.map((f) => f.rawValue.replace(/\D/g, '')).find((c) => c.length >= 13);
          if (code) {
            onCode(code.slice(-13));
            setOpen(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError(t('barcode.denied'));
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, Detector, onCode, t]);

  if (!Detector) return null;
  return (
    <>
      <button type="button" className="btn secondary small" onClick={() => (setError(null), setOpen((o) => !o))} aria-expanded={open}>
        {open ? t('barcode.stop') : t('barcode.scan')}
      </button>
      {open && (
        <div className="card stack" style={{ flexBasis: '100%' }}>
          <video
            ref={video}
            muted
            playsInline
            style={{ width: '100%', maxHeight: 280, borderRadius: 12, background: '#000' }}
            aria-label={t('barcode.scan')}
          />
          {error ? <p className="alert warn">{error}</p> : <p className="muted small">{t('barcode.hint')}</p>}
        </div>
      )}
    </>
  );
}
