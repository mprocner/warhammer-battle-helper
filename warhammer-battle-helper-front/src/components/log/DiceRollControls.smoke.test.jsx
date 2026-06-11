import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import DiceRollControls from './DiceRollControls';

describe('DiceRollControls custom roll', () => {
    it('rolls a single preset die when no custom count is set', () => {
        const onRoll = jest.fn();
        render(<DiceRollControls onRoll={onRoll} onSendMessage={() => {}} />);
        fireEvent.click(screen.getByText('D6'));
        expect(onRoll).toHaveBeenCalledWith(6, 1);
    });

    it('opens custom popup, rolls XDY', () => {
        const onRoll = jest.fn();
        render(<DiceRollControls onRoll={onRoll} onSendMessage={() => {}} />);

        // open popup
        const toggle = document.querySelector('.dice-controls__dice-toggle');
        fireEvent.click(toggle);

        const inputs = document.querySelectorAll('.dice-controls__custom-popup-input');
        fireEvent.change(inputs[0], { target: { value: '3' } }); // X
        fireEvent.change(inputs[1], { target: { value: '5' } }); // Y

        fireEvent.click(screen.getByText('Roll'));
        expect(onRoll).toHaveBeenCalledWith(5, 3);
    });

    it('uses custom count X when clicking a preset die', () => {
        const onRoll = jest.fn();
        render(<DiceRollControls onRoll={onRoll} onSendMessage={() => {}} />);

        const toggle = document.querySelector('.dice-controls__dice-toggle');
        fireEvent.click(toggle);
        const inputs = document.querySelectorAll('.dice-controls__custom-popup-input');
        fireEvent.change(inputs[0], { target: { value: '3' } }); // X

        fireEvent.click(screen.getByText('D8'));
        expect(onRoll).toHaveBeenCalledWith(8, 3);

        // X persists - badge still shown
        expect(document.querySelector('.dice-controls__count-badge')).not.toBeNull();
    });
});
