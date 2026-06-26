import React, {useEffect, useRef, useState} from 'react';
import LockIcon from '@mui/icons-material/Lock';
import SimpleMessage from './log/SimpleMessage';
import { getSystem } from '../systems/registry';
import './LogWindow.css';

// Jak długo świeży wpis nosi podświetlenie "nowe" (ms).
const HIGHLIGHT_MS = 30000;

const LogWindow = ({
    messages = [],
    logs = [],
    maxMessages = 100,
    autoScroll = true,
    gameSystem = 'warhammer4e',
    currentUserId = null,
    onlyMine = false
}) => {
    const system = getSystem(gameSystem);
    const logEndRef = useRef(null);

    // Support both 'messages' and 'logs' props
    const allMessages = logs.length > 0
        ? logs.map(log => ({
            id: log.id,
            createdAt: log.createdAt,
            text: log.message,
            type: log.type || 'info',
            timestamp: log.timestamp,
            data: log.data
          }))
        : messages;

    const filteredMessages = onlyMine
        ? allMessages.filter(msg => {
            const authorId = msg.data?.rollerUserId || msg.data?.userId || null;
            return Boolean(currentUserId && authorId && authorId === currentUserId);
          })
        : allMessages;

    const trimmedMessages = filteredMessages.slice(-maxMessages);

    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'instant' });
        }
    }, [trimmedMessages, autoScroll]);

    // Podświetlanie świeżo przybyłych wpisów przez HIGHLIGHT_MS.
    // seenRef = wpisy, które już oceniliśmy (by nie zapalać historii ani powtórnie).
    // newIds = wpisy aktualnie świecące; timer zdejmuje je po upływie czasu życia.
    const [newIds, setNewIds] = useState(() => new Set());
    const seenRef = useRef(new Set());
    const timersRef = useRef([]);

    useEffect(() => {
        trimmedMessages.forEach(msg => {
            if (!msg.id || seenRef.current.has(msg.id)) return;
            seenRef.current.add(msg.id);

            const age = msg.createdAt ? Date.now() - msg.createdAt : Infinity;
            if (age >= HIGHLIGHT_MS) return; // historia / stary wpis — bez podświetlenia

            setNewIds(prev => {
                const next = new Set(prev);
                next.add(msg.id);
                return next;
            });

            const timer = setTimeout(() => {
                setNewIds(prev => {
                    const next = new Set(prev);
                    next.delete(msg.id);
                    return next;
                });
            }, HIGHLIGHT_MS - age);
            timersRef.current.push(timer);
        });
    }, [trimmedMessages]);

    useEffect(() => () => {
        timersRef.current.forEach(clearTimeout);
    }, []);

    const renderMessage = (msg, index) => {
        const key = msg.id ?? index;
        const authorId = msg.data?.rollerUserId || msg.data?.userId || null;
        const isMine = Boolean(currentUserId && authorId && authorId === currentUserId);
        const isNew = Boolean(msg.id && newIds.has(msg.id));

        if (msg.data && msg.data.rollType) {
            const rollType = msg.data.rollType;
            const isHidden = msg.data.visibility && msg.data.visibility !== 'all';

            const RollComponent = system.getRollComponent(rollType);
            if (RollComponent) {
                const itemClass = `log-list-item${isHidden ? ' log-entry--hidden-roll' : ''}${isMine ? ' log-list-item--mine' : ''}${isNew ? ' log-list-item--new' : ''}`;
                return (
                    <li key={key} className={itemClass}>
                        {isHidden && <LockIcon className="log-entry__lock-icon" fontSize="inherit" />}
                        <RollComponent data={msg.data} timestamp={msg.timestamp} />
                    </li>
                );
            }

            // Unknown rollType for this system — show fallback instead of silently dropping
            const isKnownType = system.supportedRollTypes?.includes(rollType);
            if (!isKnownType) {
                return <SimpleMessage key={key} text={`Roll: ${rollType}`} type="info" timestamp={msg.timestamp} isNew={isNew} />;
            }
        }

        // Fallback for simple text messages
        const username = msg.data && msg.data.username ? msg.data.username : null;
        const isHidden = Boolean(msg.data && msg.data.visibility && msg.data.visibility !== 'all');
        return <SimpleMessage key={key} text={msg.text} type={msg.type} timestamp={msg.timestamp} username={username} isMine={isMine} isNew={isNew} isHidden={isHidden} />;
    };

    return (
        <div className="log-window">
            <div className="log-window__messages">
                {trimmedMessages.length === 0 ? (
                    <div className="log-window__empty">
                        <span className="log-window__empty-text">The chronicle awaits...</span>
                    </div>
                ) : (
                    <ul className="log-window__list">
                        {trimmedMessages.map(renderMessage)}
                        <div ref={logEndRef} />
                    </ul>
                )}
            </div>

        </div>
    );
};

export default LogWindow;
