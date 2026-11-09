import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import LobbyFilterBar, { NoMatchingGames } from './LobbyFilterBar';

const renderBar = (props = {}) => {
  const handlers = { onRoleChange: jest.fn(), onQueryChange: jest.fn() };
  const utils = render(
    <LobbyFilterBar role={null} query="" showRoles showSearch {...handlers} {...props} />,
  );
  return { ...utils, ...handlers };
};

describe('LobbyFilterBar', () => {
  it('renders nothing when neither control is useful', () => {
    const { container } = renderBar({ showRoles: false, showSearch: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('hides the chips when roles are not shown', () => {
    renderBar({ showRoles: false });
    expect(screen.queryByRole('button', { name: 'Running' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search games' })).toBeInTheDocument();
  });

  it('hides the search box when search is not shown', () => {
    renderBar({ showSearch: false });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Running' })).toBeInTheDocument();
  });

  it('marks the selected chip and reports clicks', () => {
    const { onRoleChange } = renderBar({ role: 'gm' });
    expect(screen.getByRole('button', { name: 'Running' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }));
    expect(onRoleChange).toHaveBeenCalledWith('player');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onRoleChange).toHaveBeenCalledWith(null);
  });

  it('reports typing and clears the query', () => {
    const { onQueryChange } = renderBar({ query: 'za' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'zam' } });
    expect(onQueryChange).toHaveBeenCalledWith('zam');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('shows no clear button for an empty query', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });
});

describe('NoMatchingGames', () => {
  it('names the query and clears filters', () => {
    const onClear = jest.fn();
    render(<NoMatchingGames query="zamek" onClear={onClear} />);
    expect(screen.getByText('No games match “zamek”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('uses the role message without a query', () => {
    render(<NoMatchingGames query="  " onClear={jest.fn()} />);
    expect(screen.getByText('No games in this view')).toBeInTheDocument();
  });
});
