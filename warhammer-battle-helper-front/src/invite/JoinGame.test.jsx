import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../i18n';
import JoinGame from './JoinGame';
import PendingInviteHint from './PendingInviteHint';
import { PENDING_INVITE_KEY } from './pendingInvite';

const renderAt = (path, props) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/join/:token" element={<JoinGame {...props} />} />
      <Route path="/login" element={<div>login page<PendingInviteHint /></div>} />
      <Route path="/games" element={<div>games page</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => localStorage.clear());

describe('JoinGame', () => {
  it('parks the token and sends a guest to /login with the invite hint', async () => {
    const onInviteReady = jest.fn();
    renderAt('/join/tok123', { user: null, onInviteReady });

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe('tok123');
    expect(screen.getByText(i18n.t('invite.loginHint'))).toBeInTheDocument();
    expect(onInviteReady).not.toHaveBeenCalled();
  });

  it('sends a logged-in user to /games and triggers the join', async () => {
    const onInviteReady = jest.fn();
    renderAt('/join/tok123', { user: { email: 'a@b.pl' }, onInviteReady });

    expect(await screen.findByText('games page')).toBeInTheDocument();
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe('tok123');
    expect(onInviteReady).toHaveBeenCalledTimes(1);
  });
});

describe('PendingInviteHint', () => {
  it('stays hidden without a parked invite', () => {
    render(<PendingInviteHint />);
    expect(screen.queryByText(i18n.t('invite.loginHint'))).not.toBeInTheDocument();
  });
});
