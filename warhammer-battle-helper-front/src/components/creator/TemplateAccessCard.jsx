import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Button, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Select, Switch,
  TextField, Typography,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import ShareIcon from '@mui/icons-material/Share';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import ConfirmModal from '../common/ConfirmModal';

const ROLES = ['viewer', 'editor', 'owner'];
const FONT = { fontFamily: 'Crimson Text, serif' };

// memberErrorKey maps a failed member/visibility response onto an i18n key. Status alone is not
// enough: 400 means "your own address", "last owner" or gin's email validator (whose text is
// validator-internal, not a sentinel), and 404 means "no such account" or "template gone". The
// body's `error` is read first; status is the fallback once the known sentinels are ruled out.
export async function memberErrorKey(res) {
  let message = null;
  try {
    const body = await res.json();
    message = typeof body?.error === 'string' ? body.error : null;
  } catch { /* no parseable body: fall through to the status-based fallback */ }

  if (message === 'cannot share with yourself') return 'creator.general.shareErrorSelf';
  if (message === 'user not found') return 'creator.general.shareErrorNotFound';
  if (message === 'template must keep at least one owner') return 'creator.general.memberErrorLastOwner';
  if (res.status === 400 && message !== 'invalid role') return 'creator.general.shareErrorInvalid';
  return 'creator.general.shareErrorFailed';
}

