export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

export const PASSWORD_POLICY = {
  minLength: 8,
  requireLowercase: true,
  requireUppercase: true,
  requireDigit: true,
  requireSymbol: false,
} as const;

/** Validate a password against the workspace policy. */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`At least ${PASSWORD_POLICY.minLength} characters`);
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("At least one lowercase letter");
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("At least one uppercase letter");
  }
  if (PASSWORD_POLICY.requireDigit && !/\d/.test(password)) {
    errors.push("At least one number");
  }
  if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("At least one special character");
  }
  return { valid: errors.length === 0, errors };
}

export function passwordHint(): string {
  const parts = [
    `${PASSWORD_POLICY.minLength}+ chars`,
    "uppercase",
    "lowercase",
    "number",
  ];
  return parts.join(", ");
}
