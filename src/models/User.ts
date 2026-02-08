import bcrypt from 'bcrypt';
import mongoose, { Model, Schema } from 'mongoose';

export interface IUser {
  _id: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  password: string;
  profilePicture?: string;
  createdAt: Date;
  updatedAt: Date;
}



const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    profilePicture: {
      type: String,

      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const User =  mongoose.model('User', userSchema);
export default User;
