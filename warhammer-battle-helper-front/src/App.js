import React, {useState, useEffect} from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import axiosInstance from './api/axios';
import theme from './theme';

import DragAndDropContext from './components/DndContext';
import LogWindow from "./components/LogWindow";
import Login from './components/Login';
import Register from './components/Register';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
    const [logs, setLogs] = useState([
        {
            text: 'Application initialized',
            timestamp: new Date(),
            type: 'info'
        }
    ]);

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

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
                    <Navigation user={user} onLogout={handleLogout} />

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
                        path="/app"
                        element={
                            <ProtectedRoute user={user}>
                                <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
                                    {/* Main battle content area */}
                                    <div className="main" style={{ flex: 1, overflow: 'auto' }}>
                                        <DragAndDropContext addLogMessage={addLogMessage}/>
                                    </div>
                                    {/* Log window component - fixed on right */}
                                    <div style={{ width: '400px', height: '100%', borderLeft: '1px solid #ccc' }}>
                                        <LogWindow
                                            messages={logs}
                                            maxMessages={50}
                                            autoScroll={true}
                                            addLogMessage={addLogMessage}
                                        />
                                    </div>
                                </div>
                            </ProtectedRoute>
                        }
                    />
                    {/* Catch all route - redirect to home */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </Router>
        </ThemeProvider>
    );
}

export default App;
