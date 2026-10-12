export const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
};

export const validatePhone = (value: string): boolean => {
    return /^[6-9]\d{9}$/.test(value.trim());
};