import React from 'react';
import { Box, Typography, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useDiceAnimationSetting } from '../../hooks/useDiceAnimationSetting';
import { useAccountBooleanSetting } from '../../hooks/useAccountBooleanSetting';

// Account-wide in-game preferences. Each writes the same field as its switch in the game's
// General tab, so both show the same state on the next visit.
const GameSettings = () => {
    const { t } = useTranslation();
    const [diceAnimation, setDiceAnimation, loaded] = useDiceAnimationSetting();
    const [ignoreGameTheme, setIgnoreGameTheme, themeLoaded] = useAccountBooleanSetting('ignoreGameTheme');

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
                {t('userSettings.game.title')}
            </Typography>
            <FormControlLabel
                control={
                    <Switch
                        checked={diceAnimation}
                        disabled={!loaded}
                        onChange={(e) => setDiceAnimation(e.target.checked)}
                    />
                }
                label={t('settings.diceAnimation.label')}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('settings.diceAnimation.hint')}
            </Typography>
            <FormControlLabel
                sx={{ mt: 3 }}
                control={
                    <Switch
                        checked={!!ignoreGameTheme}
                        disabled={!themeLoaded}
                        onChange={(e) => setIgnoreGameTheme(e.target.checked)}
                    />
                }
                label={t('settings.ignoreGameTheme.label')}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('settings.ignoreGameTheme.hint')}
            </Typography>
        </Box>
    );
};

export default GameSettings;
