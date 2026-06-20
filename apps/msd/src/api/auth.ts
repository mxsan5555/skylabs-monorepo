import { apiClient } from "./api-client";

export const registerUser = async (payload: any) => {
     return apiClient.post('/auth/register', payload);
};

export const sendMailOtp = async (email: string) => {
     return apiClient.post('/auth/send-mail-otp', { email });
};

export const sendMobileOtp = async (mobile: string) => {
     return apiClient.post('/mobile-otp/send', { mobile });
};

export const verifyMailOtp = async (email: string, otp: string) => {
     return apiClient.post('/auth/verify-mail-otp', { email, otp });
};

export const verifyMobileOtp = async (mobile: string, otp: string) => {
     return apiClient.post('/mobile-otp/verify', { mobile, otp });
};