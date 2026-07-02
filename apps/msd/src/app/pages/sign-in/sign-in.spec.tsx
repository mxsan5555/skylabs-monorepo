import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SignIn from './sign-in';
import { copy } from '../../../copy/copy';

const renderUI = () =>
    render(
        <BrowserRouter>
            <SignIn />
        </BrowserRouter>
    );

describe('SignIn', () => {
    test('should render Sign In page', () => {
        renderUI();
        expect(screen.getByText(copy.signIn.title)).toBeTruthy();
    });

    test('should show phone input by default', () => {
        renderUI();

        const input = screen.getByTestId('phone-input');

        expect(input).toBeTruthy();
    });

    test('should allow only 10 digits', () => {
        renderUI();

        const input = screen.getByTestId('phone-input');

        fireEvent.input(input, {
            target: { value: '123456789012345' },
        });

        expect((input as HTMLInputElement).value.length).toBe(10);
    });

    test('should show error for invalid phone number', () => {
        renderUI();

       const input = screen.getByTestId('phone-input');
        const button = screen.getByText(copy.signIn.sendOtp);

        fireEvent.input(input, {
            target: { value: '123' },
        });

        fireEvent.click(button);

        expect(
            screen.getByText(copy.errors.invalidPhone)
        ).toBeTruthy();
    });
});