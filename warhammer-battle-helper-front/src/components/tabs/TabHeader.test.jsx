import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import TabHeader from './TabHeader';
import { TutorialProvider } from '../tutorial/TutorialContext';

const renderIn = (ui) => render(<TutorialProvider>{ui}</TutorialProvider>);

describe('TabHeader', () => {
  it('renders the title as a level-3 heading', () => {
    renderIn(<TabHeader title="Scenes" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Scenes' })).toHaveClass('tab-header__title');
  });

  it('puts children and the tour button into the actions slot, tour button last', () => {
    const { container } = renderIn(
      <TabHeader title="Scenes" tourId="scenes">
        <button className="tab-header__btn">Add</button>
      </TabHeader>
    );
    const actions = container.querySelector('.tab-header__actions');
    expect(actions.children).toHaveLength(2);
    expect(actions.firstElementChild).toHaveTextContent('Add');
    expect(actions.lastElementChild).toHaveClass('tour-button');
  });

  it('omits the actions slot when there is nothing to put in it', () => {
    const { container } = renderIn(<TabHeader title="General" />);
    expect(container.querySelector('.tab-header__actions')).toBeNull();
  });

  it('appends the extra class to the root', () => {
    const { container } = renderIn(<TabHeader title="Chat" className="log-window__header" />);
    expect(container.firstElementChild).toHaveClass('tab-header', 'log-window__header');
  });
});
