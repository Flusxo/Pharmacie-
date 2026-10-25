import { useI18n } from '../i18n';
import { useSavedPharmacies } from '../lib/saved';

/** Heart toggle: saves a pharmacy for this account in this browser. */
export function SaveButton({ pharmacyId, name }: { pharmacyId: string; name: string }) {
  const { t } = useI18n();
  const { isSaved, toggle } = useSavedPharmacies();
  const on = isSaved(pharmacyId);
  return (
    <button
      type="button"
      className={`save-btn ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={t(on ? 'saved.remove' : 'saved.add', { name })}
      title={t(on ? 'saved.remove' : 'saved.add', { name })}
      onClick={() => toggle(pharmacyId)}
      data-testid="save-pharmacy"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
        <path
          d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 5 6.2 5c2 0 3.3 1.1 3.8 2 .5-.9 1.8-2 3.8-2 3.3 0 5.3 3.4 3.8 6.8C19.5 16.4 12 21 12 21z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
