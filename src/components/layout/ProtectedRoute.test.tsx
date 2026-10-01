import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

let roles: string[] = [];
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ roles, loading: false }) }));

const app = () => render(
  <MemoryRouter initialEntries={['/finance']}>
    <Routes>
      <Route path="/" element={<p>home</p>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><p>finance</p></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>);

describe('finance route guard', () => {
  it('redirects a sales_executive home', () => { roles = ['sales_executive']; app(); expect(screen.getByText('home')).toBeInTheDocument(); });
  it('lets an admin in', () => { roles = ['admin']; app(); expect(screen.getByText('finance')).toBeInTheDocument(); });
});
