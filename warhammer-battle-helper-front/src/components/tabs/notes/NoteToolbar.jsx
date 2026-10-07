import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import LinkIcon from '@mui/icons-material/Link';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import { ToolbarButton, ToolbarPopoverButton } from './toolbar/ToolbarButton';
import ColorPopover from './toolbar/ColorPopover';
import FontSizeCombo from './toolbar/FontSizeCombo';
import HeadingSelect from './toolbar/HeadingSelect';
import LinkPopover from './toolbar/LinkPopover';
import {
  DEFAULT_TEXT_COLOR,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  readFontSize,
  toCssFontSize,
} from './noteFormatting';

const TOOLTIP_HIDE_DELAY = 100;

const NoteToolbar = ({ editor }) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(null); // 'textColor' | 'highlight' | 'link' | null
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(tooltipTimeoutRef.current), []);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipTimeoutRef.current);
    const rect = el.getBoundingClientRect();
    setTooltip({ top: rect.bottom, left: rect.left + rect.width / 2, text });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), TOOLTIP_HIDE_DELAY);
  }, []);

  const closePopover = useCallback(() => setOpenPopover(null), []);
  const togglePopover = (name) => {
    setTooltip(null);
    setOpenPopover((current) => (current === name ? null : name));
  };

  if (!editor) return null;

  const tip = { onShowTooltip: showTooltip, onHideTooltip: hideTooltip };
  const textStyle = editor.getAttributes('textStyle');
  const textColor = textStyle.color ?? DEFAULT_TEXT_COLOR;
  const highlightColor = editor.getAttributes('highlight').color;

  const button = (key, Icon, command, active = false) => (
    <ToolbarButton
      key={key}
      icon={<Icon fontSize="small" />}
      label={t(`notes.toolbar.${key}`)}
      onClick={() => command(editor.chain().focus()).run()}
      active={active}
      {...tip}
    />
  );

  // The default swatch stores nothing, so the note keeps following the editor's own colour.
  // The custom path skips .focus(): it runs on every drag step of the native chooser, and
  // moving focus to the editor would steal it (Chrome may close the chooser). The editor
  // keeps its selection in state, so the command still lands.
  const startChain = (focus) => (focus ? editor.chain().focus() : editor.chain());
  const applyTextColor = (hex, focus = true) => {
    const chain = startChain(focus);
    (focus && hex.toLowerCase() === DEFAULT_TEXT_COLOR ? chain.unsetColor() : chain.setColor(hex)).run();
  };
  const applyHighlight = (hex, focus = true) => startChain(focus).setHighlight({ color: hex }).run();

  const applyLink = (href) => {
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // setLink on an empty selection only arms a stored mark; insert the address itself.
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
    closePopover();
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    closePopover();
  };

  return (
    <div className="note-toolbar" role="toolbar" aria-label={t('notes.toolbar.label')}>
      <div className="note-toolbar__group">
        <HeadingSelect editor={editor} {...tip} />
        <FontSizeCombo
          value={readFontSize(textStyle.fontSize)}
          onApply={(n) => editor.chain().focus().setFontSize(toCssFontSize(n)).run()}
          {...tip}
        />
      </div>

      <div className="note-toolbar__group">
        {button('bold', FormatBoldIcon, (c) => c.toggleBold(), editor.isActive('bold'))}
        {button('italic', FormatItalicIcon, (c) => c.toggleItalic(), editor.isActive('italic'))}
        {button('underline', FormatUnderlinedIcon, (c) => c.toggleUnderline(), editor.isActive('underline'))}
        {button('strike', FormatStrikethroughIcon, (c) => c.toggleStrike(), editor.isActive('strike'))}
      </div>

      <div className="note-toolbar__group">
        <ToolbarPopoverButton
          icon={<FormatColorTextIcon fontSize="small" />}
          label={t('notes.toolbar.textColor')}
          indicatorColor={textColor}
          isOpen={openPopover === 'textColor'}
          onToggle={() => togglePopover('textColor')}
          onClose={closePopover}
          {...tip}
        >
          <ColorPopover
            colors={TEXT_COLORS}
            activeHex={textColor}
            onSelect={(hex) => { applyTextColor(hex); closePopover(); }}
            onCustom={(hex) => applyTextColor(hex, false)}
            customLabel={t('notes.toolbar.customColor')}
          />
        </ToolbarPopoverButton>
        <ToolbarPopoverButton
          icon={<BorderColorIcon fontSize="small" />}
          label={t('notes.toolbar.highlight')}
          indicatorColor={highlightColor}
          active={editor.isActive('highlight')}
          isOpen={openPopover === 'highlight'}
          onToggle={() => togglePopover('highlight')}
          onClose={closePopover}
          {...tip}
        >
          <ColorPopover
            colors={HIGHLIGHT_COLORS}
            activeHex={highlightColor}
            onSelect={(hex) => { applyHighlight(hex); closePopover(); }}
            onCustom={(hex) => applyHighlight(hex, false)}
            onClear={() => { editor.chain().focus().unsetHighlight().run(); closePopover(); }}
            clearLabel={t('notes.toolbar.noHighlight')}
            customLabel={t('notes.toolbar.customColor')}
          />
        </ToolbarPopoverButton>
      </div>

      <div className="note-toolbar__group">
        {button('alignLeft', FormatAlignLeftIcon, (c) => c.setTextAlign('left'), editor.isActive({ textAlign: 'left' }))}
        {button('alignCenter', FormatAlignCenterIcon, (c) => c.setTextAlign('center'), editor.isActive({ textAlign: 'center' }))}
        {button('alignRight', FormatAlignRightIcon, (c) => c.setTextAlign('right'), editor.isActive({ textAlign: 'right' }))}
      </div>

      <div className="note-toolbar__group">
        {button('bulletList', FormatListBulletedIcon, (c) => c.toggleBulletList(), editor.isActive('bulletList'))}
        {button('orderedList', FormatListNumberedIcon, (c) => c.toggleOrderedList(), editor.isActive('orderedList'))}
        {button('blockquote', FormatQuoteIcon, (c) => c.toggleBlockquote(), editor.isActive('blockquote'))}
        {button('horizontalRule', HorizontalRuleIcon, (c) => c.setHorizontalRule())}
      </div>

      <div className="note-toolbar__group">
        <ToolbarPopoverButton
          icon={<LinkIcon fontSize="small" />}
          label={t('notes.toolbar.link')}
          active={editor.isActive('link')}
          isOpen={openPopover === 'link'}
          onToggle={() => togglePopover('link')}
          onClose={closePopover}
          {...tip}
        >
          <LinkPopover
            initialHref={editor.getAttributes('link').href}
            onApply={applyLink}
            onRemove={removeLink}
          />
        </ToolbarPopoverButton>
        {button('clearFormatting', FormatClearIcon, (c) => c.unsetAllMarks().clearNodes())}
      </div>

      {tooltip && createPortal(
        <div className="portal-tooltip portal-tooltip--below" style={{ top: tooltip.top, left: tooltip.left }}>
          {tooltip.text}
          <div className="portal-tooltip__arrow" />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default NoteToolbar;
