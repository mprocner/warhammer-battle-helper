import React, {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {
    Paper,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    Chip,
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
    maxMessages = 100,
    autoScroll = true,
    addLogMessage
}) => {
    const logEndRef = useRef(null);
    const [customSides, setCustomSides] = useState('');

    const trimmedMessages = messages.slice(-maxMessages);

    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [trimmedMessages, autoScroll]);

    const rollDice = async (sides) => {
        const response = await axios.post('http://localhost:8080/roll', {
            "sides": sides
        }, {
            withCredentials: true
        });
        if (addLogMessage) {
            addLogMessage(`Rolled d${sides}: ${response.data.result}`, 'info');
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

    const getMessageColor = (type) => {
        switch (type) {
            case 'success':
                return 'success.light';
            case 'warning':
                return 'warning.light';
            case 'error':
                return 'error.light';
            default:
                return 'info.light';
        }
    };

    return (
        <Paper
            elevation={3}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2
            }}
        >
            <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white', borderRadius: '8px 8px 0 0' }}>
                <Typography variant="h6" fontWeight="bold">
                    Battle Log
                </Typography>
            </Box>

            <Box
                sx={{
                    flexGrow: 1,
                    overflow: 'auto',
                    bgcolor: 'background.paper'
                }}
            >
                {trimmedMessages.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            No messages to display
                        </Typography>
                    </Box>
                ) : (
                    <List dense sx={{ p: 1 }}>
                        {trimmedMessages.map((msg, index) => (
                            <ListItem
                                key={index}
                                sx={{
                                    borderLeft: 3,
                                    borderColor: getMessageColor(msg.type),
                                    mb: 0.5,
                                    bgcolor: 'background.default',
                                    borderRadius: 1
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 1 }}>
                                    {getMessageIcon(msg.type)}
                                    <ListItemText
                                        primary={msg.text}
                                        secondary={
                                            msg.timestamp && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {typeof msg.timestamp === 'object'
                                                        ? msg.timestamp.toLocaleTimeString()
                                                        : msg.timestamp}
                                                </Typography>
                                            )
                                        }
                                    />
                                </Box>
                            </ListItem>
                        ))}
                        <div ref={logEndRef} />
                    </List>
                )}
            </Box>

            <Divider />

            <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                    Dice Roller
                </Typography>
                <Stack spacing={1}>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        {[4, 6, 10, 20, 100].map(sides => (
                            <Button
                                key={sides}
                                variant="contained"
                                size="small"
                                onClick={() => rollDice(sides)}
                                startIcon={<DiceIcon />}
                            >
                                d{sides}
                            </Button>
                        ))}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Custom sides"
                            value={customSides}
                            onChange={e => setCustomSides(e.target.value)}
                            inputProps={{ min: 1 }}
                            sx={{ flexGrow: 1 }}
                        />
                        <Button
                            variant="outlined"
                            onClick={handleCustomRoll}
                            disabled={!customSides || isNaN(parseInt(customSides, 10)) || parseInt(customSides, 10) < 1}
                            startIcon={<DiceIcon />}
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
