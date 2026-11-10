// Shared look of the lobby surface: parchment dialogs and the two display/body fonts.
export const DISPLAY_FONT = 'var(--font-display)';
export const BODY_FONT = 'var(--font-body)';

// PaperProps for every lobby dialog. Destructive prompts pass an error accent so the
// frame itself carries the warning, not just the confirm button.
export const parchmentDialogProps = (borderColor = 'primary.main') => ({
  sx: {
    background: 'linear-gradient(135deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%)',
    border: '3px solid',
    borderColor,
  },
});
