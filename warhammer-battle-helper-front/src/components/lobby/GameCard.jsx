import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, IconButton, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import SyncIcon from '@mui/icons-material/Sync';
import ShieldIcon from '@mui/icons-material/Shield';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CheckIcon from '@mui/icons-material/Check';
import { getSystem } from '../../systems/registry';
import { resolveAvatar, resolveDisplayName } from '../../utils/participants';
import { getAvatarUrl } from '../Avatar';

// Shared style of the small round player avatars in the tile party row.
const avatarSx = {
  width: 26, height: 26, borderRadius: '50%', ml: '-8px', flex: 'none',
  border: '2px solid #f4e8d8', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  '&:first-of-type': { ml: 0 },
};

// A custom game shows its template's name; hardcoded systems show the plugin label.
const systemLabel = (game) => game.gameSystem === 'custom' && game.customSystemTemplate
  ? game.customSystemTemplate.name
  : (getSystem(game.gameSystem).label || game.gameSystem);

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
      background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
      border: '3px solid', borderColor: 'primary.main',
      boxShadow: '0 4px 14px rgba(107,68,35,0.18)',
      transition: 'transform 0.18s, box-shadow 0.18s',
      '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 10px 24px rgba(107,68,35,0.3)' },
      // double gold frame, rounded at the top like a tarot card
      '&::before': {
        content: '""', position: 'absolute', inset: '5px', zIndex: 3, pointerEvents: 'none',
        border: '1.5px solid rgba(201,151,91,0.55)', borderRadius: '10px 10px 2px 2px',
      },
      ...(game.status === 'completed' && { opacity: 0.62, filter: 'saturate(0.7)' }),
    }}>
      {/* Image zone — game image or dark-leather fallback. Text never sits on the image. */}
      <Box sx={{ position: 'relative', height: 190, flexShrink: 0, m: '8px 8px 0', borderRadius: '8px 8px 0 0', border: '1px solid rgba(107,68,35,0.5)', overflow: 'hidden' }}>
        {game.imageUrl ? (
          <Box component="img" src={getAvatarUrl(game.imageUrl)} alt=""
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <Box sx={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 0.5,
            background: 'linear-gradient(135deg, #3a2920 0%, #2a2218 100%)', color: '#c9a961',
          }}>
            <Typography sx={{ fontSize: '2rem', lineHeight: 1 }}>✠</Typography>
            <Typography sx={{ fontFamily: 'Cinzel, serif', fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.8, px: 1, textAlign: 'center' }}>
              {systemLabel(game)}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Action pill on the image corner (icons only) */}
      <Box sx={{ position: 'absolute', top: 14, right: 14, zIndex: 4, display: 'flex', gap: '2px', background: 'rgba(20,12,4,0.45)', borderRadius: 999, px: '4px', py: '2px' }}>
        {isGM && game.gameSystem === 'custom' && (
          <IconButton size="small" onClick={() => onSync(game.id)} disabled={syncing}
            onMouseEnter={e => showTooltip(t('creator.syncTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
            sx={{ color: '#f4e8d8', p: '3px' }}>
            <SyncIcon sx={{ fontSize: '1rem', animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        )}
        {isGM ? (
          <IconButton size="small" onClick={() => onDelete(game)}
            onMouseEnter={e => showTooltip(t('game.deleteGame'), e.currentTarget)} onMouseLeave={hideTooltip}
            sx={{ color: '#f4e8d8', p: '3px' }}>
            <DeleteIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={() => onLeave(game)}
            onMouseEnter={e => showTooltip(t('game.leaveGame'), e.currentTarget)} onMouseLeave={hideTooltip}
            sx={{ color: '#f4e8d8', p: '3px' }}>
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
          color: 'rgba(255,255,255,0.92)', background: seal.bg,
          border: '1px solid rgba(0,0,0,0.2)',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -3px 5px rgba(0,0,0,0.35), 0 3px 6px rgba(0,0,0,0.35)',
        }}>
        <seal.Icon sx={{ fontSize: '1.05rem' }} />
      </Box>

      {/* Plaque */}
      <Box sx={{ p: '14px 14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1, zIndex: 2 }}>
        <Typography noWrap
          onMouseEnter={e => { if (e.currentTarget.scrollWidth > e.currentTarget.clientWidth) showTooltip(game.name, e.currentTarget); }}
          onMouseLeave={hideTooltip}
          sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: '1.02rem', color: 'primary.dark' }}>
          {game.name}
        </Typography>
        <Typography sx={{ color: '#a67c52', fontSize: '0.8rem', letterSpacing: '0.4em', lineHeight: 1 }}>❦ ❦ ❦</Typography>
        <Typography sx={{ fontFamily: 'Cinzel, serif', fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a67c52' }}>
          {systemLabel(game)}
        </Typography>
        <Typography noWrap sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.88rem', fontStyle: 'italic', color: 'text.secondary' }}>
          {t('game.gameMaster')}: {game.gameMasterEmail || t('common.unknown')}
        </Typography>
        {game.createdAt && (
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.8rem', color: '#8a7d6a' }}>
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
                  sx={{ ...avatarSx, display: 'grid', placeItems: 'center', background: '#8b6a4d', color: '#fff', fontFamily: 'Cinzel, serif', fontSize: '0.68rem', fontWeight: 700 }}>
                  {(name || '?').charAt(0).toUpperCase()}
                </Box>
              );
            })}
            {players.length > 3 && (
              <Box sx={{ ...avatarSx, display: 'grid', placeItems: 'center', background: '#e8dcc4', color: 'text.secondary', border: '2px solid #8b6a4d', fontFamily: 'Cinzel, serif', fontSize: '0.62rem', fontWeight: 700 }}>
                +{players.length - 3}
              </Box>
            )}
          </Box>
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary' }}>
            {t('game.players')}: {players.length}
          </Typography>
        </Box>
      </Box>

      {/* Enter bar flush with the bottom edge */}
      <Button fullWidth onClick={() => onJoin(game.id)} disabled={loading} disableElevation
        sx={{
          mt: 'auto', borderRadius: 0, border: 0, borderTop: '2px solid #6b4423',
          background: 'linear-gradient(180deg, #8b6a4d 0%, #7a5c42 100%)', color: '#f4e8d8',
          fontFamily: 'Cinzel, serif', fontWeight: 700, letterSpacing: '0.07em', py: 1,
          '&:hover': { border: 0, borderTop: '2px solid #6b4423', background: 'linear-gradient(180deg, #96755a 0%, #85654a 100%)' },
        }}>
        {t('game.enterGame')} →
      </Button>
    </Card>
  );
}

export default GameCard;
