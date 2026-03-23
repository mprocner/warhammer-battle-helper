import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
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
  IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';

const GAME_SYSTEMS = [
  { value: 'warhammer4e', label: 'Warhammer Fantasy Roleplay 4e' },
  { value: 'coc7e',       label: 'Call of Cthulhu 7e' },
];

const GameLobby = ({ onJoinGame, token, userEmail }) => {
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

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipHideTimeout.current);
    const rect = el.getBoundingClientRect();
    setTooltip({ top: rect.top + rect.height / 2, left: rect.left, text });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipHideTimeout.current = setTimeout(() => setTooltip(null), 100);
  }, []);

  // Fetch games visible to the current user
  const fetchGames = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games`, {
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });
      if (!response.ok) throw new Error('Failed to fetch games');
      const data = await response.json();
      setGames(data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    fetchGames();
    // Refresh games list every 5 seconds
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, [fetchGames]);

  // Create new game
  const handleCreateGame = async () => {
    if (!newGameName.trim()) {
      setError(t('validation.gameNameRequired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${getApiUrl()}/games`, {
        method: 'POST',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify({ name: newGameName, gameSystem: newGameSystem })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create game');
      }

      const game = await response.json();
      setOpenCreateDialog(false);
      setNewGameName('');
      setNewGameSystem('warhammer4e');

      // Automatically enter the created game (no need to join - already GM)
      onJoinGame(game.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Join existing game
  const handleJoinGame = async (gameId) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/join`, {
        method: 'POST',
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        // If user is already in game, just enter it
        if (errorData.error === 'user already in game') {
          onJoinGame(gameId);
          return;
        }

        throw new Error(errorData.error || 'Failed to join game');
      }

      onJoinGame(gameId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete game (GM only)
  const handleDeleteGame = async () => {
    const { gameId } = confirmDialog;
    setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' });
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}`, {
        method: 'DELETE',
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete game');
      }

      setGames(prev => prev.filter(g => g.id !== gameId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Leave game (player)
  const handleLeaveGame = async () => {
    const { gameId } = confirmDialog;
    setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' });
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/leave`, {
        method: 'POST',
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to leave game');
      }

      setGames(prev => prev.filter(g => g.id !== gameId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openConfirmDialog = (type, gameId, gameName) => {
    setConfirmDialog({ open: true, type, gameId, gameName });
  };

  return (
    <>
    <Container maxWidth="xl">
    <Box sx={{ }}>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 4,
      }}>
        <Typography
          variant="h3"
          sx={{
            fontFamily: 'Cinzel, serif',
            fontWeight: 700,
            color: 'text.primary',
            textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          {t('game.gameRooms')}
        </Typography>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenCreateDialog(true)}
          disabled={loading}
          sx={{
            fontFamily: 'Crimson Text, serif',
            fontSize: '1.1rem',
            fontWeight: 600,
            px: 3,
            py: 1.5
          }}
        >
          {t('game.createNewGame')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {games.length === 0 ? (
          <Grid item xs={12}>
            <Card sx={{
              textAlign: 'center',
              py: 6,
              background: 'rgba(244, 232, 216, 0.6)',
              border: '2px solid',
              borderColor: 'primary.main'
            }}>
              <Typography
                variant="h5"
                sx={{
                  fontFamily: 'Crimson Text, serif',
                  color: 'text.secondary',
                  fontStyle: 'italic'
                }}
              >
                {t('game.noActiveGames')}
              </Typography>
            </Card>
          </Grid>
        ) : (
          games.map((game) => {
            const isGM = game.gameMasterEmail === userEmail;
            return (
              <Grid item xs={12} md={6} lg={4} key={game.id}>
                <Card sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
                  border: '3px solid',
                  borderColor: 'primary.main',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.25)'
                  }
                }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Typography
                        variant="h5"
                        sx={{
                          fontFamily: 'Cinzel, serif',
                          fontWeight: 600,
                          color: 'primary.main',
                          flexGrow: 1
                        }}
                      >
                        {game.name}
                      </Typography>
                      {isGM ? (
                        <IconButton
                          size="small"
                          onClick={() => openConfirmDialog('delete', game.id, game.name)}
                          onMouseEnter={e => showTooltip(t('game.deleteGame'), e.currentTarget)}
                          onMouseLeave={hideTooltip}
                          sx={{ color: 'error.main', ml: 1 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={() => openConfirmDialog('leave', game.id, game.name)}
                          onMouseEnter={e => showTooltip(t('game.leaveGame'), e.currentTarget)}
                          onMouseLeave={hideTooltip}
                          sx={{ color: 'text.secondary', ml: 1 }}
                        >
                          <ExitToAppIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>

                    <Divider sx={{ my: 1.5, borderColor: 'primary.light' }} />

                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <PersonIcon sx={{ mr: 1, color: 'secondary.main', fontSize: '1.2rem' }} />
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'Crimson Text, serif',
                          fontSize: '1rem'
                        }}
                      >
                        <strong>{t('game.gameMaster')}:</strong> {game.gameMasterEmail || t('common.unknown')}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <PeopleIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1.2rem' }} />
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'Crimson Text, serif',
                          fontSize: '1rem'
                        }}
                      >
                        <strong>{t('game.players')}:</strong> {game.participants?.filter(p => p.role !== 'gm').length || 0}
                      </Typography>
                    </Box>

                    <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip
                        label={game.status === 'active' ? t('game.active') : game.status}
                        color={game.status === 'active' ? 'success' : 'default'}
                        size="small"
                        sx={{
                          fontFamily: 'Crimson Text, serif',
                          textTransform: 'uppercase',
                          fontWeight: 600
                        }}
                      />
                      {game.gameSystem && (
                        <Chip
                          label={GAME_SYSTEMS.find(s => s.value === game.gameSystem)?.label || game.gameSystem}
                          variant="outlined"
                          size="small"
                          sx={{ fontFamily: 'Crimson Text, serif' }}
                        />
                      )}
                    </Box>
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => handleJoinGame(game.id)}
                      disabled={loading}
                      sx={{
                        fontFamily: 'Crimson Text, serif',
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        py: 1
                      }}
                    >
                      {t('game.enterGame')}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>

      {/* Create Game Dialog */}
      <Dialog
        open={openCreateDialog}
        onClose={() => !loading && setOpenCreateDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
            border: '3px solid',
            borderColor: 'primary.main'
          }
        }}
      >
        <DialogTitle sx={{
          fontFamily: 'Cinzel, serif',
          fontWeight: 700,
          fontSize: '1.8rem',
          color: 'primary.main'
        }}>
          {t('game.createNewGame')}
        </DialogTitle>

        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('game.gameName')}
            fullWidth
            variant="outlined"
            value={newGameName}
            onChange={(e) => setNewGameName(e.target.value)}
            disabled={loading}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleCreateGame();
              }
            }}
            sx={{
              mt: 2,
              '& .MuiInputBase-input': {
                fontFamily: 'Crimson Text, serif',
                fontSize: '1.1rem'
              },
              '& .MuiInputLabel-root': {
                fontFamily: 'Crimson Text, serif',
                fontSize: '1.1rem'
              }
            }}
          />

          <FormControl fullWidth variant="outlined" sx={{ mt: 2 }} disabled={loading}>
            <InputLabel sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>
              {t('game.gameSystem')}
            </InputLabel>
            <Select
              value={newGameSystem}
              onChange={(e) => setNewGameSystem(e.target.value)}
              label={t('game.gameSystem')}
              sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}
            >
              {GAME_SYSTEMS.map(sys => (
                <MenuItem key={sys.value} value={sys.value} sx={{ fontFamily: 'Crimson Text, serif' }}>
                  {sys.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setOpenCreateDialog(false)}
            disabled={loading}
            sx={{ fontFamily: 'Crimson Text, serif' }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreateGame}
            variant="contained"
            disabled={loading || !newGameName.trim()}
            sx={{
              fontFamily: 'Crimson Text, serif',
              fontWeight: 600
            }}
          >
            {loading ? t('common.creating') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete/Leave Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' })}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
            border: '3px solid',
            borderColor: confirmDialog.type === 'delete' ? 'error.main' : 'primary.main'
          }
        }}
      >
        <DialogTitle sx={{
          fontFamily: 'Cinzel, serif',
          fontWeight: 700,
          color: confirmDialog.type === 'delete' ? 'error.main' : 'primary.main'
        }}>
          {confirmDialog.type === 'delete' ? t('game.deleteGame') : t('game.leaveGame')}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem' }}>
            {confirmDialog.type === 'delete'
              ? t('game.deleteGameConfirm', { name: confirmDialog.gameName })
              : t('game.leaveGameConfirm', { name: confirmDialog.gameName })
            }
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setConfirmDialog({ open: false, type: null, gameId: null, gameName: '' })}
            sx={{ fontFamily: 'Crimson Text, serif' }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={confirmDialog.type === 'delete' ? handleDeleteGame : handleLeaveGame}
            variant="contained"
            color={confirmDialog.type === 'delete' ? 'error' : 'primary'}
            sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600 }}
          >
            {confirmDialog.type === 'delete' ? t('common.delete') : t('game.leaveGame')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
    </Container>
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
