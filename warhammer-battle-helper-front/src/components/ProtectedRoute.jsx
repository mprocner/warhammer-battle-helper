import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const DEFAULT_RETURN_PATH = '/games';

// Where /login sends a visitor once they are logged in: back to the protected page that sent
// them there (e.g. a bookmarked /games/:id), or the lobby. Only in-app paths are accepted.
export const returnPathAfterLogin = (state) => {
    const from = state?.from;
    return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
        ? from
        : DEFAULT_RETURN_PATH;
};

const ProtectedRoute = ({ children, user }) => {
    const location = useLocation();
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }

    return children;
};

export default ProtectedRoute;
