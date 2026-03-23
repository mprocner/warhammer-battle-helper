import { useState, useCallback } from 'react';

export function useOnlineUsers() {
    const [onlineUserIds, setOnlineUserIds] = useState([]);

    const handleOnlineUsersMessage = useCallback((message) => {
        if (message.type === 'USERS_ONLINE') {
            setOnlineUserIds(message.payload?.onlineUserIds || []);
        }
    }, []);

    return { onlineUserIds, handleOnlineUsersMessage };
}
