import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '../../../i18n';
import HandoutCreateModal from './HandoutCreateModal';
import { uploadHandoutFile } from '../../../api/handouts';

jest.mock('../../../api/axios', () => ({ getApiUrl: () => 'http://api.test' }));

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../../../api/handouts', () => ({
  uploadHandoutFile: jest.fn(),
}));

const renderModal = (props = {}) =>
  render(<HandoutCreateModal isOpen onClose={() => {}} onSave={jest.fn()} gameId="g-1" {...props} />);

const pickFile = (file) => {
  const fileInput = screen.getByLabelText(/^File/);
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fireEvent.change(fileInput);
};

describe('HandoutCreateModal — uploaded file name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the original name of an uploaded PDF and sends it on save', async () => {
    // The server renames the file, so the URL carries no trace of the original name
    uploadHandoutFile.mockResolvedValue({ url: '/handouts/3f9a1c.pdf' });
    const onSave = jest.fn();
    renderModal({ onSave });

    pickFile(new File(['%PDF-'], 'Mapa lochu.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('Mapa lochu.pdf')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Mapa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      fileUrl: '/handouts/3f9a1c.pdf',
      fileName: 'Mapa lochu.pdf',
    }));
  });

  it('shows the stored name when editing an existing PDF handout', () => {
    renderModal({
      editHandout: {
        id: 'h-1',
        title: 'Mapa',
        type: 'map',
        visibility: ['all'],
        fileUrl: '/handouts/3f9a1c.pdf',
        fileName: 'Mapa lochu.pdf',
      },
    });

    expect(screen.getByText('Mapa lochu.pdf')).toBeInTheDocument();
  });
});
