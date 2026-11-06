import { renderHook, waitFor } from '@testing-library/react';
import { useInviteJoin } from './useInviteJoin';
import { joinGameByInvite } from '../api/invites';
import { storePendingInvite, hasPendingInvite } from './pendingInvite';

jest.mock('../api/invites', () => ({ joinGameByInvite: jest.fn() }));

const user = { email: 'a@b.pl', token: 'jwt' };

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('useInviteJoin', () => {
  it('does nothing without a logged-in user, and keeps the token for later', () => {
    storePendingInvite('tok');
    renderHook(() => useInviteJoin({ user: null, onJoined: jest.fn(), onFailed: jest.fn() }));
    expect(joinGameByInvite).not.toHaveBeenCalled();
    expect(hasPendingInvite()).toBe(true);
  });

  it('does nothing when no invite is parked', () => {
    renderHook(() => useInviteJoin({ user, onJoined: jest.fn(), onFailed: jest.fn() }));
    expect(joinGameByInvite).not.toHaveBeenCalled();
  });

  it('joins once the user logs in and opens the game', async () => {
    storePendingInvite('tok');
    joinGameByInvite.mockResolvedValue({ gameId: 'g1', joined: true });
    const onJoined = jest.fn();
    const { rerender } = renderHook(
      ({ u }) => useInviteJoin({ user: u, onJoined, onFailed: jest.fn() }),
      { initialProps: { u: null } },
    );
    rerender({ u: user });

    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('g1'));
    expect(joinGameByInvite).toHaveBeenCalledTimes(1);
    expect(joinGameByInvite).toHaveBeenCalledWith('tok');
    expect(hasPendingInvite()).toBe(false);
  });

  it('reports an invalid link as inviteLinkInvalid', async () => {
    storePendingInvite('tok');
    joinGameByInvite.mockRejectedValue({ response: { status: 404 } });
    const onFailed = jest.fn();
    renderHook(() => useInviteJoin({ user, onJoined: jest.fn(), onFailed }));
    await waitFor(() => expect(onFailed).toHaveBeenCalledWith('inviteLinkInvalid'));
  });

  it('reports any other failure as inviteLinkFailed', async () => {
    storePendingInvite('tok');
    joinGameByInvite.mockRejectedValue({ response: { status: 500 } });
    const onFailed = jest.fn();
    renderHook(() => useInviteJoin({ user, onJoined: jest.fn(), onFailed }));
    await waitFor(() => expect(onFailed).toHaveBeenCalledWith('inviteLinkFailed'));
  });

  it('parks the token again when the session turned out to be expired', async () => {
    storePendingInvite('tok');
    joinGameByInvite.mockRejectedValue({ response: { status: 401 } });
    const onFailed = jest.fn();
    renderHook(() => useInviteJoin({ user, onJoined: jest.fn(), onFailed }));
    await waitFor(() => expect(hasPendingInvite()).toBe(true));
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('lets /join trigger the join for an already logged-in user', async () => {
    joinGameByInvite.mockResolvedValue({ gameId: 'g2', joined: false });
    const onJoined = jest.fn();
    const { result } = renderHook(() => useInviteJoin({ user, onJoined, onFailed: jest.fn() }));

    storePendingInvite('tok');
    await result.current();
    expect(onJoined).toHaveBeenCalledWith('g2');
  });
});
