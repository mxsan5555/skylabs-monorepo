import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { SignIn } from './sign-in';
import { fireEvent } from '@testing-library/react';
import { users } from '../../data/users';
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('SignIn', () => {

    it('renders default phone input', () => {
        render(
            <MemoryRouter>
                <SignIn />
            </MemoryRouter>
        );

        expect(screen.getByTestId('phone-input')).not.toBeNull();
    });

    it('renders sign-in page content', () => {
        render(
            <MemoryRouter>
                <SignIn />
            </MemoryRouter>
        );

        expect(screen.getByText('MSD')).toBeTruthy();
        expect(screen.getByText('Sign in')).toBeTruthy();
        expect(
            screen.getByText('Your wellness companion')
        ).toBeTruthy();
        expect(screen.getByText('Send OTP')).toBeTruthy();
        expect(screen.getByText('Continue with Google')).toBeTruthy();
    });

    // it('shows error for invalid phone number', () => {
    //     render(
    //         <MemoryRouter>
    //             <SignIn />
    //         </MemoryRouter>
    //     );

    //     const input = screen.getByTestId('phone-input');

    //     fireEvent.input(input, {
    //         target: { value: '9876543210' }, // number not present in users
    //     });

    //     fireEvent.click(screen.getByText('Send OTP'));

    //     expect(screen.getByText(/invalid/i)).toBeTruthy();
    // });

    // it('navigates to otp page for valid phone', () => {
    //     render(
    //         <MemoryRouter>
    //             <SignIn />
    //         </MemoryRouter>
    //     );

    //     const input = screen.getByTestId('phone-input');

    //     fireEvent.input(input, {
    //         target: {
    //             value: users[0].mobile,
    //         },
    //     });

    //     fireEvent.click(screen.getByText('Send OTP'));

    //     expect(mockNavigate).toHaveBeenCalledWith(
    //         '/otp',
    //         expect.objectContaining({
    //             state: expect.objectContaining({
    //                 user: users[0],
    //                 method: 'phone',
    //                 destination: users[0].mobile,
    //             }),
    //         })
    //     );
    // });

    // it('does not navigate for invalid phone', () => {
    //     render(
    //         <MemoryRouter>
    //             <SignIn />
    //         </MemoryRouter>
    //     );

    //     const input = screen.getByTestId('phone-input');

    //     fireEvent.input(input, {
    //         target: { value: '9999999999' },
    //     });

    //     fireEvent.click(screen.getByText('Send OTP'));

    //     expect(mockNavigate).not.toHaveBeenCalled();
    // });
});