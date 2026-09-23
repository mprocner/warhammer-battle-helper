import React from 'react';
import { useTranslation } from 'react-i18next';
import DraggablePopup from '../common/DraggablePopup';
import { WindowManagerProvider } from '../../contexts/WindowManagerContext';

// Properties live in a movable popup rather than a docked panel because of plain arithmetic:
// palette 200px + panel 400px + canvas padding 48px = 648px of chrome, which on a 1440px
// laptop leaves 792px for a sheet whose default width is 900px (SHEET_WIDTH_DEFAULT). A docked
// panel would squeeze the render exactly while the GM is judging it, and a WYSIWYG editor that
// cannot show a faithful default-width sheet has eaten its own premise.
//
// The panel CONTENTS are unchanged — this is a different container, not a redesign.
//
// The local WindowManagerProvider is not optional. DraggablePopup calls useWindowManager
// unconditionally and that hook throws without a provider, while WindowManagerProvider wraps only
// GameSession — and the creator is reachable from the lobby too (GameLobby.jsx renders
// TemplateBuilder outside the session entirely). Without this, opening properties from a
// lobby-launched creator brings the app down. The popup is unmanaged, so it never registers in a
// taskbar and this registry stays empty; inside a session it shadows the real provider for this
// subtree only, which costs nothing an unmanaged popup was using.
function PropertyPopup({ open, title, onClose, children }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <WindowManagerProvider>
      <DraggablePopup
        title={title || t('creator.propsClickHint')}
        onClose={onClose}
        initialWidth={680}
        initialPosition="center"
        className="creator__props-popup"
      >
        <div className="creator__props-popup-body">{children}</div>
      </DraggablePopup>
    </WindowManagerProvider>
  );
}

export default PropertyPopup;
