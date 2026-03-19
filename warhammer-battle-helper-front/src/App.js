import React, {useState, useEffect} from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import axiosInstance from './api/axios';
import theme from './theme';

import Login from './components/Login';
import Register from './components/Register';
import EmailVerification from './components/EmailVerification';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import GameLobby from './components/GameLobby';
import GameSession from './components/GameSession';
import CharacterSheetPage from './components/CharacterSheetPage';

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

    const handleLogin = (email, token) => {
        setUser({ email, token });
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
        setCurrentGameId(gameId);
        addLogMessage(`Joining game ${gameId}`, 'info');
    };

    const handleLeaveGame = () => {
        setCurrentGameId(null);
        addLogMessage('Left game', 'info');
    };

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

                    <Route path="/verify-email" element={<EmailVerification />} />

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
                                            onLeaveGame={handleLeaveGame}
                                            onLogout={handleLogout}
                                        />
                                    ) : (
                                        <GameLobby
                                            onJoinGame={handleJoinGame}
                                            token={user.token}
                                            userEmail={user.email}
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
