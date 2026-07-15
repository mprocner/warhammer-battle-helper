import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { getSystem, listSystems } from '../systems/registry';
import TemplateBuilder from './creator/TemplateBuilder';
import {
  Box,
  Button,
  Card,
  Container,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Divider,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import SyncIcon from '@mui/icons-material/Sync';
import PublicIcon from '@mui/icons-material/Public';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShieldIcon from '@mui/icons-material/Shield';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CheckIcon from '@mui/icons-material/Check';
import { resolveAvatar, resolveDisplayName } from '../utils/participants';
import { getAvatarUrl } from './Avatar';

const GameLobby = ({ onJoinGame, token, userEmail, allowedSystems }) => {
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameSystem, setNewGameSystem] = useState('warhammer4e');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, gameId: null, gameName: '' });
  const [tooltip, setTooltip] = useState(null);
  const tooltipHideTimeout = useRef(null);

  // Creator / template state
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [openCreatorDialog, setOpenCreatorDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [syncingGameId, setSyncingGameId] = useState(null);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipHideTimeout.current);
    const rect = el.getBoundingClientRect();
    setTooltip({ top: rect.top + rect.height / 2, left: rect.left, text });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipHideTimeout.current = setTimeout(() => setTooltip(null), 100);
  }, []);

  const fetchGames = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games`, {
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
      });
      if (!response.ok) throw new Error('Failed to fetch games');
      setGames((await response.json()) || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/templates`, {
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
      });
      if (!response.ok) return;
      setTemplates((await response.json()) || []);
    } catch { /* non-critical */ }
  }, [token]);

  // The list changes rarely — a single fetch on mount is enough (F5 refreshes it),
  // and every lobby action (create/delete/leave/sync) updates state itself.
  useEffect(() => {
    fetchGames();
    fetchTemplates();
  }, [fetchGames, fetchTemplates]);

  const handleCreateGame = async () => {
    if (!newGameName.trim()) {
      setError(t('validation.gameNameRequired'));
      return;
    }
    if (newGameSystem === 'custom' && !selectedTemplate) {
      setError(t('creator.selectTemplate'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const body = { name: newGameName, gameSystem: newGameSystem };
      if (newGameSystem === 'custom') body.customTemplateId = selectedTemplate.id;

      const response = await fetch(`${getApiUrl()}/games`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create game');
      }

      const game = await response.json();
      setOpenCreateDialog(false);
      setNewGameName('');
      setNewGameSystem('warhammer4e');
      setSelectedTemplate(null);
      onJoinGame(game.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (gameId) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/join`, {
        method: 'POST',
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
      });
      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'user already in game') { onJoinGame(gameId); return; }
        throw new Error(errorData.error || 'Failed to join game');
      }
      onJoinGame(gameId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGame = async () => {
    const { gameId } = confirmDialog;
    setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' });
    setLoading(true);
    try {
      await fetch(`${getApiUrl()}/games/${gameId}`, {
        method: 'DELETE',
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
      });
      setGames(prev => prev.filter(g => g.id !== gameId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGame = async () => {
    const { gameId } = confirmDialog;
    setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' });
    setLoading(true);
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/leave`, {
        method: 'POST',
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
      });
      setGames(prev => prev.filter(g => g.id !== gameId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setCreatingTemplate(true);
    try {
      const response = await fetch(`${getApiUrl()}/templates`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ name: newTemplateName, fields: [] })
      });
      if (!response.ok) throw new Error('Failed to create template');
      const t = await response.json();
      setTemplates(prev => [t, ...prev]);
      setNewTemplateName('');
    } catch { /* ignore */ } finally {
      setCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      await fetch(`${getApiUrl()}/templates/${templateId}`, {
        method: 'DELETE',
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
      });
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
        setNewGameSystem('warhammer4e');
      }
    } catch { /* ignore */ } finally {
      setConfirmDeleteTemplate(null);
    }
  };

  const handleCloneTemplate = async (tmpl) => {
    try {
      const res = await fetch(`${getApiUrl()}/templates/${tmpl.id}/clone`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ name: `${tmpl.name} ${t('creator.copySuffix')}` }),
      });
      if (!res.ok) throw new Error('clone failed');
      const clone = await res.json();
      setTemplates(prev => [clone, ...prev]);
    } catch { /* ignore */ }
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setNewGameSystem('custom');
    setOpenCreatorDialog(false);
    setOpenCreateDialog(true);
  };

  const handleSyncTemplate = async (gameId) => {
    setSyncingGameId(gameId);
    try {
      const res = await fetch(`${getApiUrl()}/games/${gameId}/syncTemplate`, {
        method: 'POST',
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t('creator.syncFailed'));
        return;
      }
      await fetchGames();
    } catch {
      setError(t('creator.syncFailed'));
    } finally {
      setSyncingGameId(null);
    }
  };

  const openConfirmDialog = (type, gameId, gameName) => {
    setConfirmDialog({ open: true, type, gameId, gameName });
  };

  // Systems shown in the regular dropdown — "custom" is handled via the creator CTA
  const regularSystems = listSystems().filter(s => s.value !== 'custom');

  // Wax-seal look per game status (tarot-card tile). Icon + tooltip carry the meaning,
  // color alone never does.
  const statusSeal = (status) => ({
    active:    { bg: 'radial-gradient(circle at 35% 30%, #7fa06a, #46603a 70%)', Icon: ShieldIcon,          label: t('game.active') },
    paused:    { bg: 'radial-gradient(circle at 35% 30%, #e2b878, #a67c52 70%)', Icon: HourglassBottomIcon, label: t('game.paused') },
    completed: { bg: 'radial-gradient(circle at 35% 30%, #a99f8c, #6f6656 70%)', Icon: CheckIcon,           label: t('game.completed') },
  }[status] || { bg: 'radial-gradient(circle at 35% 30%, #a99f8c, #6f6656 70%)', Icon: CheckIcon, label: status });

  const systemLabel = (game) => game.gameSystem === 'custom' && game.customSystemTemplate
    ? game.customSystemTemplate.name
    : (getSystem(game.gameSystem).label || game.gameSystem);

  // Shared style of the small round player avatars in the tile party row
  const avatarSx = {
    width: 26, height: 26, borderRadius: '50%', ml: '-8px', flex: 'none',
    border: '2px solid #f4e8d8', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    '&:first-of-type': { ml: 0 },
  };

  return (
    <>
    <Container maxWidth="xl">
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h3" sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: 'text.primary', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
          {t('game.gameRooms')}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenCreateDialog(true)} disabled={loading}
          sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', fontWeight: 600, px: 3, py: 1.5 }}>
          {t('game.createNewGame')}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: 2.5, alignItems: 'stretch' }}>
        {games.length === 0 && (
          <Card sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 6, background: 'rgba(244, 232, 216, 0.6)', border: '2px solid', borderColor: 'primary.main' }}>
            <Typography variant="h5" sx={{ fontFamily: 'Crimson Text, serif', color: 'text.secondary', fontStyle: 'italic' }}>
              {t('game.noActiveGames')}
            </Typography>
          </Card>
        )}

        {games.map((game) => {
          const isGM = game.gameMasterEmail === userEmail;
          const seal = statusSeal(game.status);
          const players = (game.participants || []).filter(p => p.role !== 'gm');
          return (
            <Card key={game.id} sx={{
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
                  <IconButton size="small" onClick={() => handleSyncTemplate(game.id)} disabled={syncingGameId === game.id}
                    onMouseEnter={e => showTooltip(t('creator.syncTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                    sx={{ color: '#f4e8d8', p: '3px' }}>
                    <SyncIcon sx={{ fontSize: '1rem', animation: syncingGameId === game.id ? 'spin 1s linear infinite' : 'none' }} />
                  </IconButton>
                )}
                {isGM ? (
                  <IconButton size="small" onClick={() => openConfirmDialog('delete', game.id, game.name)}
                    onMouseEnter={e => showTooltip(t('game.deleteGame'), e.currentTarget)} onMouseLeave={hideTooltip}
                    sx={{ color: '#f4e8d8', p: '3px' }}>
                    <DeleteIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                ) : (
                  <IconButton size="small" onClick={() => openConfirmDialog('leave', game.id, game.name)}
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
              <Button fullWidth onClick={() => handleJoinGame(game.id)} disabled={loading} disableElevation
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
        })}

        {/* Creator tile — always last */}
        <Card onClick={() => { fetchTemplates(); setOpenCreatorDialog(true); }}
          sx={{
            minHeight: 220, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            background: 'rgba(244, 232, 216, 0.3)',
            border: '2px dashed', borderColor: 'primary.light',
            boxShadow: 'none', cursor: 'pointer', transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', background: 'rgba(244, 232, 216, 0.6)', transform: 'translateY(-2px)' }
          }}>
          <TuneIcon sx={{ fontSize: 40, color: 'primary.light', mb: 1 }} />
          <Typography variant="h6" sx={{ fontFamily: 'Cinzel, serif', fontWeight: 600, color: 'primary.main', textAlign: 'center' }}>
            {t('creator.tileTitle')}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'Crimson Text, serif', color: 'text.secondary', mt: 0.5, textAlign: 'center', px: 2 }}>
            {t('creator.tileDesc')}
          </Typography>
        </Card>
      </Box>

      {/* Create Game Dialog */}
      <Dialog open={openCreateDialog} onClose={() => !loading && setOpenCreateDialog(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)', border: '3px solid', borderColor: 'primary.main' } }}>
        <DialogTitle sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: '1.8rem', color: 'primary.main' }}>
          {t('game.createNewGame')}
        </DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" label={t('game.gameName')} fullWidth variant="outlined"
            value={newGameName} onChange={(e) => setNewGameName(e.target.value)} disabled={loading}
            onKeyPress={(e) => { if (e.key === 'Enter' && !loading) handleCreateGame(); }}
            sx={{ mt: 2, '& .MuiInputBase-input': { fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }, '& .MuiInputLabel-root': { fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' } }} />

          {newGameSystem !== 'custom' ? (
            <>
              <FormControl fullWidth variant="outlined" sx={{ mt: 2 }} disabled={loading}>
                <InputLabel sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>{t('game.gameSystem')}</InputLabel>
                <Select
                  value={newGameSystem}
                  onChange={(e) => setNewGameSystem(e.target.value)}
                  label={t('game.gameSystem')}
                  sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>
                  {regularSystems
                    .filter(sys => !allowedSystems || allowedSystems.includes(sys.value))
                    .map(sys => (
                      <MenuItem key={sys.value} value={sys.value} sx={{ fontFamily: 'Crimson Text, serif' }}>{sys.label}</MenuItem>
                    ))}
                </Select>
              </FormControl>

              {/* Creator CTA — token display is configured later from inside the game. */}
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontFamily: 'Crimson Text, serif', color: 'text.secondary', fontSize: '0.95rem' }}>
                  {t('creator.noSystemPrompt')}
                </Typography>
                <Button size="small" variant="text" onClick={() => { fetchTemplates(); setOpenCreatorDialog(true); }}
                  sx={{ fontFamily: 'Crimson Text, serif', textTransform: 'none', fontSize: '0.95rem', p: 0, minWidth: 0, color: 'primary.main', fontWeight: 600,
                    '&:hover': { textDecoration: 'underline', background: 'none' } }}>
                  {t('creator.designYours')}
                </Button>
              </Box>
            </>
          ) : (
            /* Custom system — show selected template */
            <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'success.main', borderRadius: 1, background: 'rgba(76,175,80,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600, color: 'success.dark' }}>
                  {t('creator.selectedTemplate')}: {selectedTemplate?.name}
                </Typography>
              </Box>
              <Button size="small" onClick={() => { setSelectedTemplate(null); setNewGameSystem('warhammer4e'); }}
                sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.8rem', color: 'text.secondary', textTransform: 'none', minWidth: 0, p: '2px 6px' }}>
                {t('common.change')}
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => { setOpenCreateDialog(false); setSelectedTemplate(null); setNewGameSystem('warhammer4e'); }} disabled={loading}
            sx={{ fontFamily: 'Crimson Text, serif' }}>{t('common.cancel')}</Button>
          <Button onClick={handleCreateGame} variant="contained" disabled={loading || !newGameName.trim()}
            sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600 }}>
            {loading ? t('common.creating') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Creator / Template Manager Dialog */}
      <Dialog open={openCreatorDialog} onClose={() => setOpenCreatorDialog(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)', border: '3px solid', borderColor: 'primary.main' } }}>
        <DialogTitle sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: '1.6rem', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon /> {t('creator.myTemplates')}
        </DialogTitle>
        <DialogContent>
          {/* Create new template */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField fullWidth size="small" label={t('creator.templateName')} value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)} disabled={creatingTemplate}
              onKeyPress={(e) => { if (e.key === 'Enter' && newTemplateName.trim()) handleCreateTemplate(); }}
              sx={{ '& .MuiInputBase-input': { fontFamily: 'Crimson Text, serif' }, '& .MuiInputLabel-root': { fontFamily: 'Crimson Text, serif' } }} />
            <Button variant="contained" onClick={handleCreateTemplate} disabled={creatingTemplate || !newTemplateName.trim()} startIcon={<AddIcon />}
              sx={{ fontFamily: 'Crimson Text, serif', whiteSpace: 'nowrap', fontWeight: 600 }}>
              {t('creator.newTemplate')}
            </Button>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {templates.length === 0 ? (
            <Typography sx={{ fontFamily: 'Crimson Text, serif', color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 2 }}>
              {t('creator.noTemplates')}
            </Typography>
          ) : (
            <List dense>
              {templates.map(tmpl => (
                <ListItem key={tmpl.id} disablePadding
                  sx={{ borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: 'primary.light',
                    background: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.7)' } }}
                  onClick={() => handleSelectTemplate(tmpl)}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5 }}>
                        <Typography sx={{ fontFamily: 'Cinzel, serif', fontWeight: 600, fontSize: '0.95rem', color: 'primary.main' }}>{tmpl.name}</Typography>
                        {tmpl.isPublic && (
                          <Chip icon={<PublicIcon sx={{ fontSize: '0.9rem !important' }} />} label={t('creator.publicBadge')} size="small"
                            sx={{ height: 20, fontFamily: 'Crimson Text, serif', fontSize: '0.7rem', color: 'primary.main', borderColor: 'primary.light' }}
                            variant="outlined" />
                        )}
                      </Box>
                    }
                    secondary={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary', px: 1.5, pb: 0.5 }}>
                      v{tmpl.version} · {tmpl.fields?.length || 0} {t('creator.fields')}{!tmpl.isOwner && ` · ${t('creator.sharedTemplate')}`}
                    </Typography>}
                  />
                  <ListItemSecondaryAction>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCloneTemplate(tmpl); }}
                      onMouseEnter={e => showTooltip(t('creator.cloneTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                      sx={{ color: 'primary.main', mr: 0.5 }}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                    {tmpl.isOwner && (
                      <>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditingTemplate(tmpl); setOpenCreatorDialog(false); }}
                          onMouseEnter={e => showTooltip(t('creator.editTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                          sx={{ color: 'primary.main', mr: 0.5 }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setConfirmDeleteTemplate(tmpl); }}
                          sx={{ color: 'error.light' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setOpenCreatorDialog(false)} sx={{ fontFamily: 'Crimson Text, serif' }}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete/Leave Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' })}
        maxWidth="xs" fullWidth
        PaperProps={{ sx: { background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)', border: '3px solid', borderColor: confirmDialog.type === 'delete' ? 'error.main' : 'primary.main' } }}>
        <DialogTitle sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: confirmDialog.type === 'delete' ? 'error.main' : 'primary.main' }}>
          {confirmDialog.type === 'delete' ? t('game.deleteGame') : t('game.leaveGame')}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>
            {confirmDialog.type === 'delete' ? t('game.deleteGameConfirm', { name: confirmDialog.gameName }) : t('game.leaveGameConfirm', { name: confirmDialog.gameName })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' })} sx={{ fontFamily: 'Crimson Text, serif' }}>{t('common.cancel')}</Button>
          <Button onClick={confirmDialog.type === 'delete' ? handleDeleteGame : handleLeaveGame} variant="contained"
            color={confirmDialog.type === 'delete' ? 'error' : 'primary'} sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600 }}>
            {confirmDialog.type === 'delete' ? t('common.delete') : t('game.leaveGame')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Template Dialog */}
      <Dialog open={!!confirmDeleteTemplate} onClose={() => setConfirmDeleteTemplate(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)', border: '3px solid', borderColor: 'error.main' } }}>
        <DialogTitle sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: 'error.main' }}>{t('common.delete')}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>
            {t('creator.deleteConfirm', { name: confirmDeleteTemplate?.name })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setConfirmDeleteTemplate(null)} sx={{ fontFamily: 'Crimson Text, serif' }}>{t('common.cancel')}</Button>
          <Button onClick={() => handleDeleteTemplate(confirmDeleteTemplate.id)} variant="contained" color="error"
            sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600 }}>{t('common.delete')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
    </Container>

    {editingTemplate && (
      <TemplateBuilder
        template={editingTemplate}
        token={token}
        onClose={() => {
          setEditingTemplate(null);
          fetchTemplates();
        }}
        onTemplateUpdated={(updated) => {
          if (!updated?.id) return;
          setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
          setEditingTemplate(updated);
        }}
      />
    )}

    {tooltip && createPortal(
      <div className="portal-tooltip" style={{ top: tooltip.top, left: tooltip.left }}>
        {tooltip.text}
        <div className="portal-tooltip__arrow" />
      </div>,
      document.body
    )}
    </>
  );
};

export default GameLobby;
