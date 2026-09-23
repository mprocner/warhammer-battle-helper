import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import PropertyPopup from './PropertyPopup';

describe('PropertyPopup', () => {
  test('renders nothing when closed', () => {
    const { container } = render(
      <PropertyPopup open={false} title="Field properties" onClose={() => {}}>
        <div data-testid="panel" />
      </PropertyPopup>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  test('mounts without a WindowManagerProvider above it', () => {
    // The creator is reachable from the lobby, which sits outside the session's
    // WindowManagerProvider, and DraggablePopup calls useWindowManager unconditionally — that
    // hook throws when no provider is present. This test renders with NO provider on purpose:
    // it is the whole defect this file's local provider exists to prevent.
    expect(() => render(
      <PropertyPopup open title="Field properties" onClose={() => {}}>
        <div data-testid="panel" />
      </PropertyPopup>
    )).not.toThrow();
  });

  test('shows the title and the panel it was given', () => {
    render(
      <PropertyPopup open title="Field properties" onClose={() => {}}>
        <div data-testid="panel" />
      </PropertyPopup>
    );
    expect(screen.getByText('Field properties')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });
});
