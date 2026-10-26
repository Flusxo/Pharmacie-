import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useI18n } from '../i18n';
import { ApiError, api, getToken } from '../lib/api';
import { apiUrl } from '../lib/apiBase';
import { formatDateTime } from '../lib/format';
import { ErrorBox } from './ui';

export interface PrivateFile {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Fetches a private file with the login (a plain <img src> cannot send it) and returns a temporary local address. */
async function fetchBlobUrl(id: string): Promise<string> {
  const res = await fetch(apiUrl(`/files/${id}`), { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, 'file');
  return URL.createObjectURL(await res.blob());
}

function Viewer({ file }: { file: PrivateFile }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (url)
    return file.contentType === 'application/pdf' ? (
      <a href={url} target="_blank" rel="noreferrer" className="btn secondary small">
        {t('files.openPdf')}
      </a>
    ) : (
      <img src={url} alt={t('files.imageAlt', { name: file.filename })} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 12 }} />
    );
  return (
    <>
      <button
        type="button"
        className="btn secondary small"
        onClick={() =>
          void fetchBlobUrl(file.id)
            .then(setUrl)
            .catch(() => setError(true))
        }
      >
        {t('files.view')}
      </button>
      {error && <span className="badge bad">{t('files.cannotOpen')}</span>}
    </>
  );
}

/**
 * Lists the private files of one place (a request, an applicant) and, unless read-only, lets the owner add and remove
 * some. Photos and PDFs only, 2 MB each; the server checks the real content again.
 */
export function FileManager({
  listPath,
  uploadPath,
  deletePath,
  readOnly = false,
  collapsed = false,
  title,
  help,
  testId = 'files',
}: {
  listPath: string;
  uploadPath?: string;
  deletePath?: (id: string) => string;
  readOnly?: boolean;
  /** Load the list only when opened (long lists of cards). */
  collapsed?: boolean;
  title: string;
  help?: string;
  testId?: string;
}) {
  const { t, locale } = useI18n();
  const [files, setFiles] = useState<PrivateFile[] | null>(null);
  const [open, setOpen] = useState(!collapsed);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      api<{ items: PrivateFile[] }>(listPath)
        .then((r) => setFiles(r.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error'))),
    [listPath, t],
  );
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !uploadPath) return;
    setError(null);
    if (!TYPES.includes(f.type)) return setError(t('files.badType'));
    if (f.size > MAX_BYTES) return setError(t('files.tooBig'));
    setBusy(true);
    try {
      const res = await fetch(apiUrl(uploadPath), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': f.type, 'X-Filename': encodeURIComponent(f.name) },
        body: f,
      });
      if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? t('common.error'));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="stack" style={{ gap: 8 }} data-testid={testId}>
      {help && (
        <p className="muted small" style={{ margin: 0 }}>
          {help}
        </p>
      )}
      {error && <ErrorBox message={error} />}
      {files?.length === 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          {t('files.none')}
        </p>
      )}
      {files?.map((f) => (
        <div key={f.id} className="row between" style={{ flexWrap: 'wrap', gap: 8 }} data-testid="private-file">
          <span className="stack" style={{ gap: 2 }}>
            <strong>{f.filename}</strong>
            <span className="muted small">
              {Math.max(1, Math.round(f.sizeBytes / 1024))} KB · {formatDateTime(f.createdAt, locale)}
            </span>
          </span>
          <span className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Viewer file={f} />
            {!readOnly && deletePath && (
              <button type="button" className="btn ghost small" onClick={() => void api(deletePath(f.id), { method: 'DELETE' }).then(load)}>
                {t('files.remove')}
              </button>
            )}
          </span>
        </div>
      ))}
      {!readOnly && uploadPath && (
        <>
          <input ref={input} type="file" accept={TYPES.join(',')} onChange={(e) => void onPick(e)} hidden data-testid="file-input" />
          <button
            type="button"
            className="btn secondary small"
            style={{ width: 'fit-content' }}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {t('files.add')}
          </button>
        </>
      )}
    </div>
  );
  if (!collapsed) {
    return (
      <section className="card stack" aria-label={title}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {body}
      </section>
    );
  }
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{title}</summary>
      {open && body}
    </details>
  );
}
