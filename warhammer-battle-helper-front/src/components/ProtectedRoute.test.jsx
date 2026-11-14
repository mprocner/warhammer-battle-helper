import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute, { returnPathAfterLogin } from './ProtectedRoute';

const LoginProbe = () => {
  const location = useLocation();
  return <span data-testid="login">{returnPathAfterLogin(location.state)}</span>;
};

const renderAt = (path, user) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route path="/games/:id" element={<ProtectedRoute user={user}><span>session</span></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>
);

describe('ProtectedRoute', () => {
  it('renders the page for a logged-in user', () => {
    renderAt('/games/abc', { email: 'a@b.c' });
    expect(screen.getByText('session')).toBeInTheDocument();
  });

  // PLAYRPG-338: a guest opening a game link lands in that game after logging in.
  it('sends a guest to /login remembering the page they wanted', () => {
    renderAt('/games/abc?x=1', null);
    expect(screen.getByTestId('login').textContent).toBe('/games/abc?x=1');
  });
});

describe('returnPathAfterLogin', () => {
  it('falls back to the lobby without a remembered page', () => {
    expect(returnPathAfterLogin(null)).toBe('/games');
    expect(returnPathAfterLogin({})).toBe('/games');
  });

  it('ignores anything that is not an in-app path', () => {
    expect(returnPathAfterLogin({ from: 'https://evil.example' })).toBe('/games');
    expect(returnPathAfterLogin({ from: '//evil.example' })).toBe('/games');
    expect(returnPathAfterLogin({ from: { pathname: '/x' } })).toBe('/games');
  });
});
