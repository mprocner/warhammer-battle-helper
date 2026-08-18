import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Card, Container, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useGames } from '../hooks/useGames';
import { useTemplates } from '../hooks/useTemplates';
import { usePortalTooltip } from './common/PortalTooltip';
import TemplateBuilder from './creator/TemplateBuilder';
import GameCard from './lobby/GameCard';
import CreatorTile from './lobby/CreatorTile';
import CreateGameDialog from './lobby/CreateGameDialog';
import TemplateManagerDialog from './lobby/TemplateManagerDialog';
import ConfirmDialog from './lobby/ConfirmDialog';

// The lobby orchestrates three stacked surfaces: the create-game dialog, the template
// manager on top of it, and the full-screen builder on top of that. Each layer stays
// mounted underneath, so closing one always reveals the step the user came from.
const GameLobby = ({ onJoinGame, token, userEmail, allowedSystems }) => {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip({ placement: 'left' });

  const {
    games, error, loading, syncingGameId,
    setError, fetchGames, createGame, deleteGame, leaveGame, syncTemplate,
  } = useGames(token);
  const {
    templates, fetchTemplates, createTemplate, deleteTemplate, cloneTemplate, replaceTemplate,
  } = useTemplates(token);

  const [createOpen, setCreateOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [gamePrompt, setGamePrompt] = useState(null);          // { type: 'delete'|'leave', game }
  const [templatePrompt, setTemplatePrompt] = useState(null);  // template pending deletion

  // The lists change rarely — a single fetch on mount is enough (F5 refreshes them),
  // and every lobby action updates state itself.
  useEffect(() => {
    fetchGames();
    fetchTemplates();
  }, [fetchGames, fetchTemplates]);

  const handleCreateGame = useCallback(async (payload) => {
    const game = await createGame(payload);
    if (!game) return;
    setCreateOpen(false);
    onJoinGame(game.id);
  }, [createGame, onJoinGame]);

  const openManager = useCallback(() => {
    fetchTemplates();
    setManagerOpen(true);
  }, [fetchTemplates]);

  // A fresh template has no fields yet, so the list has nothing to show for it — go
  // straight to the builder. Closing it drops back to the manager.
  const handleCreateTemplate = useCallback(async (name) => {
    const created = await createTemplate(name);
    if (created) setEditingTemplate(created);
  }, [createTemplate]);

  const handleConfirmGamePrompt = useCallback(() => {
    if (!gamePrompt) return;
    const { type, game } = gamePrompt;
    setGamePrompt(null);
    if (type === 'delete') deleteGame(game.id);
    else leaveGame(game.id);
  }, [gamePrompt, deleteGame, leaveGame]);

  const handleConfirmTemplateDelete = useCallback(() => {
    if (!templatePrompt) return;
    deleteTemplate(templatePrompt.id);
    setTemplatePrompt(null);
  }, [templatePrompt, deleteTemplate]);

  return (
    <>
      <Container maxWidth="xl">
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Typography variant="h3" sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: 'text.primary', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
              {t('game.gameRooms')}
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={loading}
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

            {games.map(game => (
              <GameCard
                key={game.id}
                game={game}
                isGM={game.gameMasterEmail === userEmail}
                loading={loading}
                syncing={syncingGameId === game.id}
                onJoin={onJoinGame}
                onSync={syncTemplate}
                onDelete={(g) => setGamePrompt({ type: 'delete', game: g })}
                onLeave={(g) => setGamePrompt({ type: 'leave', game: g })}
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
            ))}

            {/* Creator tile — always last */}
            <CreatorTile onClick={openManager} />
          </Box>
        </Box>
      </Container>

      <CreateGameDialog
        open={createOpen}
        loading={loading}
        templates={templates}
        allowedSystems={allowedSystems}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateGame}
        onOpenCreator={openManager}
      />

      <TemplateManagerDialog
        open={managerOpen}
        templates={templates}
        onClose={() => setManagerOpen(false)}
        onCreateTemplate={handleCreateTemplate}
        onEditTemplate={setEditingTemplate}
        onCloneTemplate={cloneTemplate}
        onDeleteTemplate={setTemplatePrompt}
      />

      <ConfirmDialog
        open={!!gamePrompt}
        danger={gamePrompt?.type === 'delete'}
        title={gamePrompt?.type === 'delete' ? t('game.deleteGame') : t('game.leaveGame')}
        message={gamePrompt?.type === 'delete'
          ? t('game.deleteGameConfirm', { name: gamePrompt?.game?.name })
          : t('game.leaveGameConfirm', { name: gamePrompt?.game?.name })}
        confirmLabel={gamePrompt?.type === 'delete' ? t('common.delete') : t('game.leaveGame')}
        onConfirm={handleConfirmGamePrompt}
        onCancel={() => setGamePrompt(null)}
      />

      <ConfirmDialog
        open={!!templatePrompt}
        danger
        title={t('common.delete')}
        message={t('creator.deleteConfirm', { name: templatePrompt?.name })}
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmTemplateDelete}
        onCancel={() => setTemplatePrompt(null)}
      />

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
            replaceTemplate(updated);
            setEditingTemplate(updated);
          }}
        />
      )}

      {tooltipNode}
    </>
  );
};

export default GameLobby;
