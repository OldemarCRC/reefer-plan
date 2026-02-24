// ============================================================================
// USER SERVER ACTIONS
// CRUD operations for user accounts + email confirmation flow
// ============================================================================

'use server'

import crypto from 'crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';
import { sendUserConfirmationEmail } from '@/lib/email';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const UserIdSchema = z.string().min(1, 'User ID is required');

const ROLES = ['ADMIN', 'SHIPPING_PLANNER', 'STEVEDORE', 'CHECKER', 'EXPORTER', 'VIEWER'] as const;

const CreateUserSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(ROLES),
  company: z.string().max(100).optional(),
  port: z.string().max(50).optional(),
  canSendEmailsToCaptains: z.boolean().optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  role: z.enum(ROLES).optional(),
  company: z.string().max(100).optional(),
  port: z.string().max(50).optional(),
  canSendEmailsToCaptains: z.boolean().optional(),
});

// ----------------------------------------------------------------------------
// GET ALL USERS (for admin panel)
// Excludes sensitive fields: passwordHash, sessionToken, emailConfirmToken
// ----------------------------------------------------------------------------

export async function getUsers() {
  try {
    await connectDB();

    const users = await UserModel.find()
      .sort({ name: 1 })
      .lean();

    const data = (users as any[]).map((u: any) => ({
      _id: u._id.toString(),
      email: u.email,
      name: u.name,
      role: u.role,
      company: u.company ?? '',
      port: u.port ?? '',
      canSendEmailsToCaptains: u.canSendEmailsToCaptains ?? false,
      emailConfirmed: u.emailConfirmed ?? false,
      isOnline: u.isOnline ?? false,
      lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
      createdAt: u.createdAt ? u.createdAt.toISOString() : null,
    }));

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching users:', error);
    return { success: false, data: [], error: 'Failed to fetch users' };
  }
}

// ----------------------------------------------------------------------------
// CREATE USER
// Generates a confirmation token and sends an email invitation.
// The account has no password until the user confirms via /confirm/[token].
// ----------------------------------------------------------------------------

