import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IFriendship {
  _id: Types.ObjectId;
  requester: Types.ObjectId;  // User who sent request
  recipient: Types.ObjectId;  // User who receives request
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
  acceptedAt?: Date;
}

const friendshipSchema = new Schema<IFriendship>(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

const Friendship: Model<IFriendship> =
  mongoose.models.Friendship ?? mongoose.model<IFriendship>('Friendship', friendshipSchema);

export default Friendship;
