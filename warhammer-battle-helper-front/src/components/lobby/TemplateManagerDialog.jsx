import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  IconButton, List, ListItem, ListItemText, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PublicIcon from '@mui/icons-material/Public';
import { usePortalTooltip } from '../common/PortalTooltip';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';

// Fields live inside sections — the template itself carries no flat field list.
const countFields = (tpl) =>
  (tpl.sections || []).reduce((total, section) => total + (section.fields?.length || 0), 0);

// Manages custom system templates. Rows are deliberately NOT clickable: a template affords
// three equal actions (edit, clone, delete) and which ones apply depends on ownership, so a
// row-wide click would mean different things on different rows. Every action is an explicit,
// always-visible icon instead.
function TemplateManagerDialog({ open, templates, onClose, onCreateTemplate, onEditTemplate, onCloneTemplate, onDeleteTemplate }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip({ placement: 'left' });
  const [newTemplateName, setNewTemplateName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newTemplateName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateTemplate(newTemplateName.trim());
      setNewTemplateName('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={parchmentDialogProps()}>
        <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.6rem', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon /> {t('creator.myTemplates')}
        </DialogTitle>
        <DialogContent>
          {/* Create new template — the button must never shrink, or its label spills out. */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
            <TextField fullWidth size="small" label={t('creator.templateName')} value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)} disabled={creating}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              sx={{ '& .MuiInputBase-input': { fontFamily: BODY_FONT }, '& .MuiInputLabel-root': { fontFamily: BODY_FONT } }} />
            <Button variant="contained" onClick={handleCreate} disabled={creating || !newTemplateName.trim()} startIcon={<AddIcon />}
              sx={{ fontFamily: BODY_FONT, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', height: 40, px: 2 }}>
              {t('creator.newTemplate')}
            </Button>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {templates.length === 0 ? (
            <Typography sx={{ fontFamily: BODY_FONT, color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 2 }}>
              {t('creator.noTemplates')}
            </Typography>
          ) : (
            <List dense>
              {templates.map(tpl => (
                <ListItem key={tpl.id} disablePadding
                  sx={{ borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: 'primary.light', background: 'rgba(255,255,255,0.4)', pr: 1 }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {tpl.isOwner && (
                        <IconButton size="small" onClick={() => onEditTemplate(tpl)}
                          onMouseEnter={e => showTooltip(t('creator.editTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                          sx={{ color: 'primary.main' }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" onClick={() => onCloneTemplate(tpl)}
                        onMouseEnter={e => showTooltip(t('creator.cloneTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                        sx={{ color: 'primary.main' }}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                      {tpl.isOwner && (
                        <IconButton size="small" onClick={() => onDeleteTemplate(tpl)}
                          onMouseEnter={e => showTooltip(t('creator.deleteTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                          sx={{ color: 'error.light' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  }>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5 }}>
                        <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: '0.95rem', color: 'primary.main' }}>{tpl.name}</Typography>
                        {tpl.isPublic && (
                          <Chip icon={<PublicIcon sx={{ fontSize: '0.9rem !important' }} />} label={t('creator.publicBadge')} size="small"
                            sx={{ height: 20, fontFamily: BODY_FONT, fontSize: '0.7rem', color: 'primary.main', borderColor: 'primary.light' }}
                            variant="outlined" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography sx={{ fontFamily: BODY_FONT, fontSize: '0.85rem', color: 'text.secondary', px: 1.5, pb: 0.5 }}>
                        v{tpl.version} · {countFields(tpl)} {t('creator.fields')}{!tpl.isOwner && ` · ${t('creator.sharedTemplate')}`}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={onClose} sx={{ fontFamily: BODY_FONT }}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
      {tooltipNode}
    </>
  );
}

export default TemplateManagerDialog;