export async function createUser(input: unknown) {
  try {
    const data = CreateUserSchema.parse(input);

    await connectDB();

    const normalizedEmail = data.email.toLowerCase().trim();
    const exists = await UserModel.findOne({ email: normalizedEmail });
    if (exists) {
      return { success: false, error: 'A user with this email already exists' };
    }

    const emailConfirmToken = crypto.randomBytes(32).toString('hex');

    const user = await UserModel.create({
      email: normalizedEmail,
      name: data.name.trim(),
      role: data.role,
      company: data.company?.trim() ?? '',
      port: data.port?.trim() ?? '',
      canSendEmailsToCaptains: data.canSendEmailsToCaptains ?? false,
      emailConfirmToken,
      emailConfirmed: false,
    });

    // Send invitation email — log but don't fail if email service is down
    try {
      await sendUserConfirmationEmail({
        to: { name: data.name.trim(), email: normalizedEmail },
        confirmToken: emailConfirmToken,
        role: data.role,
      });
    } catch (emailErr) {
      console.error('[createUser] confirmation email failed:', emailErr);
    }

    return {
      success: true,
      data: {
        _id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.company ?? '',
        port: user.port ?? '',
        canSendEmailsToCaptains: user.canSendEmailsToCaptains ?? false,
        emailConfirmed: false,
        isOnline: false,
        lastLogin: null,
        createdAt: user.createdAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error creating user:', error);
    return { success: false, error: 'Failed to create user' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE USER
// Only mutable fields — email is immutable after creation.
// ----------------------------------------------------------------------------

export async function updateUser(id: unknown, input: unknown) {
  try {
    const userId = UserIdSchema.parse(id);
    const data = UpdateUserSchema.parse(input);

    await connectDB();

    const update: Record<string, any> = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.role !== undefined) update.role = data.role;
    if (data.company !== undefined) update.company = data.company.trim();
    if (data.port !== undefined) update.port = data.port.trim();
    if (data.canSendEmailsToCaptains !== undefined) update.canSendEmailsToCaptains = data.canSendEmailsToCaptains;

    const user = await UserModel.findByIdAndUpdate(userId, update, { new: true }).lean() as any;
    if (!user) return { success: false, error: 'User not found' };

    return {
      success: true,
      data: {
        _id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.company ?? '',
        port: user.port ?? '',
        canSendEmailsToCaptains: user.canSendEmailsToCaptains ?? false,
        emailConfirmed: user.emailConfirmed ?? false,
        isOnline: user.isOnline ?? false,
        lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
        createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error updating user:', error);
    return { success: false, error: 'Failed to update user' };
  }
}

// ----------------------------------------------------------------------------
// DELETE USER
// Guarded: cannot delete the last ADMIN account.
// ----------------------------------------------------------------------------

export async function deleteUser(id: unknown) {
  try {
    const userId = UserIdSchema.parse(id);

    await connectDB();

    const user = await UserModel.findById(userId).lean() as any;
    if (!user) return { success: false, error: 'User not found' };

    if (user.role === 'ADMIN') {
      const adminCount = await UserModel.countDocuments({ role: 'ADMIN' });
      if (adminCount <= 1) {
        return { success: false, error: 'Cannot delete the last administrator account' };
      }
    }

    await UserModel.findByIdAndDelete(userId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting user:', error);
    return { success: false, error: 'Failed to delete user' };
  }
}

// ----------------------------------------------------------------------------
// RESEND CONFIRMATION EMAIL
// Regenerates the token and resends the invitation.
// ----------------------------------------------------------------------------

export async function resendUserConfirmation(id: unknown) {
  try {
    const userId = UserIdSchema.parse(id);

    await connectDB();

    const user = await UserModel.findById(userId).lean() as any;
    if (!user) return { success: false, error: 'User not found' };
    if (user.emailConfirmed) return { success: false, error: 'Account is already confirmed' };

    const emailConfirmToken = crypto.randomBytes(32).toString('hex');
    await UserModel.findByIdAndUpdate(userId, { emailConfirmToken });

    try {
      await sendUserConfirmationEmail({
        to: { name: user.name, email: user.email },
        confirmToken: emailConfirmToken,
        role: user.role,
      });
    } catch (emailErr) {
      console.error('[resendUserConfirmation] email failed:', emailErr);
      return { success: false, error: 'Failed to send confirmation email' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error resending confirmation:', error);
    return { success: false, error: 'Failed to resend confirmation' };
  }
}

// ----------------------------------------------------------------------------
// CHANGE PASSWORD (for logged-in users)
// Verifies the current password before allowing the change.
// ----------------------------------------------------------------------------

export async function changePassword(userId: unknown, currentPassword: unknown, newPassword: unknown) {
  try {
    const uid  = UserIdSchema.parse(userId);
    const curr = z.string().min(1, 'Current password is required').parse(currentPassword);
    const next = z.string().min(8, 'New password must be at least 8 characters').parse(newPassword);

    await connectDB();

    const user = await UserModel.findById(uid).select('+passwordHash').lean() as any;
    if (!user) return { success: false, error: 'User not found' };

    const valid = await bcrypt.compare(curr, user.passwordHash ?? '');
    if (!valid) return { success: false, error: 'Current password is incorrect' };

    const passwordHash = await bcrypt.hash(next, 12);
    await UserModel.findByIdAndUpdate(uid, { passwordHash });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error changing password:', error);
    return { success: false, error: 'Failed to change password' };
  }
}

// ----------------------------------------------------------------------------
// CONFIRM USER ACCOUNT
// Called from the /confirm/[token] page.
// Validates the token, hashes the new password, activates the account.
// ----------------------------------------------------------------------------

export async function confirmUserAccount(token: unknown, newPassword: unknown) {
  try {
    const tok = z.string().min(32, 'Invalid confirmation token').parse(token);
    const pwd = z.string().min(8, 'Password must be at least 8 characters').parse(newPassword);

    await connectDB();

    const user = await UserModel
      .findOne({ emailConfirmToken: tok })
      .select('+emailConfirmToken')
      .lean() as any;

    if (!user) return { success: false, error: 'Invalid or expired confirmation link' };
    if (user.emailConfirmed) return { success: false, error: 'This account has already been confirmed. Please log in.' };

    const passwordHash = await bcrypt.hash(pwd, 12);

    await UserModel.findByIdAndUpdate(user._id, {
      passwordHash,
      emailConfirmed: true,
      $unset: { emailConfirmToken: '' },
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error confirming user account:', error);
    return { success: false, error: 'Failed to confirm account' };
  }
}
