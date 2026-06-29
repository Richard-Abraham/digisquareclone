import { z } from "zod";
import { PRIORITIES } from "@/types";

export const emailSchema = z.string().email("Please enter a valid email address").min(1, "Email is required");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: z.string().min(1, "Display name is required"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  token: z.string().min(1, "Reset token is required"),
});

export const profileUpdateSchema = z.object({
  display_name: z.string().min(1, "Display name is required").max(100, "Display name is too long"),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(100, "Workspace name is too long"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50, "Slug is too long")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
});

export const projectCreateSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100, "Project name is too long"),
  identifier: z
    .string()
    .min(1, "Project code is required")
    .max(10, "Project code is too long")
    .regex(/^[A-Z0-9]+$/, "Project code must be uppercase letters and numbers"),
  description: z.string().max(500, "Description is too long").optional(),
});

export const issueCreateSchema = z.object({
  name: z.string().min(1, "Issue title is required").max(500, "Issue title is too long"),
  description_html: z.string().max(50_000, "Description is too long").optional(),
  priority: z.enum(PRIORITIES as [string, ...string[]]).optional().default("none"),
  state_id: z.string().uuid("State is required"),
  assignee_ids: z.array(z.string().uuid()).optional().default([]),
  reviewer_ids: z.array(z.string().uuid()).optional().default([]),
  tag_ids: z.array(z.string().uuid()).optional().default([]),
  target_date: z.string().datetime().optional().nullable(),
  start_date: z.string().datetime().optional().nullable(),
  is_bug: z.boolean().optional().default(false),
});

export const tagCreateSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(50, "Tag name is too long"),
  kind: z.string().max(50, "Kind is too long").optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type IssueCreateInput = z.infer<typeof issueCreateSchema>;
export type TagCreateInput = z.infer<typeof tagCreateSchema>;

export function parseBody<T>(body: unknown, schema: z.ZodSchema<T>): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return { success: false, error: `${first.path.join(".")}: ${first.message}` };
  }
  return { success: true, data: result.data };
}
