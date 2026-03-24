import React, { useMemo } from 'react';
import OnlineUserBubble from './OnlineUserBubble';

const OnlineUsersBar = ({ game, participants, onlineUserIds }) => {
    const allParticipants = useMemo(() => {
        if (!game) return [];

        // GM is stored in participants[] with role "gm"
        const gm = (participants || []).find(p => p.userId === game.gameMasterId);
        const gmEntry = {
            ...(gm || {}),
            userId: game.gameMasterId,
            username: gm?.username || game.gameMasterEmail || 'GM',
            email: gm?.email || game.gameMasterEmail || '',
            isGM: true,
        };

        const players = (participants || [])
            .filter(p => p.userId !== game.gameMasterId)
            .map(p => ({
                ...p,
                isGM: false,
            }));

        return [gmEntry, ...players];
    }, [game, participants]);

    return (
        <div className="right-panel__online-users">
            {allParticipants.map(p => (
                <OnlineUserBubble
                    key={p.userId}
                    participant={p}
                    isOnline={onlineUserIds.includes(p.userId)}
                />
            ))}
        </div>
    );
};

export default OnlineUsersBar;
