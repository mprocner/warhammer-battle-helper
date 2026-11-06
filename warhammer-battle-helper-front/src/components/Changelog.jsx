import React, { useEffect } from 'react';
import { Container, Box, Paper, Typography, Chip, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import usePageTitle from '../hooks/usePageTitle';
import MapIcon from '@mui/icons-material/Map';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import CasinoIcon from '@mui/icons-material/Casino';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import GroupsIcon from '@mui/icons-material/Groups';
import CategoryIcon from '@mui/icons-material/Category';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import SchoolIcon from '@mui/icons-material/School';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import PublicIcon from '@mui/icons-material/Public';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import BugReportIcon from '@mui/icons-material/BugReport';
import { RELEASES, releaseKey } from '../changelog/releases';
import { markLatestSeen } from '../changelog/seen';

export const SECTION_ICONS = {
    scene: MapIcon,
    characters: PersonOutlineIcon,
    creator: DashboardCustomizeIcon,
    dice: CasinoIcon,
    materials: LibraryBooksIcon,
    games: GroupsIcon,
    systems: CategoryIcon,
    minigames: SportsEsportsIcon,
    tutorials: SchoolIcon,
    accounts: AccountCircleIcon,
    site: PublicIcon,
    added: AutoAwesomeIcon,
    changed: BuildIcon,
    fixed: BugReportIcon,
};

// Release dates are calendar days; UTC keeps them from shifting a day west of Greenwich.
const formatDate = (iso, language) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));

const Changelog = () => {
    const { t, i18n } = useTranslation('changelog');
    usePageTitle(t('title'));

    useEffect(() => {
        markLatestSeen();
        // The SPA renders after the browser's own hash scroll, so /changelog#v1.0.0 needs a nudge.
        // Anchors are plain ids like "v1.0.0", so no decoding is needed; decodeURIComponent would throw on a malformed hash such as "#%".
        const anchor = window.location.hash && document.getElementById(window.location.hash.slice(1));
        anchor?.scrollIntoView?.();
    }, []);

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
                        {t('title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 4 }}>
                        {t('intro')}
                    </Typography>
                    {RELEASES.map(({ version, date, sections }, index) => (
                        <Box component="section" key={version} id={`v${version}`} sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                                <Typography variant="h5" component="h2">{version}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {formatDate(date, i18n.language)}
                                </Typography>
                                {index === 0 && <Chip label={t('latest')} color="secondary" size="small" />}
                            </Box>
                            <Divider sx={{ my: 2 }} />
                            {sections.map(({ id, items }) => {
                                const Icon = SECTION_ICONS[id];
                                return (
                                    <Box key={id} sx={{ mb: 2 }}>
                                        <Typography variant="h6" component="h3" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Icon fontSize="small" color="primary" />
                                            {t(`sections.${id}`)}
                                        </Typography>
                                        <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 3 }}>
                                            {items.map(item => (
                                                <Typography component="li" variant="body1" key={item}>
                                                    {t(`releases.${releaseKey(version)}.${id}.${item}`)}
                                                </Typography>
                                            ))}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    ))}
                </Paper>
            </Box>
        </Container>
    );
};

export default Changelog;
