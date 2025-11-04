import React, {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import { getApiUrl, getApiHeaders } from '../api/axios';
import {
    Paper,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    Button,
    TextField,
    Stack,
    Divider
} from '@mui/material';
import {
    Info as InfoIcon,
    CheckCircle as SuccessIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Casino as DiceIcon
} from '@mui/icons-material';

const LogWindow = ({
    messages = [],
    logs = [],
    maxMessages = 100,
    autoScroll = true,
    addLogMessage,
    gameId = null,
    token = null
}) => {
    const logEndRef = useRef(null);
    const [customSides, setCustomSides] = useState('');

    // Support both 'messages' and 'logs' props
    const allMessages = logs.length > 0
        ? logs.map(log => ({
            text: log.message,
            type: log.type || 'info',
            timestamp: log.timestamp
          }))
        : messages;

    const trimmedMessages = allMessages.slice(-maxMessages);

    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [trimmedMessages, autoScroll]);

    const rollDice = async (sides) => {
        try {
            // If in a game session, use the game-specific endpoint
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({ sides })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll dice');
                }

                // Don't add local message - result will come via WebSocket
            } else {
                // Fallback to single-player mode
                const response = await axios.post(`${getApiUrl()}/roll`, {
                    "sides": sides
                }, {
                    withCredentials: true
                });
                if (addLogMessage) {
                    addLogMessage(`Rolled d${sides}: ${response.data.result}`, 'info');
                }
            }
        } catch (error) {
            console.error('Error rolling dice:', error);
            if (addLogMessage) {
                addLogMessage('Failed to roll dice', 'error');
            }
        }
    };

    const handleCustomRoll = () => {
        const sides = parseInt(customSides, 10);
        if (!isNaN(sides) && sides > 0) {
            rollDice(sides);
            setCustomSides('');
        }
    };

    const getMessageIcon = (type) => {
        switch (type) {
            case 'success':
                return <SuccessIcon fontSize="small" color="success" />;
            case 'warning':
                return <WarningIcon fontSize="small" color="warning" />;
            case 'error':
                return <ErrorIcon fontSize="small" color="error" />;
            default:
                return <InfoIcon fontSize="small" color="info" />;
        }
    };

    return (
        <Paper
            elevation={3}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 0,
                background: 'linear-gradient(135deg, #f9f3e8 0%, #f4e8d8 100%)',
                border: '4px solid #7a5c42',
                boxShadow: '0 8px 24px rgba(107, 68, 35, 0.2)',
                position: 'relative',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: '10px',
                    border: '2px solid rgba(201, 151, 91, 0.3)',
                    pointerEvents: 'none',
                    zIndex: 1
                }
            }}
        >
            <Box sx={{
                p: 2,
                background: 'linear-gradient(180deg, #fff9f0 0%, #f9f3e8 100%)',
                borderBottom: '3px solid #c9975b',
                boxShadow: '0 2px 8px rgba(107, 68, 35, 0.1)',
                position: 'relative',
                zIndex: 2
            }}>
                <Typography
                    variant="h6"
                    fontWeight="bold"
                    sx={{
                        fontFamily: '"Cinzel", serif',
                        fontSize: '1.3rem',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: '#8b2f2f',
                        textShadow: '1px 1px 2px rgba(201, 151, 91, 0.3)'
                    }}
                >
                    Battle Chronicle
                </Typography>
            </Box>

            <Box
                sx={{
                    flexGrow: 1,
                    overflow: 'auto',
                    background: 'linear-gradient(135deg, rgba(255, 249, 240, 0.8) 0%, rgba(249, 243, 232, 0.8) 100%)',
                    position: 'relative',
                    zIndex: 2
                }}
            >
                {trimmedMessages.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography
                            variant="body2"
                            sx={{
                                color: '#8a7d6a',
                                fontFamily: '"Crimson Text", serif',
                                fontStyle: 'italic',
                                fontSize: '1rem'
                            }}
                        >
                            The chronicle awaits...
                        </Typography>
                    </Box>
                ) : (
                    <List dense sx={{ p: 2 }}>
                        {trimmedMessages.map((msg, index) => (
                            <ListItem
                                key={index}
                                sx={{
                                    borderLeft: '4px solid',
                                    borderColor: msg.type === 'error' ? '#a93434' :
                                                 msg.type === 'success' ? '#5a7a4a' :
                                                 msg.type === 'warning' ? '#c9975b' :
                                                 '#7a8a9a',
                                    mb: 1,
                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(253, 248, 236, 0.8) 100%)',
                                    borderRadius: 0,
                                    padding: '10px 12px',
                                    boxShadow: '0 2px 6px rgba(107, 68, 35, 0.12)',
                                    border: '1px solid #d4a574',
                                    borderLeftWidth: '4px'
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 1 }}>
                                    {getMessageIcon(msg.type)}
                                    <ListItemText
                                        primary={msg.text}
                                        secondary={
                                            msg.timestamp && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: '#8a7d6a',
                                                        fontFamily: '"Crimson Text", serif',
                                                        fontSize: '0.75rem',
                                                        fontStyle: 'italic'
                                                    }}
                                                >
                                                    {typeof msg.timestamp === 'object'
                                                        ? msg.timestamp.toLocaleTimeString()
                                                        : msg.timestamp}
                                                </Typography>
                                            )
                                        }
                                        primaryTypographyProps={{
                                            sx: {
                                                fontFamily: '"Crimson Text", serif',
                                                fontSize: '0.95rem',
                                                lineHeight: 1.5,
                                                color: '#3a2f1f'
                                            }
                                        }}
                                    />
                                </Box>
                            </ListItem>
                        ))}
                        <div ref={logEndRef} />
                    </List>
                )}
            </Box>

            <Divider sx={{ borderColor: '#c9975b', borderWidth: 2 }} />

            <Box sx={{
                p: 2,
                background: 'linear-gradient(180deg, #fdf8ec 0%, #f9f3e8 100%)',
                borderTop: '3px solid #c9975b',
                position: 'relative',
                zIndex: 2
            }}>
                <Typography
                    variant="subtitle2"
                    gutterBottom
                    fontWeight="bold"
                    sx={{
                        fontFamily: '"Cinzel", serif',
                        fontSize: '1rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#6b4423',
                        textShadow: '0 1px 1px rgba(255,255,255,0.5)',
                        mb: 1.5
                    }}
                >
                    Cast the Bones
                </Typography>
                <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                        {[4, 6, 10, 20, 100].map(sides => (
                            <Button
                                key={sides}
                                variant="contained"
                                size="small"
                                onClick={() => rollDice(sides)}
                                startIcon={<DiceIcon />}
                                sx={{
                                    minWidth: '70px',
                                    borderRadius: 2,
                                    fontFamily: '"Cinzel", serif',
                                    fontWeight: 700,
                                    fontSize: '0.85rem'
                                }}
                            >
                                d{sides}
                            </Button>
                        ))}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Custom"
                            value={customSides}
                            onChange={e => setCustomSides(e.target.value)}
                            inputProps={{ min: 1 }}
                            sx={{
                                flexGrow: 1,
                                '& .MuiInputBase-input': {
                                    fontFamily: '"Crimson Text", serif',
                                    color: '#3a2f1f'
                                },
                                '& .MuiInputBase-input::placeholder': {
                                    color: '#8a7d6a',
                                    opacity: 1
                                }
                            }}
                        />
                        <Button
                            variant="outlined"
                            onClick={handleCustomRoll}
                            disabled={!customSides || isNaN(parseInt(customSides, 10)) || parseInt(customSides, 10) < 1}
                            startIcon={<DiceIcon />}
                            sx={{
                                borderRadius: 2,
                                fontFamily: '"Cinzel", serif',
                                fontWeight: 700
                            }}
                        >
                            Roll
                        </Button>
                    </Stack>
                </Stack>
            </Box>
        </Paper>
    );
};

export default LogWindow;
