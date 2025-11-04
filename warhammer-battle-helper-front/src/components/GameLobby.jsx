import React, { useState, useEffect } from 'react';
import { getApiUrl, getApiHeaders } from '../api/axios';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Chip,
  Divider,
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';

const GameLobby = ({ onJoinGame, token }) => {
  const [games, setGames] = useState([]);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch all active games
  const fetchGames = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games`, {
        headers: getApiHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch games');
      const data = await response.json();
      setGames(data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchGames();
    // Refresh games list every 5 seconds
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  // Create new game
  const handleCreateGame = async () => {
    if (!newGameName.trim()) {
      setError('Game name is required');
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
        body: JSON.stringify({ name: newGameName })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create game');
      }

      const game = await response.json();
      setOpenCreateDialog(false);
      setNewGameName('');

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

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 4
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
          Game Rooms
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
          Create New Game
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
                No active games. Create one to start your adventure!
              </Typography>
            </Card>
          </Grid>
        ) : (
          games.map((game) => (
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
                  <Typography
                    variant="h5"
                    gutterBottom
                    sx={{
                      fontFamily: 'Cinzel, serif',
                      fontWeight: 600,
                      color: 'primary.main',
                      mb: 2
                    }}
                  >
                    {game.name}
                  </Typography>

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
                      <strong>Game Master:</strong> {game.participants?.find(p => p.role === 'gm')?.username || 'Unknown'}
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
                      <strong>Players:</strong> {game.participants?.length || 0}
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <Chip
                      label={game.status || 'active'}
                      color={game.status === 'active' ? 'success' : 'default'}
                      size="small"
                      sx={{
                        fontFamily: 'Crimson Text, serif',
                        textTransform: 'uppercase',
                        fontWeight: 600
                      }}
                    />
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
                    Join Game
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))
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
          Create New Game
        </DialogTitle>

        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Game Name"
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
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setOpenCreateDialog(false)}
            disabled={loading}
            sx={{ fontFamily: 'Crimson Text, serif' }}
          >
            Cancel
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
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GameLobby;
