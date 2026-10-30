import React from 'react';
import DraggablePopup from '../common/DraggablePopup';
import { WindowManagerProvider } from '../../contexts/WindowManagerContext';
import CustomSheetBody from '../../systems/custom/CustomSheetBody';
import { addOnCreateValues } from '../../systems/custom/addOnCreate';
import { clampSheetWidth } from '../../utils/sheetWidth';

// Read-only look at a template's character sheet, opened from the system picker and "My
// templates". It mounts the same wrapper and body as the creator's clean preview, so what is
// shown here is what a player will get in the game.
//
// The local WindowManagerProvider is required: DraggablePopup calls useWindowManager
// unconditionally and the lobby has no provider (same reason as PropertyPopup).
// DraggablePopup sizes itself only on mount, so the key remounts it when another template is
// previewed — otherwise the popup would keep the previous template's width.
function TemplateSheetPreview({ template, onClose }) {
  if (!template) return null;
  const sheetWidth = clampSheetWidth(template.settings?.sheetWidth);
  return (
    <WindowManagerProvider>
      <DraggablePopup
        key={template.id}
        title={template.name}
        onClose={onClose}
        initialWidth={sheetWidth}
        initialPosition="center"
      >
        <div className="custom-sheet" style={{ maxWidth: sheetWidth }}>
          <CustomSheetBody sections={template.sections} values={addOnCreateValues(template.sections)} showAffordances />
        </div>
      </DraggablePopup>
    </WindowManagerProvider>
  );
}

export default TemplateSheetPreview;
