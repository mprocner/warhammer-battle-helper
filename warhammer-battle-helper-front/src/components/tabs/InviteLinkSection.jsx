import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddLinkIcon from '@mui/icons-material/AddLink';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { getInviteLink, regenerateInviteLink, revokeInviteLink, buildInviteUrl } from '../../api/invites';
import ConfirmModal from '../common/ConfirmModal';

// The game's single invite link (PLAYRPG-303), GM side. Anyone holding the link joins as a player
// without approval, so regenerating and revoking ask first: both kill the link already shared.
const InviteLinkSection = ({ gameId }) => {
  const { t } = useTranslation();
  const [token, setToken] = useState(null); // null = not loaded yet, '' = no link
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // null | 'copied' | 'error'
  const [confirm, setConfirm] = useState(null); // null | 'regenerate' | 'revoke'
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getInviteLink(gameId)
      .then((value) => { if (!cancelled) setToken(value || ''); })
      .catch(() => { if (!cancelled) { setToken(''); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [gameId]);

  const run = async (action) => {
    setBusy(true);
    setStatus(null);
    try {
      setToken((await action()) || '');
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // Creating the first link and regenerating are the same call: a fresh token replaces any old one.
  const generate = () => run(() => regenerateInviteLink(gameId));
  const revoke = () => run(async () => { await revokeInviteLink(gameId); return ''; });

  const copy = async () => {
    const url = buildInviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      // Clipboard API refused (insecure origin, denied permission): select the text so Ctrl+C works.
      inputRef.current?.select();
      setStatus(null);
    }
  };

  if (token === null) return null;

  return (
    <section className="players-tab__section players-tab__invite-link">
      <h4 className="players-tab__section-title">{t('players.inviteLink.title')}</h4>
      <p className="players-tab__hint">{t('players.inviteLink.description')}</p>

      {token ? (
        <>
          <div className="players-tab__invite">
            <input
              ref={inputRef}
              type="text"
              readOnly
              className="players-tab__invite-input players-tab__invite-url"
              value={buildInviteUrl(token)}
              aria-label={t('players.inviteLink.title')}
              onFocus={(e) => e.target.select()}
            />
            <button className="players-tab__invite-btn" onClick={copy} disabled={busy}>
              <ContentCopyIcon fontSize="inherit" /> {t('players.inviteLink.copy')}
            </button>
          </div>
          <div className="players-tab__invite-actions">
            <button className="players-tab__invite-btn" onClick={() => setConfirm('regenerate')} disabled={busy}>
              <AutorenewIcon fontSize="inherit" /> {t('players.inviteLink.regenerate')}
            </button>
            <button
              className="players-tab__invite-btn players-tab__invite-btn--danger"
              onClick={() => setConfirm('revoke')}
              disabled={busy}
            >
              <LinkOffIcon fontSize="inherit" /> {t('players.inviteLink.revoke')}
            </button>
          </div>
        </>
      ) : (
        <div className="players-tab__invite-actions">
          <button className="players-tab__invite-btn" onClick={generate} disabled={busy}>
            <AddLinkIcon fontSize="inherit" /> {t('players.inviteLink.create')}
          </button>
        </div>
      )}

      {status === 'copied' && (
        <p className="players-tab__invite-msg players-tab__invite-msg--success">{t('players.inviteLink.copied')}</p>
      )}
      {status === 'error' && (
        <p className="players-tab__invite-msg players-tab__invite-msg--error">{t('common.error')}</p>
      )}

      <ConfirmModal
        isOpen={confirm !== null}
        message={confirm === 'revoke' ? t('players.inviteLink.revokeConfirm') : t('players.inviteLink.regenerateConfirm')}
        confirmLabel={confirm === 'revoke' ? t('players.inviteLink.revoke') : t('players.inviteLink.regenerate')}
        onConfirm={confirm === 'revoke' ? revoke : generate}
        onCancel={() => setConfirm(null)}
        isLoading={busy}
      />
    </section>
  );
};

export default InviteLinkSection;
