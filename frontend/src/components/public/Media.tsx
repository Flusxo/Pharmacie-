/** Transparent cut-out pictures (a soft shadow, no frame): used when the live 3D is off. */
import { useI18n, type MessageKey } from '../../i18n';
import { Picture } from '../Picture';

const alt = (id: string) => `img.${id}` as MessageKey;

/** Floating cut-out object with a soft shadow. */
export function CutOut({ id, className = '' }: { id: string; className?: string }) {
  const { t } = useI18n();
  return <Picture id={id} alt={t(alt(id))} sizes="240px" className={`cutout-aside ${className}`} effects={['float', 'tilt']} />;
}
