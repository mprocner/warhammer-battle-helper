// Shared look of the lobby surface: parchment dialogs and the two display/body fonts.
export const DISPLAY_FONT = 'Cinzel, serif';
export const BODY_FONT = 'Crimson Text, serif';

// PaperProps for every lobby dialog. Destructive prompts pass an error accent so the
// frame itself carries the warning, not just the confirm button.
export const parchmentDialogProps = (borderColor = 'primary.main') => ({
  sx: {
    background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
    border: '3px solid',
    borderColor,
  },
});
