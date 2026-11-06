import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import InviteLinkSection from './InviteLinkSection';
import { getInviteLink, regenerateInviteLink, revokeInviteLink } from '../../api/invites';

jest.mock('../../api/invites', () => ({
  getInviteLink: jest.fn(),
  regenerateInviteLink: jest.fn(),
  revokeInviteLink: jest.fn(),
  buildInviteUrl: (token) => `https://playrpg.test/join/${token}`,
}));

const t = (key) => i18n.t(key);
const button = (key) => screen.getByRole('button', { name: new RegExp(t(key)) });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('InviteLinkSection', () => {
  it('offers to create a link when the game has none', async () => {
    getInviteLink.mockResolvedValue('');
    regenerateInviteLink.mockResolvedValue('tok1');
    render(<InviteLinkSection gameId="g1" />);

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t('players.inviteLink.create')) }));

    expect(await screen.findByDisplayValue('https://playrpg.test/join/tok1')).toBeInTheDocument();
    expect(regenerateInviteLink).toHaveBeenCalledWith('g1');
  });

  it('copies the full link to the clipboard', async () => {
    getInviteLink.mockResolvedValue('tok1');
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InviteLinkSection gameId="g1" />);

    await screen.findByDisplayValue('https://playrpg.test/join/tok1');
    fireEvent.click(button('players.inviteLink.copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://playrpg.test/join/tok1'));
    expect(await screen.findByText(t('players.inviteLink.copied'))).toBeInTheDocument();
  });

  it('asks before regenerating, then shows the new link', async () => {
    getInviteLink.mockResolvedValue('tok1');
    regenerateInviteLink.mockResolvedValue('tok2');
    render(<InviteLinkSection gameId="g1" />);
    await screen.findByDisplayValue('https://playrpg.test/join/tok1');

    fireEvent.click(button('players.inviteLink.regenerate'));
    expect(regenerateInviteLink).not.toHaveBeenCalled();
    expect(screen.getByText(t('players.inviteLink.regenerateConfirm'))).toBeInTheDocument();

    // The confirm modal's button carries the same label; it is the last one rendered.
    const confirmButtons = screen.getAllByRole('button', { name: new RegExp(t('players.inviteLink.regenerate')) });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByDisplayValue('https://playrpg.test/join/tok2')).toBeInTheDocument();
  });

  it('asks before revoking, then offers to create a link again', async () => {
    getInviteLink.mockResolvedValue('tok1');
    revokeInviteLink.mockResolvedValue();
    render(<InviteLinkSection gameId="g1" />);
    await screen.findByDisplayValue('https://playrpg.test/join/tok1');

    fireEvent.click(button('players.inviteLink.revoke'));
    expect(screen.getByText(t('players.inviteLink.revokeConfirm'))).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: new RegExp(t('players.inviteLink.revoke')) });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByRole('button', { name: new RegExp(t('players.inviteLink.create')) })).toBeInTheDocument();
    expect(revokeInviteLink).toHaveBeenCalledWith('g1');
    expect(screen.queryByDisplayValue(/join\/tok1/)).not.toBeInTheDocument();
  });

  it('shows an error when the action fails', async () => {
    getInviteLink.mockResolvedValue('');
    regenerateInviteLink.mockRejectedValue(new Error('boom'));
    render(<InviteLinkSection gameId="g1" />);

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t('players.inviteLink.create')) }));
    expect(await screen.findByText(t('common.error'))).toBeInTheDocument();
  });
});
