import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FixedCostDialog } from './FixedCostDialog';

const mutateAsync = vi.fn();
vi.mock('@/hooks/useFinance', () => ({ useSaveFixedCost: () => ({ mutateAsync, isPending: false }) }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

const companies = [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }];
const setup = () => render(<FixedCostDialog open onOpenChange={() => {}} companies={companies} />);
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));

beforeEach(() => { mutateAsync.mockReset(); toastError.mockReset(); });

describe('FixedCostDialog', () => {
  it('valideert verplichte velden', async () => {
    setup();
    submit();
    expect(await screen.findByText('Naam is verplicht')).toBeInTheDocument();
    expect(screen.getByText('Kies een bedrijf')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('weigert negatief bedrag', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Bedrijf'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Bedrag per maand'), { target: { value: '-5' } });
    submit();
    expect(await screen.findByText('Bedrag moet 0 of meer zijn')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('biedt de 7 categorieen en alleen meegegeven bedrijven', () => {
    setup();
    expect(screen.getByLabelText('Categorie').querySelectorAll('option')).toHaveLength(7);
    expect(screen.getByLabelText('Bedrijf').querySelectorAll('option')).toHaveLength(3); // placeholder + 2
  });

  it('slaat op met juiste payload', async () => {
    mutateAsync.mockResolvedValue(undefined);
    setup();
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'HubSpot' } });
    fireEvent.change(screen.getByLabelText('Bedrijf'), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('Categorie'), { target: { value: 'software' } });
    fireEvent.change(screen.getByLabelText('Bedrag per maand'), { target: { value: '450' } });
    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      company_id: 'b', name: 'HubSpot', category: 'software', monthly_amount: 450, exact_supplier_code: null, active: true,
    }));
  });

  it('toont foutmelding als opslaan faalt', async () => {
    mutateAsync.mockRejectedValue(new Error('geen recht'));
    setup();
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Bedrijf'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Bedrag per maand'), { target: { value: '1' } });
    submit();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('geen recht'));
  });
});
