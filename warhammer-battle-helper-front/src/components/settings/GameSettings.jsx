import React from 'react';
import { Box, Typography, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useDiceAnimationSetting } from '../../hooks/useDiceAnimationSetting';

// Account-wide in-game preferences. Writes the same field as the switch in the game's
// General tab, so both show the same state on the next visit.
const GameSettings = () => {
    const { t } = useTranslation();
    const [diceAnimation, setDiceAnimation, loaded] = useDiceAnimationSetting();

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
        </Box>
    );
};

export default GameSettings;
