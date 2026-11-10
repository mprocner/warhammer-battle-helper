import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, IconButton, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import SyncIcon from '@mui/icons-material/Sync';
import ShieldIcon from '@mui/icons-material/Shield';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CheckIcon from '@mui/icons-material/Check';
import { resolveAvatar, resolveDisplayName } from '../../utils/participants';
import { getAvatarUrl } from '../Avatar';
import { systemLabel } from './gameLabels';

// Shared style of the small round player avatars in the tile party row.
const avatarSx = {
  width: 26, height: 26, borderRadius: '50%', ml: '-8px', flex: 'none',
  border: '2px solid var(--c-border-faint)', boxShadow: '0 1px 3px rgb(var(--c-shadow-rgb) / calc(0.25 * var(--shadow-k)))',
  '&:first-of-type': { ml: 0 },
};

// One tarot-card tile in the lobby grid: image zone, status seal, plaque, enter bar.
function GameCard({ game, isGM, loading, syncing, onJoin, onDelete, onLeave, onSync, showTooltip, hideTooltip }) {
  const { t } = useTranslation();

  // Wax-seal look per game status. Icon + tooltip carry the meaning, color alone never does.
  const seal = {
    active:    { bg: 'radial-gradient(circle at 35% 30%, #7fa06a, #46603a 70%)', Icon: ShieldIcon,          label: t('game.active') },
    paused:    { bg: 'radial-gradient(circle at 35% 30%, #e2b878, #a67c52 70%)', Icon: HourglassBottomIcon, label: t('game.paused') },
    completed: { bg: 'radial-gradient(circle at 35% 30%, #a99f8c, #6f6656 70%)', Icon: CheckIcon,           label: t('game.completed') },
  }[game.status] || { bg: 'radial-gradient(circle at 35% 30%, #a99f8c, #6f6656 70%)', Icon: CheckIcon, label: game.status };

  const players = (game.participants || []).filter(p => p.role !== 'gm');

  return (
    <Card sx={{
      position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'linear-gradient(135deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%)',
      border: '3px solid', borderColor: 'primary.main',
      boxShadow: '0 4px 14px rgb(var(--c-leather-dark-rgb) / calc(0.18 * var(--shadow-k)))',
      transition: 'transform 0.18s, box-shadow 0.18s',
      '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 10px 24px rgb(var(--c-leather-dark-rgb) / calc(0.3 * var(--shadow-k)))' },
      // double gold frame, rounded at the top like a tarot card
      '&::before': {
        content: '""', position: 'absolute', inset: '5px', zIndex: 3, pointerEvents: 'none',
        border: '1.5px solid rgb(var(--c-accent-rgb) / 0.55)', borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-xs) var(--radius-xs)',
      },
      ...(game.status === 'completed' && { opacity: 0.62, filter: 'saturate(0.7)' }),
    }}>
      {/* Image zone — game image or dark-leather fallback. Text never sits on the image. */}
      <Box sx={{ position: 'relative', height: 190, flexShrink: 0, m: '8px 8px 0', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', border: '1px solid rgb(var(--c-leather-dark-rgb) / 0.5)', overflow: 'hidden' }}>
        {game.imageUrl ? (
          <Box component="img" src={getAvatarUrl(game.imageUrl)} alt=""
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <Box sx={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 0.5,
            background: 'linear-gradient(135deg, var(--c-dark-bg) 0%, var(--c-dark-bg) 100%)', color: 'var(--c-text-accent)',
          }}>
            <Typography sx={{ fontSize: '2rem', lineHeight: 1 }}>✠</Typography>
            <Typography sx={{ fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: 'calc(0.18em * var(--tracking-k))', textTransform: 'uppercase', opacity: 0.8, px: 1, textAlign: 'center' }}>
              {systemLabel(game, t)}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Action pill on the image corner (icons only) */}
      <Box sx={{ position: 'absolute', top: 14, right: 14, zIndex: 4, display: 'flex', gap: '2px', background: 'rgb(var(--c-shadow-rgb) / 0.45)', borderRadius: 999, px: '4px', py: '2px' }}>
        {isGM ? (
          <IconButton size="small" onClick={() => onDelete(game)}
            onMouseEnter={e => showTooltip(t('game.deleteGame'), e.currentTarget)} onMouseLeave={hideTooltip}
            sx={{ color: 'var(--c-text-on-dark)', p: '3px' }}>
            <DeleteIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={() => onLeave(game)}
            onMouseEnter={e => showTooltip(t('game.leaveGame'), e.currentTarget)} onMouseLeave={hideTooltip}
            sx={{ color: 'var(--c-text-on-dark)', p: '3px' }}>
            <ExitToAppIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        )}
      </Box>

      {/* Wax seal with the game status, hanging off the image edge */}
      <Box role="img" aria-label={seal.label}
        onMouseEnter={e => showTooltip(seal.label, e.currentTarget)} onMouseLeave={hideTooltip}
        sx={{
          position: 'absolute', top: 180, right: 16, zIndex: 4,
          width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center',
          color: 'rgb(var(--c-highlight-rgb) / 0.92)', background: seal.bg,
          border: '1px solid rgb(var(--c-shadow-rgb) / 0.2)',
          boxShadow: 'inset 0 2px 4px rgb(var(--c-highlight-rgb) / calc(0.4 * var(--shadow-k))), inset 0 -3px 5px rgb(var(--c-shadow-rgb) / calc(0.35 * var(--shadow-k))), 0 3px 6px rgb(var(--c-shadow-rgb) / calc(0.35 * var(--shadow-k)))',
        }}>
        <seal.Icon sx={{ fontSize: '1.05rem' }} />
      </Box>

      {/* Plaque */}
      <Box sx={{ p: '14px 14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1, zIndex: 2 }}>
        <Typography noWrap
          onMouseEnter={e => { if (e.currentTarget.scrollWidth > e.currentTarget.clientWidth) showTooltip(game.name, e.currentTarget); }}
          onMouseLeave={hideTooltip}
          sx={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.02rem', color: 'primary.dark' }}>
          {game.name}
        </Typography>
        <Typography sx={{ color: 'var(--c-text-accent)', fontSize: '0.8rem', letterSpacing: 'calc(0.4em * var(--tracking-k))', lineHeight: 1 }}>❦ ❦ ❦</Typography>
        <Typography sx={{ fontFamily: 'var(--font-display)', fontSize: '0.66rem', letterSpacing: 'calc(0.14em * var(--tracking-k))', textTransform: 'uppercase', color: 'var(--c-text-accent)' }}>
          {systemLabel(game, t)}
        </Typography>
        <Typography noWrap sx={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontStyle: 'italic', color: 'text.secondary' }}>
          {t('game.gameMaster')}: {game.gameMasterEmail || t('common.unknown')}
        </Typography>
        {game.createdAt && (
          <Typography sx={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--c-text-muted)' }}>
            {new Date(game.createdAt).toLocaleDateString()}
          </Typography>
        )}

        {/* Party row: avatar stack + player count */}
        <Box sx={{ mt: 'auto', pt: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {players.slice(0, 3).map((p) => {
              const url = getAvatarUrl(resolveAvatar(p));
              const name = resolveDisplayName(p);
              return url ? (
                <Box key={p.userId} component="img" src={url} alt={name}
                  onMouseEnter={e => showTooltip(name, e.currentTarget)} onMouseLeave={hideTooltip}
                  sx={{ ...avatarSx, objectFit: 'cover' }} />
              ) : (
                <Box key={p.userId}
                  onMouseEnter={e => showTooltip(name, e.currentTarget)} onMouseLeave={hideTooltip}
                  sx={{ ...avatarSx, display: 'grid', placeItems: 'center', background: 'var(--c-leather-bg)', color: 'var(--c-text-on-dark)', fontFamily: 'var(--font-display)', fontSize: '0.68rem', fontWeight: 700 }}>
                  {(name || '?').charAt(0).toUpperCase()}
                </Box>
              );
            })}
            {players.length > 3 && (
              <Box sx={{ ...avatarSx, display: 'grid', placeItems: 'center', background: 'var(--c-surface-alt)', color: 'text.secondary', border: '2px solid var(--c-border-strong)', fontFamily: 'var(--font-display)', fontSize: '0.62rem', fontWeight: 700 }}>
                +{players.length - 3}
              </Box>
            )}
          </Box>
          <Typography sx={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'text.secondary' }}>
            {t('game.players')}: {players.length}
          </Typography>
        </Box>
      </Box>

      {/* Template update bar — GM only, and only when the source template moved past the game's copy */}
      {isGM && game.templateUpdateAvailable && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
          borderTop: '1px solid var(--c-border-accent)', background: 'linear-gradient(180deg, var(--c-surface-alt) 0%, var(--c-accent-bg-light) 100%)',
        }}>
          <SyncIcon sx={{ fontSize: '1rem', color: 'var(--c-label)', animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          <Typography sx={{ flexGrow: 1, fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)' }}>
            {t('game.templateUpdateAvailable')}
          </Typography>
          <Button size="small" variant="outlined" onClick={() => onSync(game)} disabled={syncing}
            sx={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', fontWeight: 700, py: 0.25, minWidth: 0, color: 'var(--c-label)', borderColor: 'var(--c-border-strong)' }}>
            {t('game.syncTemplateAction')}
          </Button>
        </Box>
      )}

      {/* Enter bar flush with the bottom edge */}
      <Button fullWidth onClick={() => onJoin(game.id)} disabled={loading} disableElevation
        sx={{
          mt: 'auto', borderRadius: 0, border: 0, borderTop: '2px solid var(--c-border-dark)',
          background: 'linear-gradient(180deg, var(--c-leather-bg) 0%, var(--c-leather-bg) 100%)', color: 'var(--c-text-on-dark)',
          fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 'calc(0.07em * var(--tracking-k))', py: 1,
          '&:hover': { border: 0, borderTop: '2px solid var(--c-border-dark)', background: 'linear-gradient(180deg, var(--c-accent-bg-dark) 0%, var(--c-leather-bg) 100%)' },
        }}>
        {t('game.enterGame')} →
      </Button>
    </Card>
  );
}

export default GameCard;
