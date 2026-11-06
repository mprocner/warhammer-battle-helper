import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  IconButton, List, ListItem, ListItemText, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PublicIcon from '@mui/icons-material/Public';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { usePortalTooltip } from '../common/PortalTooltip';
import TemplateDescriptionDialog from './TemplateDescriptionDialog';
import TemplateSheetPreview from './TemplateSheetPreview';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';
import { walkFields } from '../../utils/templateSections';

// Fields live inside sections — the template itself carries no flat field list. Sections nest,
// so this has to be the shared depth-first walk: a top-level count would score a subsection as
// one "field" and ignore everything the GM put inside it.
const countFields = (tpl) => {
  let total = 0;
  walkFields(tpl.sections, () => { total += 1; });
  return total;
};

// Manages custom system templates. Rows are deliberately NOT clickable: a template affords
// three equal actions (edit, clone, delete) and which ones apply depends on the viewer's permissions, so a
// row-wide click would mean different things on different rows. Every action is an explicit,
// always-visible icon instead. The ⓘ icon (shown only when a template has a description) opens a
// read-only view; it is not one of the row's actions. The eye opens a read-only preview of the
// character sheet and, unlike ⓘ, is shown for every template.
function TemplateManagerDialog({ open, templates, onClose, onCreateTemplate, onEditTemplate, onCloneTemplate, onDeleteTemplate, onLeaveTemplate }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip({ placement: 'left' });
  const [newTemplateName, setNewTemplateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [describing, setDescribing] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  // The dialog stays mounted while closed, so without this a reopen would show the old sheet.
  useEffect(() => {
    if (!open) setPreviewing(null);
  }, [open]);

  // A template deleted or left while its sheet is open must not stay previewed.
  useEffect(() => {
    if (previewing && !templates.some(tpl => tpl.id === previewing.id)) setPreviewing(null);
  }, [templates, previewing]);

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
                      <IconButton size="small" onClick={() => setPreviewing(tpl)}
                        onMouseEnter={e => showTooltip(t('creator.previewSheet'), e.currentTarget)} onMouseLeave={hideTooltip}
                        sx={{ color: 'primary.main' }}>
                        <VisibilityOutlinedIcon fontSize="small" />
                      </IconButton>
                      {tpl.permissions?.edit && (
                        <IconButton size="small" onClick={() => { setPreviewing(null); onEditTemplate(tpl); }}
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
                      {tpl.permissions?.delete && (
                        <IconButton size="small" onClick={() => onDeleteTemplate(tpl)}
                          onMouseEnter={e => showTooltip(t('creator.deleteTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                          sx={{ color: 'error.light' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                      {tpl.myRole && tpl.myRole !== 'owner' && (
                        <IconButton size="small" onClick={() => onLeaveTemplate(tpl)}
                          onMouseEnter={e => showTooltip(t('creator.leaveTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                          sx={{ color: 'error.light' }}>
                          <LogoutIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  }>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5 }}>
                        <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: '0.95rem', color: 'primary.main' }}>{tpl.name}</Typography>
                        {tpl.description && (
                          <IconButton size="small" onClick={() => setDescribing(tpl)} aria-label={t('creator.about.showDescription')}
                            onMouseEnter={e => showTooltip(t('creator.about.showDescription'), e.currentTarget)} onMouseLeave={hideTooltip}
                            sx={{ color: 'primary.main', p: 0.25 }}>
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        )}
                        {tpl.isPublic && (
                          <Chip icon={<PublicIcon sx={{ fontSize: '0.9rem !important' }} />} label={t('creator.publicBadge')} size="small"
                            sx={{ height: 20, fontFamily: BODY_FONT, fontSize: '0.7rem', color: 'primary.main', borderColor: 'primary.light' }}
                            variant="outlined" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography sx={{ fontFamily: BODY_FONT, fontSize: '0.85rem', color: 'text.secondary', px: 1.5, pb: 0.5 }}>
                        v{tpl.version} · {countFields(tpl)} {t('creator.fields')}{tpl.myRole && tpl.myRole !== 'owner' && ` · ${t(`creator.roles.${tpl.myRole}`)}`}
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
      <TemplateDescriptionDialog template={describing} onClose={() => setDescribing(null)} />
      {open && <TemplateSheetPreview template={previewing} onClose={() => setPreviewing(null)} />}
    </>
  );
}

export default TemplateManagerDialog;
