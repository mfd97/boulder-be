/// <reference path="../types/express.d.ts" />
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User';
import { generateToken } from '../utils/token';

const BCRYPT_ROUNDS = 10;

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      res.status(400).json({
        success: false,
        error: 'Full name, email, and password are required.',
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters.',
      });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      res.status(409).json({ success: false, error: 'A user with this email already exists.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    const token = generateToken(user._id, user.email);
    const userObj = user.toObject();
    delete (userObj as { password?: string }).password;

    res.status(201).json({
      success: true,
      data: {
        user: userObj,
        token,
      },
    });
  } catch (error) {
    console.error('[userController.register]', error);
    if (error instanceof Error) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: 'Registration failed.' });
    }
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const token = generateToken(user._id, user.email);
    const userObj = user.toObject();
    delete (userObj as { password?: string }).password;

    res.status(200).json({
      success: true,
      data: {
        user: userObj,
        token,
      },
    });
  } catch (error) {
    console.error('[userController.login]', error);
    res.status(500).json({ success: false, error: 'Login failed.' });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('[userController.getMe]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile.' });
  }
}

export async function getAllUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await User.find().select('-password');

    res.status(200).json({
      success: true,
      data: { users },
    });
  } catch (error) {
    console.error('[userController.getAllUsers]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    const { fullName, profilePicture } = req.body;

    const updateData: { fullName?: string; profilePicture?: string } = {};

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        res.status(400).json({ success: false, error: 'Full name must be at least 2 characters.' });
        return;
      }
      updateData.fullName = fullName.trim();
    }

    if (profilePicture !== undefined) {
      updateData.profilePicture = profilePicture;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ success: false, error: 'No valid fields to update.' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('[userController.updateProfile]', error);
    res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
}
