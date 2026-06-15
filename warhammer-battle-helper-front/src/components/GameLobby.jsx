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
  CardContent,
  CardActions,
  Container,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
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
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import SyncIcon from '@mui/icons-material/Sync';
import PublicIcon from '@mui/icons-material/Public';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

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

  useEffect(() => {
    fetchGames();
    fetchTemplates();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
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

      <Grid container spacing={3}>
        {games.length === 0 && (
          <Grid item xs={12}>
            <Card sx={{ textAlign: 'center', py: 6, background: 'rgba(244, 232, 216, 0.6)', border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="h5" sx={{ fontFamily: 'Crimson Text, serif', color: 'text.secondary', fontStyle: 'italic' }}>
                {t('game.noActiveGames')}
              </Typography>
            </Card>
          </Grid>
        )}

        {games.map((game) => {
          const isGM = game.gameMasterEmail === userEmail;
          return (
            <Grid item xs={12} md={6} lg={4} key={game.id}>
              <Card sx={{
                height: '100%', display: 'flex', flexDirection: 'column',
                background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
                border: '3px solid', borderColor: 'primary.main',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }
              }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="h5" sx={{ fontFamily: 'Cinzel, serif', fontWeight: 600, color: 'primary.main', flexGrow: 1 }}>
                      {game.name}
                    </Typography>
                    {isGM ? (
                      <IconButton size="small" onClick={() => openConfirmDialog('delete', game.id, game.name)}
                        onMouseEnter={e => showTooltip(t('game.deleteGame'), e.currentTarget)} onMouseLeave={hideTooltip}
                        sx={{ color: 'error.main', ml: 1 }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      <IconButton size="small" onClick={() => openConfirmDialog('leave', game.id, game.name)}
                        onMouseEnter={e => showTooltip(t('game.leaveGame'), e.currentTarget)} onMouseLeave={hideTooltip}
                        sx={{ color: 'text.secondary', ml: 1 }}>
                        <ExitToAppIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                  <Divider sx={{ my: 1.5, borderColor: 'primary.light' }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <PersonIcon sx={{ mr: 1, color: 'secondary.main', fontSize: '1.2rem' }} />
                    <Typography variant="body2" sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1rem' }}>
                      <strong>{t('game.gameMaster')}:</strong> {game.gameMasterEmail || t('common.unknown')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <PeopleIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1.2rem' }} />
                    <Typography variant="body2" sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1rem' }}>
                      <strong>{t('game.players')}:</strong> {game.participants?.filter(p => p.role !== 'gm').length || 0}
                    </Typography>
                  </Box>
                  <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={game.status === 'active' ? t('game.active') : game.status} color={game.status === 'active' ? 'success' : 'default'} size="small"
                      sx={{ fontFamily: 'Crimson Text, serif', textTransform: 'uppercase', fontWeight: 600 }} />
                    {game.gameSystem && (
                      <Chip
                        label={game.gameSystem === 'custom' && game.customSystemTemplate
                          ? game.customSystemTemplate.name
                          : (getSystem(game.gameSystem).label || game.gameSystem)}
                        variant="outlined" size="small" sx={{ fontFamily: 'Crimson Text, serif' }} />
                    )}
                    {isGM && game.gameSystem === 'custom' && (
                      <IconButton
                        size="small"
                        onClick={() => handleSyncTemplate(game.id)}
                        disabled={syncingGameId === game.id}
                        onMouseEnter={e => showTooltip(t('creator.syncTemplate'), e.currentTarget)}
                        onMouseLeave={hideTooltip}
                        sx={{ color: 'primary.light', ml: 'auto' }}
                      >
                        <SyncIcon fontSize="small" sx={{ animation: syncingGameId === game.id ? 'spin 1s linear infinite' : 'none' }} />
                      </IconButton>
                    )}
                  </Box>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button fullWidth variant="contained" onClick={() => handleJoinGame(game.id)} disabled={loading}
                    sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', fontWeight: 600, py: 1 }}>
                    {t('game.enterGame')}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}

        {/* Creator tile — always last */}
        <Grid item xs={12} md={6} lg={4}>
          <Card onClick={() => { fetchTemplates(); setOpenCreatorDialog(true); }}
            sx={{
              height: '100%', minHeight: 180, display: 'flex', flexDirection: 'column',
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
        </Grid>
      </Grid>

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
                <Select value={newGameSystem} onChange={(e) => setNewGameSystem(e.target.value)} label={t('game.gameSystem')}
                  sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>
                  {regularSystems
                    .filter(sys => !allowedSystems || allowedSystems.includes(sys.value))
                    .map(sys => (
                      <MenuItem key={sys.value} value={sys.value} sx={{ fontFamily: 'Crimson Text, serif' }}>{sys.label}</MenuItem>
                    ))}
                </Select>
              </FormControl>

              {/* Creator CTA */}
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
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
        onClose={() => setEditingTemplate(null)}
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
