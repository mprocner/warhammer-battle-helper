import React from 'react';
import { Container, Box, Paper, Typography, Link } from '@mui/material';
import { useTranslation } from 'react-i18next';
import usePageTitle from '../hooks/usePageTitle';

// CC-BY-4.0 attribution required by the SRD licence. Reproduced verbatim from the official
// SRD 5.2.1 "Legal Information" page, so it deliberately bypasses i18n: a translated notice is no
// longer the notice the licence asks for. The licence also forbids any other mention of the
// publisher — keep it here only.
export const SRD_ATTRIBUTION = 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

// 3D dice (PLAYRPG-343). MIT requires the copyright notice to travel with the code; the lines
// are copied from each package's LICENSE file, so they are not translated.
const MIT_URL = 'https://opensource.org/license/mit';
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
export const DICE_CREDITS = [
    { name: 'dice-box-threejs', url: 'https://github.com/3d-dice/dice-box-threejs', notice: 'Copyright (c) 2022 3D Dice', licence: 'MIT', licenceUrl: MIT_URL },
    { name: 'three.js', url: 'https://threejs.org', notice: 'Copyright © 2010-2022 three.js authors', licence: 'MIT', licenceUrl: MIT_URL },
    { name: 'cannon-es', url: 'https://github.com/pmndrs/cannon-es', notice: 'Copyright (c) 2015 cannon.js Authors', licence: 'MIT', licenceUrl: MIT_URL },
    { name: 'Casino Audio', url: 'https://kenney.nl/assets/casino-audio', notice: 'Kenney (www.kenney.nl)', licence: 'CC0 1.0', licenceUrl: CC0_URL },
];

const Licenses = () => {
    const { t } = useTranslation();
    usePageTitle(t('pageTitle.licenses'));

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        {t('licenses.title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        {t('licenses.intro')}
                    </Typography>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        {t('licenses.srdTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        {SRD_ATTRIBUTION}
                    </Typography>
                    <Link href={CC_BY_URL} target="_blank" rel="noopener noreferrer" variant="body2">
                        {t('licenses.ccLink')}
                    </Link>
                    <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
                        {t('licenses.diceTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        {t('licenses.diceIntro')}
                    </Typography>
                    {DICE_CREDITS.map(c => (
                        <Typography key={c.name} variant="body2" sx={{ mb: 0.5 }}>
                            <Link href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</Link>
                            {' — '}{c.notice}{' — '}
                            <Link href={c.licenceUrl} target="_blank" rel="noopener noreferrer">{c.licence}</Link>
                        </Typography>
                    ))}
                </Paper>
            </Box>
        </Container>
    );
};

export default Licenses;
