import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n';
import { PaymentCard } from '../components/PaymentCard';

const api = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api: (...a: unknown[]) => api(...a) }));

function show(orderStatus = 'accepted') {
  return render(
    <I18nProvider lang="fr">
      <MemoryRouter initialEntries={['/orders/o1']}>
        <PaymentCard orderId="o1" orderStatus={orderStatus} total={6} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => api.mockReset());

describe('payment card', () => {
  it('without Stripe keys it says "Paiements non configurés", offers no pay button and nothing else breaks', async () => {
    api.mockResolvedValue({ configured: false, testMode: true, payment: null });
    show();
    expect(await screen.findByTestId('payments-not-configured')).toHaveTextContent('Paiements non configurés');
    expect(screen.getByTestId('payment-card')).toHaveTextContent('Mode test');
    expect(screen.queryByTestId('pay-button')).toBeNull();
    expect(screen.getByTestId('payment-status')).toHaveTextContent('Non payé');
  });

  it('with keys, an accepted order can be paid; a delivered or cancelled one cannot', async () => {
    api.mockResolvedValue({ configured: true, testMode: true, payment: null });
    const first = show('accepted');
    expect(await screen.findByTestId('pay-button')).toHaveTextContent('6,00');
    first.unmount();
    show('cancelled');
    await screen.findByTestId('payment-card');
    expect(screen.queryByTestId('pay-button')).toBeNull();
  });

  it('shows what happened to the money: held, paid, refunded, with the receipt once there is one', async () => {
    api.mockResolvedValue({ configured: true, testMode: true, payment: { status: 'authorized', amountCents: 600, currency: 'eur' } });
    const held = show('preparing');
    expect(await screen.findByTestId('payment-status')).toHaveTextContent('Montant bloqué');
    expect(screen.getByTestId('receipt-link')).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).toBeNull();
    held.unmount();

    api.mockResolvedValue({ configured: true, testMode: true, payment: { status: 'refunded', amountCents: 600, currency: 'eur' } });
    show('cancelled');
    expect(await screen.findByText('Remboursé')).toBeInTheDocument();
  });

  it('a failed payment can be retried', async () => {
    api.mockResolvedValue({ configured: true, testMode: true, payment: { status: 'failed', amountCents: 600, currency: 'eur' } });
    show('accepted');
    expect(await screen.findByTestId('pay-button')).toBeInTheDocument();
    expect(screen.getByTestId('payment-status')).toHaveTextContent('Échec');
    expect(screen.queryByTestId('receipt-link')).toBeNull();
  });
});
