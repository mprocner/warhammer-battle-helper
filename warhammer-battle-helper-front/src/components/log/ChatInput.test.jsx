/* eslint-disable testing-library/no-node-access -- the chat DOM is asserted by BEM class, as in the pre-existing helpers */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import '../../i18n';
import ChatInput from './ChatInput';

const field = () => document.querySelector('.chat-input__field');
const counter = () => document.querySelector('.chat-input__counter');
const sendButton = () => document.querySelector('.chat-input__send');
const errorLine = () => document.querySelector('.chat-input__error');
const noticeLine = () => document.querySelector('.chat-input__notice');
const hintItems = () => document.querySelectorAll('.chat-commands-popup--hints .chat-commands-popup__item');
const helpPanel = () => document.querySelector('.chat-commands-popup--help');

const ok = () => jest.fn().mockResolvedValue({ ok: true });
const type = (value) => fireEvent.change(field(), { target: { value } });
const key = (k, init = {}) => fireEvent.keyDown(field(), { key: k, ...init });

const send = async (value) => {
    type(value);
    key('Enter');
    await waitFor(() => expect(field().value).toBe(''));
};

describe('ChatInput', () => {
    it('submits the trimmed message on Enter and clears the field', async () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('  Atakuję gobliny  ');
        key('Enter');

        expect(onSubmit).toHaveBeenCalledWith('Atakuję gobliny');
        await waitFor(() => expect(field().value).toBe(''));
    });

    it('does not submit on Shift+Enter', () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('pierwsza linia');
        key('Enter', { shiftKey: true });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(field().value).toBe('pierwsza linia');
    });

    it('submits a multiline message as typed', async () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        await send('linia1\nlinia2');

        expect(onSubmit).toHaveBeenCalledWith('linia1\nlinia2');
    });

    it('ignores Enter while an IME composition is active', () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('tekst');
        key('Enter', { isComposing: true });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('caps input at 500 characters', () => {
        render(<ChatInput onSubmit={ok()} />);
        expect(field().maxLength).toBe(500);
    });

    it('shows the counter only near the limit', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('a'.repeat(10));
        expect(counter()).toBeNull();

        type('a'.repeat(460));
        expect(counter().textContent).toBe('460/500');
    });

    it('does not submit an empty or whitespace-only message', () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('   ');
        key('Enter');

        expect(onSubmit).not.toHaveBeenCalled();
        expect(sendButton().disabled).toBe(true);
    });

    it('ignores a second Enter while the first submit is pending', () => {
        const onSubmit = jest.fn(() => new Promise(() => {}));
        render(<ChatInput onSubmit={onSubmit} />);

        type('/r d6');
        key('Enter');
        key('Enter');

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('keeps the text and shows the error when the submit fails', async () => {
        const onSubmit = jest.fn().mockResolvedValue({
            ok: false,
            error: { key: 'chat.commands.errors.unknown', params: { name: 'xyz' } },
        });
        render(<ChatInput onSubmit={onSubmit} />);

        type('/xyz');
        key('Enter');

        await waitFor(() => expect(errorLine()).not.toBeNull());
        expect(errorLine().textContent).toContain('/xyz');
        expect(field().value).toBe('/xyz');

        type('/xy');
        expect(errorLine()).toBeNull();
    });

    it('suggests commands while a bare /name is typed and completes with Tab', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('/g');
        expect(hintItems()).toHaveLength(1);

        key('Tab');
        expect(field().value).toBe('/gmroll ');
        expect(hintItems()).toHaveLength(0); // a space ends the bare name
    });

    it('completes a command picked with the mouse', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('/');
        fireEvent.mouseDown(hintItems()[0]);

        expect(field().value).toBe('/roll ');
    });

    it('hides the hints on Escape until the text changes', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('/');
        key('Escape');
        expect(hintItems()).toHaveLength(0);

        type('/r');
        expect(hintItems()).toHaveLength(1);
    });

    it('opens the help panel when the submit asks for it and closes it on Escape', async () => {
        const onSubmit = jest.fn().mockResolvedValue({ ok: true, effect: 'help' });
        render(<ChatInput onSubmit={onSubmit} />);

        await send('/help');
        expect(helpPanel()).not.toBeNull();

        key('Escape');
        expect(helpPanel()).toBeNull();
    });

    it('recalls sent lines with ArrowUp / ArrowDown on an empty field', async () => {
        render(<ChatInput onSubmit={ok()} />);
        await send('pierwsza');
        await send('/r 2d6');

        key('ArrowUp');
        expect(field().value).toBe('/r 2d6');
        key('ArrowUp');
        expect(field().value).toBe('pierwsza');
        key('ArrowDown');
        expect(field().value).toBe('/r 2d6');
        key('ArrowDown');
        expect(field().value).toBe('');
    });

    it('leaves ArrowUp alone while the user edits their own text', async () => {
        render(<ChatInput onSubmit={ok()} />);
        await send('stara');

        type('linia1\nlinia2');
        key('ArrowUp');

        expect(field().value).toBe('linia1\nlinia2');
    });

    it('keeps text typed while a submit is still pending', async () => {
        let resolveSubmit;
        const onSubmit = jest.fn(() => new Promise((resolve) => { resolveSubmit = resolve; }));
        render(<ChatInput onSubmit={onSubmit} />);

        type('/r d6');
        key('Enter');
        type('nowy tekst');
        await act(async () => { resolveSubmit({ ok: true }); });

        await waitFor(() => expect(field().value).toBe('nowy tekst'));
    });

    it('shows a notice after a secret roll and drops it on the next keystroke', async () => {
        const onSubmit = jest.fn().mockResolvedValue({ ok: true, effect: 'secretRoll' });
        render(<ChatInput onSubmit={onSubmit} />);

        await send('/gmr d20');
        expect(noticeLine()).not.toBeNull();
        expect(noticeLine().textContent.trim()).not.toBe('');

        type('a');
        expect(noticeLine()).toBeNull();
    });

    it('shows no notice after a plain successful submit', async () => {
        render(<ChatInput onSubmit={ok()} />);

        await send('hej');

        expect(noticeLine()).toBeNull();
    });
});
