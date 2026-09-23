import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import FieldChrome from './FieldChrome';
import SectionChrome from './SectionChrome';

const field = { key: 'attr_ws', type: 'attr', label: 'WW' };
const section = { id: 'sec_a', title: 'Cechy', columns: 2, fields: [] };

describe('FieldChrome', () => {
  test('offers a drag handle and an edit button', () => {
    render(<FieldChrome field={field} onSelect={() => {}} onEdit={() => {}} />);
    expect(screen.getByLabelText('Drag')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
  });

  test('the edit button opens properties without going through selection', () => {
    const onEdit = jest.fn();
    const onSelect = jest.fn();
    render(<FieldChrome field={field} onSelect={onSelect} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('a duplicate key is flagged permanently, not only on hover', () => {
    const { container } = render(
      <FieldChrome field={field} duplicateKey onSelect={() => {}} onEdit={() => {}} />
    );
    const badge = container.querySelector('.creator__chrome-dupe');
    expect(badge).toBeInTheDocument();
    // The badge lives outside the hover-gated pill so CSS cannot hide it.
    expect(badge.closest('.creator__chrome')).toBeNull();
  });

  test('selection is reflected on the outline element', () => {
    const { container } = render(
      <FieldChrome field={field} selected onSelect={() => {}} onEdit={() => {}} />
    );
    expect(container.querySelector('.creator__chrome-outline--selected')).toBeInTheDocument();
  });

  test('offers up/down reorder buttons that do not select the node', () => {
    const onMoveUp = jest.fn();
    const onMoveDown = jest.fn();
    const onSelect = jest.fn();
    render(
      <FieldChrome
        field={field}
        onSelect={onSelect}
        onEdit={() => {}}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );
    fireEvent.click(screen.getByLabelText('Move up'));
    fireEvent.click(screen.getByLabelText('Move down'));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('reorder buttons are disabled at the ends', () => {
    render(
      <FieldChrome
        field={field}
        onSelect={() => {}}
        onEdit={() => {}}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        isFirst
        isLast
      />
    );
    expect(screen.getByLabelText('Move up')).toBeDisabled();
    expect(screen.getByLabelText('Move down')).toBeDisabled();
  });

  test('offers a duplicate button that does not select the node', () => {
    const onDuplicate = jest.fn();
    const onSelect = jest.fn();
    render(<FieldChrome field={field} onSelect={onSelect} onEdit={() => {}} onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByLabelText('Duplicate field'));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('offers a delete button that does not select the node', () => {
    const onRemove = jest.fn();
    const onSelect = jest.fn();
    render(<FieldChrome field={field} onSelect={onSelect} onEdit={() => {}} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText('Delete field'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SectionChrome', () => {
  test('adds an add-field button next to drag and edit', () => {
    render(<SectionChrome section={section} onSelect={() => {}} onEdit={() => {}} onAddField={() => {}} />);
    expect(screen.getByLabelText('Drag')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
    expect(screen.getByLabelText('Add field')).toBeInTheDocument();
  });

  test('add-field does not select the section', () => {
    const onAddField = jest.fn();
    const onSelect = jest.fn();
    render(<SectionChrome section={section} onSelect={onSelect} onEdit={() => {}} onAddField={onAddField} />);
    fireEvent.click(screen.getByLabelText('Add field'));
    expect(onAddField).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('offers up/down reorder buttons that do not select the section', () => {
    const onMoveUp = jest.fn();
    const onMoveDown = jest.fn();
    const onSelect = jest.fn();
    render(
      <SectionChrome
        section={section}
        onSelect={onSelect}
        onEdit={() => {}}
        onAddField={() => {}}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );
    fireEvent.click(screen.getByLabelText('Move up'));
    fireEvent.click(screen.getByLabelText('Move down'));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('reorder buttons are disabled at the ends', () => {
    render(
      <SectionChrome
        section={section}
        onSelect={() => {}}
        onEdit={() => {}}
        onAddField={() => {}}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        isFirst
        isLast
      />
    );
    expect(screen.getByLabelText('Move up')).toBeDisabled();
    expect(screen.getByLabelText('Move down')).toBeDisabled();
  });

  test('offers a duplicate button that does not select the section', () => {
    const onDuplicate = jest.fn();
    const onSelect = jest.fn();
    render(
      <SectionChrome
        section={section}
        onSelect={onSelect}
        onEdit={() => {}}
        onAddField={() => {}}
        onDuplicate={onDuplicate}
      />
    );
    fireEvent.click(screen.getByLabelText('Duplicate section'));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('offers a delete button that does not select the section', () => {
    const onRemove = jest.fn();
    const onSelect = jest.fn();
    render(
      <SectionChrome
        section={section}
        onSelect={onSelect}
        onEdit={() => {}}
        onAddField={() => {}}
        onRemove={onRemove}
      />
    );
    fireEvent.click(screen.getByLabelText('Delete section'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
