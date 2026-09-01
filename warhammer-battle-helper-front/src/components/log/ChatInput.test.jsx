import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';
import ChatInput from './ChatInput';

const field = () => document.querySelector('.chat-input__field');
const counter = () => document.querySelector('.chat-input__counter');
const sendButton = () => document.querySelector('.chat-input__send');

describe('ChatInput', () => {
    it('sends the trimmed message on Enter and clears the field', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: '  Atakuję gobliny  ' } });
        fireEvent.keyDown(field(), { key: 'Enter' });

        expect(onSend).toHaveBeenCalledWith('Atakuję gobliny');
        expect(field().value).toBe('');
    });

    it('does not send on Shift+Enter', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: 'pierwsza linia' } });
        fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });

        expect(onSend).not.toHaveBeenCalled();
        expect(field().value).toBe('pierwsza linia');
    });

    it('sends a multiline message as typed', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: 'linia1\nlinia2' } });
        fireEvent.keyDown(field(), { key: 'Enter' });

        expect(onSend).toHaveBeenCalledWith('linia1\nlinia2');
    });

    it('ignores Enter while an IME composition is active', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: 'tekst' } });
        fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });

        expect(onSend).not.toHaveBeenCalled();
    });

    it('caps input at 500 characters', () => {
        render(<ChatInput onSend={() => {}} />);
        expect(field().maxLength).toBe(500);
    });

    it('shows the counter only near the limit', () => {
        render(<ChatInput onSend={() => {}} />);

        fireEvent.change(field(), { target: { value: 'a'.repeat(10) } });
        expect(counter()).toBeNull();

        fireEvent.change(field(), { target: { value: 'a'.repeat(460) } });
        expect(counter().textContent).toBe('460/500');
    });

    it('does not send an empty or whitespace-only message', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: '   ' } });
        fireEvent.keyDown(field(), { key: 'Enter' });

        expect(onSend).not.toHaveBeenCalled();
        expect(sendButton().disabled).toBe(true);
    });
});
