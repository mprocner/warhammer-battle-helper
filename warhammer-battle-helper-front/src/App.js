import React, {useState, useEffect, useCallback} from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import axiosInstance from './api/axios';
import theme from './theme';

import Login from './components/Login';
import Register from './components/Register';
import EmailVerification from './components/EmailVerification';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import GameLobby from './components/GameLobby';
import GameSession from './components/GameSession';
import CharacterSheetPage from './components/CharacterSheetPage';
import SettingsPage from './components/settings/SettingsPage';

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
    const [currentGameId, setCurrentGameId] = useState(null);
    const [allowedSystems, setAllowedSystems] = useState(null);
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

                    try {
                        const featuresRes = await axiosInstance.get('/features');
                        setAllowedSystems(featuresRes.data.allowedSystems);
                    } catch (e) {
                        // Features endpoint failed — show all systems, backend will enforce
                    }

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

    const handleLogin = async (email, token) => {
        setUser({ email, token });
        try {
            const featuresRes = await axiosInstance.get('/features');
            setAllowedSystems(featuresRes.data.allowedSystems);
        } catch (e) {
            // Features endpoint failed — show all systems, backend will enforce
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setUser(null);
        addLogMessage('User logged out', 'info');
    };

    const handleRegisterSuccess = (email) => {
        addLogMessage(`User ${email} registered successfully. Please log in.`, 'success');
    };

    const handleJoinGame = (gameId) => {
        setLobbyNotice(null);
        setCurrentGameId(gameId);
        addLogMessage(`Joining game ${gameId}`, 'info');
    };

    const handleGoToGameList = () => {
        setCurrentGameId(null);
        addLogMessage('Returned to game list', 'info');
    };

    // Reason is the i18n key suffix under `game.` produced by sessionEndReasonForStatus.
    // useCallback keeps the reference stable: GameSession puts it in fetchGameState's deps,
    // and an unstable one would refetch the whole game state on every App render.
    const handleSessionEnded = useCallback((reason) => {
        setCurrentGameId(null);
        setLobbyNotice(reason);
    }, []);

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
            <Router>
                <div className="App">
                    {window.location.pathname !== '/character-sheet' && (
                        <Navigation user={user} onLogout={handleLogout} inGame={!!currentGameId} />
                    )}

                    <Routes>
                    <Route
                        path="/login"
                        element={
                            user ?
                            <Navigate to="/" replace /> :
                            <Login onLogin={handleLogin} addLogMessage={addLogMessage} />
                        }
                    />
                    <Route
                        path="/register"
                        element={
                            user ?
                            <Navigate to="/" replace /> :
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

                    {/* Standalone character sheet window */}
                    <Route
                        path="/character-sheet"
                        element={<CharacterSheetPage />}
                    />

                    {/* Game Lobby - Main multiplayer hub */}
                    <Route
                        path="/"
                        element={
                            user ? (
                                <ProtectedRoute user={user}>
                                    {currentGameId ? (
                                        <GameSession
                                            gameId={currentGameId}
                                            token={user.token}
                                            onGoToGameList={handleGoToGameList}
                                            onSessionEnded={handleSessionEnded}
                                            onLogout={handleLogout}
                                        />
                                    ) : (
                                        <GameLobby
                                            onJoinGame={handleJoinGame}
                                            token={user.token}
                                            userEmail={user.email}
                                            allowedSystems={allowedSystems}
                                            notice={lobbyNotice}
                                            onDismissNotice={() => setLobbyNotice(null)}
                                        />
                                    )}
                                </ProtectedRoute>
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />
                    </Routes>
                </div>
            </Router>
        </ThemeProvider>
    );
}

export default App;
