import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import { SHORTCUTS, SHORTCUT_CONTEXTS, formatCombo, isMacPlatform } from './registry';
import { helpHref } from '../help/helpPages';

const paperSx = { background: 'linear-gradient(135deg, var(--c-surface) 0%, var(--c-surface-alt) 100%)', border: '1.5px solid var(--c-border-strong)' };

// In-game cheat sheet of the shortcut registry, grouped by context and filtered by role.
// Opened from the keyboard icon in the right panel header or with `?`.
export default function ShortcutsDialog({ open, isGM, onClose }) {
  const { t } = useTranslation();
  const isMac = isMacPlatform();
  const visible = SHORTCUTS.filter(s => isGM || !s.gmOnly);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: paperSx }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--c-text)', fontFamily: 'var(--font-display)' }}>
        {t('shortcuts.title')}
        <IconButton onClick={onClose} size="small" aria-label={t('common.close')}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {SHORTCUT_CONTEXTS.map(context => {
          const entries = visible.filter(s => s.context === context);
          if (entries.length === 0) return null;
          return (
            <section key={context} className="shortcuts-dialog__group">
              <h3 className="shortcuts-dialog__heading">{t(`shortcuts.contexts.${context}`)}</h3>
              {entries.map(s => (
                <div key={s.id} className="shortcuts-dialog__row">
                  <span className="shortcuts-dialog__label">{t(s.labelKey)}</span>
                  <span className="shortcuts-dialog__combos">
                    {s.combos.map(combo => (
                      <kbd key={combo.join('+')} className="shortcuts-dialog__kbd">{formatCombo(combo, { isMac, t })}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
        <a className="shortcuts-dialog__help" href={helpHref('game-screen#keyboard-shortcuts')} target="_blank" rel="noopener noreferrer">
          {t('shortcuts.moreInHelp')}
        </a>
      </DialogContent>
    </Dialog>
  );
}
