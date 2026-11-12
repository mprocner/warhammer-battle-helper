import React from 'react';
import { render, screen } from '@testing-library/react';
import ImageTokenLabel from './ImageTokenLabel';

describe('ImageTokenLabel', () => {
  test('renders nothing without a label', () => {
    const { container } = render(<ImageTokenLabel label="" width={50} height={50} rotation={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows the label just below the image', () => {
    render(<ImageTokenLabel label="Goblin" width={100} height={50} rotation={0} />);
    const label = screen.getByText('Goblin');
    expect(label).toHaveClass('token-name');
    expect(label).toHaveStyle({ top: 'calc(50% + 25px)' });
  });

  test('sits below the rotated image, not below its unrotated box', () => {
    render(<ImageTokenLabel label="Goblin" width={100} height={50} rotation={90} />);
    expect(screen.getByText('Goblin')).toHaveStyle({ top: 'calc(50% + 50px)' });
  });
});
