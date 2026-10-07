import React from 'react';
import { useTranslation } from 'react-i18next';

const LEVELS = [1, 2, 3];

// Native <select>: it takes focus from the editor, but chain().focus() puts the
// selection back before the command runs.
const HeadingSelect = ({ editor, onShowTooltip, onHideTooltip }) => {
  const { t } = useTranslation();
  const current = LEVELS.find((level) => editor.isActive('heading', { level })) ?? 0;
  const label = t('notes.toolbar.textStyle');

  const handleChange = (e) => {
    const level = Number(e.target.value);
    const chain = editor.chain().focus();
    (level === 0 ? chain.setParagraph() : chain.setHeading({ level })).run();
  };

  return (
    <select
      className="note-toolbar__heading"
      value={current}
      onChange={handleChange}
      aria-label={label}
      onMouseEnter={(e) => onShowTooltip?.(label, e.currentTarget)}
      onMouseLeave={onHideTooltip}
    >
      <option value={0}>{t('notes.toolbar.paragraph')}</option>
      {LEVELS.map((level) => (
        <option key={level} value={level}>{t(`notes.toolbar.heading${level}`)}</option>
      ))}
    </select>
  );
};

export default HeadingSelect;
