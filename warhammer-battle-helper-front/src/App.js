import React, {useState, useEffect, useCallback} from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import axiosInstance from './api/axios';
import theme from './theme';

import Login from './components/Login';
import Register from './components/Register';
import EmailVerification from './components/EmailVerification';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import Licenses from './components/Licenses';
import Contact from './components/Contact';
import HelpPage from './components/help/HelpPage';
import Changelog from './components/Changelog';
import Navigation from './components/Navigation';
import SiteFooter from './components/common/SiteFooter';
import ProtectedRoute, { returnPathAfterLogin } from './components/ProtectedRoute';
import GameLobby from './components/GameLobby';
import GameSession from './components/GameSession';
import CharacterSheetPage from './components/CharacterSheetPage';
import LandingPage from './components/landing/LandingPage';
import SettingsPage from './components/settings/SettingsPage';
import { ConsentProvider } from './analytics/ConsentContext';
import AnalyticsGate from './analytics/AnalyticsGate';
import ConsentBanner from './components/consent/ConsentBanner';
import { usePageViews } from './analytics/usePageViews';
import { setUserId } from './analytics/gtag';
import JoinGame from './invite/JoinGame';
import { useInviteJoin } from './invite/useInviteJoin';
import useGameRoute from './hooks/useGameRoute';

// usePageViews lives in its own component so it sits after AnalyticsGate in the tree: that
// order makes enable() commit before the first page_view (see the comment in the JSX below).
const PageViewTracker = () => {
    usePageViews();
    return null;
};

// /games/:gameId. The key remounts the session when the URL switches straight to another game,
// so nothing (state, socket, log) carries over from the previous one.
const GameSessionRoute = (props) => {
    const { gameId } = useParams();
    return <GameSession key={gameId} gameId={gameId} {...props} />;
};

function App() {
    const [, setLogs] = useState([
        {
            text: 'Application initialized',
            timestamp: new Date(),
            type: 'info'
        }
    ]);

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lobbyNotice, setLobbyNotice] = useState(null);

    // Example: Add a new log message
    const addLogMessage = (text, type = 'info') => {
        setLogs(prevLogs => [
            ...prevLogs,
            { text, timestamp: new Date(), type }
        ]);
    };

    // Check if user is already logged in on app start
    useEffect(() => {
        const checkAuthStatus = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    // Verify token by calling profile endpoint
                    const response = await axiosInstance.get('/profile');

                    setUser({
                        email: response.data.email,
                        token
                    });
                    setUserId(response.data.user_id);

                    addLogMessage(`User ${response.data.email} automatically logged in`, 'success');
                } catch (error) {
                    // Token is invalid, remove it
                    localStorage.removeItem('token');
                    addLogMessage('Invalid token, please log in again', 'warning');
                }
            }
            setLoading(false);
        };

        checkAuthStatus();
    }, []);

    const handleLogin = (email, token, userId) => {
        setUser({ email, token });
        setUserId(userId);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setUserId(null);
        setLobbyNotice(null);
        addLogMessage('User logged out', 'info');
    };

    const handleRegisterSuccess = (email) => {
        addLogMessage(`User ${email} registered successfully. Please log in.`, 'success');
    };

    const location = useLocation();
    const { gameId: currentGameId, openGame, leaveGame } = useGameRoute();

    const handleJoinGame = (gameId) => {
        setLobbyNotice(null);
        openGame(gameId);
        addLogMessage(`Joining game ${gameId}`, 'info');
    };

    // Invite link (PLAYRPG-303): joins the game behind a parked token as soon as someone is logged
    // in and opens it the same way the lobby does. A dead link lands as a lobby notice.
    const consumeInvite = useInviteJoin({
        user,
        onJoined: handleJoinGame,
        onFailed: setLobbyNotice,
    });

    const handleGoToGameList = () => {
        leaveGame();
        addLogMessage('Returned to game list', 'info');
    };

    // Reason is the i18n key suffix under `game.` produced by sessionEndReasonForStatus.
    // useCallback keeps the reference stable: GameSession puts it in fetchGameState's deps,
    // and an unstable one would refetch the whole game state on every App render.
    const handleSessionEnded = useCallback((reason) => {
        leaveGame();
        setLobbyNotice(reason);
    }, [leaveGame]);

    // The footer (and the full-height page column that pins it down) is for regular pages; the
    // game room and the standalone character sheet use the whole viewport. Same rule as the
    // header: Navigation hides itself in game, and is skipped on /character-sheet.
    const isCharacterSheet = location.pathname === '/character-sheet';
    const showSiteChrome = !currentGameId && !isCharacterSheet;

    // Show loading spinner while checking auth status
    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontSize: '18px'
            }}>
                Loading...
            </div>
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <ConsentProvider>
                {/* Must render before PageViewTracker: usePageViews also depends on consent, so
                    on the "consent already stored at startup" path this order guarantees that
                    AnalyticsGate's enable() effect commits before the page_view effect, and no
                    page view is sent twice. */}
                <AnalyticsGate />
                <ConsentBanner />
                <PageViewTracker />
                <div className={showSiteChrome ? 'App App--page' : 'App'}>
                    {!isCharacterSheet && (
                        <Navigation user={user} onLogout={handleLogout} inGame={!!currentGameId} />
                    )}

                    <Routes>
                    <Route
                        path="/login"
                        element={
                            user ?
                            <Navigate to={returnPathAfterLogin(location.state)} replace /> :
                            <Login onLogin={handleLogin} addLogMessage={addLogMessage} />
                        }
                    />
                    <Route
                        path="/register"
                        element={
                            user ?
                            <Navigate to="/games" replace /> :
                            <Register onRegisterSuccess={handleRegisterSuccess} addLogMessage={addLogMessage} />
                        }
                    />

                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute user={user}>
                                <SettingsPage />
                            </ProtectedRoute>
                        }
                    />

                    <Route path="/verify-email" element={<EmailVerification />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/licenses" element={<Licenses />} />
                    <Route path="/contact" element={<Contact user={user} />} />
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/help/:page" element={<HelpPage />} />
                    <Route path="/changelog" element={<Changelog />} />
                    <Route path="/join/:token" element={<JoinGame user={user} onInviteReady={consumeInvite} />} />

                    {/* Standalone character sheet window */}
                    <Route
                        path="/character-sheet"
                        element={<CharacterSheetPage />}
                    />

                    <Route path="/" element={<LandingPage user={user} />} />

                    {/* Game Lobby - Main multiplayer hub. ProtectedRoute sends guests to /login. */}
                    <Route
                        path="/games"
                        element={
                            <ProtectedRoute user={user}>
                                <GameLobby
                                    onJoinGame={handleJoinGame}
                                    token={user?.token}
                                    userEmail={user?.email}
                                    notice={lobbyNotice}
                                    onDismissNotice={() => setLobbyNotice(null)}
                                />
                            </ProtectedRoute>
                        }
                    />
                    {/* Game session (PLAYRPG-338): its own URL, so reload, bookmarks and Back work. */}
                    <Route
                        path="/games/:gameId"
                        element={
                            <ProtectedRoute user={user}>
                                <GameSessionRoute
                                    token={user?.token}
                                    onGoToGameList={handleGoToGameList}
                                    onSessionEnded={handleSessionEnded}
                                    onLogout={handleLogout}
                                />
                            </ProtectedRoute>
                        }
                    />
                    </Routes>
                    {showSiteChrome && <SiteFooter />}
                </div>
            </ConsentProvider>
        </ThemeProvider>
    );
}

export default App;
