import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolbarButton, ToolbarPopoverButton } from './ToolbarButton';

describe('ToolbarButton', () => {
  it('runs onClick and keeps editor focus on mousedown', () => {
    const onClick = jest.fn();
    render(<ToolbarButton icon={<span />} label="Bold" onClick={onClick} active />);
    const btn = screen.getByRole('button', { name: 'Bold' });

    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.mouseDown(btn)).toBe(false);
    fireEvent.click(btn);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports hover to the tooltip handlers', () => {
    const onShowTooltip = jest.fn();
    const onHideTooltip = jest.fn();
    render(<ToolbarButton icon={<span />} label="Bold" onClick={() => {}} onShowTooltip={onShowTooltip} onHideTooltip={onHideTooltip} />);
    const btn = screen.getByRole('button', { name: 'Bold' });

    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);

    expect(onShowTooltip).toHaveBeenCalledWith('Bold', btn);
    expect(onHideTooltip).toHaveBeenCalledTimes(1);
  });
});

describe('ToolbarPopoverButton', () => {
  const renderOpen = (onClose = jest.fn(), onToggle = jest.fn()) => {
    render(
      <div>
        <p>outside</p>
        <ToolbarPopoverButton icon={<span />} label="Text color" isOpen onToggle={onToggle} onClose={onClose}>
          <div>popover body</div>
        </ToolbarPopoverButton>
      </div>,
    );
    return { onClose, onToggle };
  };

  it('renders children only while open', () => {
    const { rerender } = render(
      <ToolbarPopoverButton icon={<span />} label="Text color" isOpen={false} onToggle={() => {}} onClose={() => {}}>
        <div>popover body</div>
      </ToolbarPopoverButton>,
    );
    expect(screen.queryByText('popover body')).toBeNull();

    rerender(
      <ToolbarPopoverButton icon={<span />} label="Text color" isOpen onToggle={() => {}} onClose={() => {}}>
        <div>popover body</div>
      </ToolbarPopoverButton>,
    );
    expect(screen.getByText('popover body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text color' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on mousedown outside', () => {
    const { onClose } = renderOpen();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderOpen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on mousedown inside the popover or on its trigger', () => {
    const { onClose, onToggle } = renderOpen();
    fireEvent.mouseDown(screen.getByText('popover body'));
    const trigger = screen.getByRole('button', { name: 'Text color' });
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);

    expect(onClose).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the colour indicator', () => {
    render(
      <ToolbarPopoverButton icon={<span />} label="Text color" isOpen={false} onToggle={() => {}} onClose={() => {}} indicatorColor="#a8322d">
        <div />
      </ToolbarPopoverButton>,
    );
    expect(document.querySelector('.note-toolbar__indicator')).toHaveStyle({ backgroundColor: '#a8322d' });
  });
});