// The creator's access card: public switch plus the member list with roles. Rendered only for a
// viewer whose permissions include share. Member writes are deliberately NOT optimistic: the
// server resolves addresses and enforces the last-owner rule, so every endpoint answers with the
// whole list and the card adopts it.
export default function TemplateAccessCard({ template, token, onTemplateUpdated, onLeft }) {
  const { t } = useTranslation();
  const [isPublic, setIsPublic] = useState(!!template.isPublic);
  const [members, setMembers] = useState(template.members || []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const base = `${getApiUrl()}/templates/${template.id}`;
  const headers = (json) => getApiHeaders({
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });

  // Runs one member request and adopts the list it answers with.
  const membersRequest = async (path, method, body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}${path}`, {
        method, headers: headers(!!body), ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) { setError(t(await memberErrorKey(res))); return false; }
      const list = await res.json();
      // An owner who demotes or removes themselves (other owners remain) gets an empty list back,
      // because the caller no longer has the share permission. Showing it would leave an empty
      // card, so re-fetch the template and let the builder re-evaluate its share gate.
      if (!list.some(m => m.isMe)) {
        const fresh = await fetch(base, { headers: headers(false) });
        if (!fresh.ok) { setError(t(await memberErrorKey(fresh))); return false; }
        onTemplateUpdated?.(await fresh.json());
        return true;
      }
      setMembers(list);
      return true;
    } catch {
      setError(t('creator.general.shareErrorFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    if (await membersRequest('/members', 'POST', { email: trimmed, role })) setEmail('');
  };

  const handleVisibility = async (value) => {
    setIsPublic(value);
    setError(null);
    try {
      const res = await fetch(`${base}/visibility`, { method: 'PATCH', headers: headers(true), body: JSON.stringify({ isPublic: value }) });
      if (!res.ok) throw new Error('visibility');
      onTemplateUpdated?.(await res.json());
    } catch {
      setIsPublic(!value);
      setError(t('creator.general.visibilityError'));
    }
  };

  const handleLeave = async () => {
    setConfirmLeave(false);
    setError(null);
    try {
      const res = await fetch(`${base}/membership`, { method: 'DELETE', headers: headers(false) });
      if (!res.ok) { setError(t(await memberErrorKey(res))); return; }
      onLeft?.();
    } catch {
      setError(t('creator.general.shareErrorFailed'));
    }
  };

  return (
    <div className="creator__settings-card creator__settings-card--visibility">
      <div className="creator__settings-card-header">
        <span className="creator__settings-card-title">{t('creator.general.visibilityTitle')}</span>
        <span className="creator__settings-card-hint">{t('creator.general.visibilityHint')}</span>
      </div>
      <div className="creator__settings-card-body">
        <FormControlLabel
          control={<Switch checked={isPublic} onChange={e => handleVisibility(e.target.checked)} />}
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {isPublic
                ? <PublicIcon sx={{ fontSize: 18, color: '#c9975b' }} />
                : <LockIcon sx={{ fontSize: 18, color: '#7a5c42' }} />}
              <Typography sx={{ ...FONT, fontSize: '0.95rem', color: '#3a2f1f' }}>
                {t('creator.general.makePublic')}
              </Typography>
            </Box>
          }
        />
        <Typography sx={{ ...FONT, fontSize: '0.85rem', color: 'text.secondary', mt: 0.5, ml: 0.5 }}>
          {isPublic ? t('creator.general.publicDesc') : t('creator.general.privateDesc')}
        </Typography>

        <div className="creator__share">
          <div className="creator__share-title">{t('creator.general.shareTitle')}</div>
          <div className="creator__share-hint">{t('creator.general.shareHint')}</div>
          {isPublic && <div className="creator__share-note">{t('creator.general.sharePublicNote')}</div>}

          <div className="creator__share-row">
            <TextField
              size="small"
              type="email"
              label={t('creator.general.shareEmailLabel')}
              value={email}
              error={Boolean(error)}
              helperText={error || ' '}
              disabled={busy}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              sx={{ flex: 1, '& .MuiInputBase-input': FONT, '& .MuiInputLabel-root': FONT }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="creator-share-role" sx={FONT}>{t('creator.general.shareRoleLabel')}</InputLabel>
              <Select
                labelId="creator-share-role"
                label={t('creator.general.shareRoleLabel')}
                value={role}
                disabled={busy}
                onChange={e => setRole(e.target.value)}
                sx={FONT}
              >
                {ROLES.map(r => <MenuItem key={r} value={r} sx={FONT}>{t(`creator.roles.${r}`)}</MenuItem>)}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<ShareIcon />}
              disabled={busy || !email.trim()}
              onClick={handleAdd}
              sx={{ ...FONT, fontWeight: 600, flexShrink: 0, height: 40 }}
            >
              {t('creator.general.shareButton')}
            </Button>
          </div>

          <ul className="creator__share-list">
            {members.map(m => (
              <li key={m.userId} className="creator__share-item">
                <PersonIcon sx={{ fontSize: 18, color: '#c9975b' }} />
                <span className="creator__share-email">
                  {m.email}
                  {m.isMe && <span className="creator__share-you"> {t('creator.general.memberYou')}</span>}
                </span>
                <Select
                  size="small"
                  value={m.role}
                  disabled={busy}
                  // SelectDisplayProps, not inputProps: the clickable element is the display div;
                  // inputProps would label the hidden native input nobody interacts with.
                  SelectDisplayProps={{ 'aria-label': t('creator.general.shareRoleOf', { email: m.email }) }}
                  onChange={e => membersRequest(`/members/${m.userId}`, 'PATCH', { role: e.target.value })}
                  sx={{ ...FONT, minWidth: 120, '& .MuiSelect-select': { py: 0.5 } }}
                >
                  {ROLES.map(r => <MenuItem key={r} value={r} sx={FONT}>{t(`creator.roles.${r}`)}</MenuItem>)}
                </Select>
                {m.isMe ? (
                  <IconButton
                    size="small"
                    aria-label={t('creator.leaveTemplate')}
                    onClick={() => setConfirmLeave(true)}
                    sx={{ color: '#b57a5a', '&:hover': { color: '#8b3a2a', backgroundColor: 'rgba(180, 60, 40, 0.1)' } }}
                  >
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                ) : (
                  <IconButton
                    size="small"
                    aria-label={t('creator.general.shareRemove')}
                    onClick={() => membersRequest(`/members/${m.userId}`, 'DELETE')}
                    sx={{ color: '#b57a5a', '&:hover': { color: '#8b3a2a', backgroundColor: 'rgba(180, 60, 40, 0.1)' } }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmLeave}
        message={t('creator.leaveTemplateConfirm', { name: template.name })}
        confirmLabel={t('creator.leaveTemplate')}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
