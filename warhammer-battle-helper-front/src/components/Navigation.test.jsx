import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import Navigation from './Navigation';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderNav = (props) => render(
  <MemoryRouter>
    <Navigation onLogout={() => {}} {...props} />
  </MemoryRouter>,
);

// jsdom applies the xs (base) breakpoint styles only, so the wide-screen controls count
// as hidden; `hidden: true` lets the queries see both layouts.
const button = (name) => screen.getByRole('button', { name, hidden: true });

describe('Navigation', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('labels changelog and help with visible text', () => {
    renderNav({ user: null });
    fireEvent.click(button("What's new"));
    expect(mockNavigate).toHaveBeenCalledWith('/changelog');
    fireEvent.click(button('Help'));
    expect(mockNavigate).toHaveBeenCalledWith('/help');
  });

  it('leaves the legal pages to the footer', () => {
    renderNav({ user: { email: 'gm@example.com' } });
    ['Privacy policy', 'Licenses', 'Terms of service'].forEach((name) => {
      expect(screen.queryByRole('button', { name, hidden: true })).not.toBeInTheDocument();
    });
  });

  it('opens settings and logout from the account button', () => {
    const onLogout = jest.fn();
    renderNav({ user: { email: 'gm@example.com' }, onLogout });
    expect(screen.queryByRole('menuitem', { name: 'Settings' })).not.toBeInTheDocument();

    fireEvent.click(button('gm@example.com'));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Logout' }));

    expect(onLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('collects every link in the phone menu', () => {
    renderNav({ user: { email: 'gm@example.com' } });
    fireEvent.click(button('Menu'));
    const menu = screen.getByRole('menu');
    ["What's new", 'Help', 'Settings', 'Logout'].forEach((name) => {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Settings' }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('renders nothing in the game room', () => {
    const { container } = renderNav({ user: { email: 'gm@example.com' }, inGame: true });
    expect(container).toBeEmptyDOMElement();
  });
});
