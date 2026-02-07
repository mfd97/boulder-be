import { Request, Response } from 'express';
import Friendship from '../models/Friendship';
import User from '../models/User';
import StartNewQuiz from '../models/startnewquiz.model';
import mongoose from 'mongoose';

// Send a friend request by email
export async function sendFriendRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    // Find the recipient by email
    const recipient = await User.findOne({ email: email.toLowerCase().trim() });
    if (!recipient) {
      res.status(404).json({ success: false, error: 'User not found with that email' });
      return;
    }

    // Check if trying to add self
    if (recipient._id.toString() === userId.toString()) {
      res.status(400).json({ success: false, error: "You can't add yourself as a friend" });
      return;
    }

    // Check if friendship already exists (in either direction)
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: userId, recipient: recipient._id },
        { requester: recipient._id, recipient: userId },
      ],
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        res.status(400).json({ success: false, error: 'You are already friends' });
        return;
      }
      if (existingFriendship.status === 'pending') {
        res.status(400).json({ success: false, error: 'Friend request already pending' });
        return;
      }
      // If declined, allow re-request by updating
      existingFriendship.status = 'pending';
      existingFriendship.requester = userId;
      existingFriendship.recipient = recipient._id;
      await existingFriendship.save();
      res.status(200).json({ success: true, message: 'Friend request sent' });
      return;
    }

    // Create new friendship request
    await Friendship.create({
      requester: userId,
      recipient: recipient._id,
      status: 'pending',
    });

    res.status(201).json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ success: false, error: 'Failed to send friend request' });
  }
}

// Get pending friend requests (received)
export async function getPendingRequests(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const pendingRequests = await Friendship.find({
      recipient: userId,
      status: 'pending',
    })
      .populate('requester', 'fullName email profilePicture')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: pendingRequests });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to get pending requests' });
  }
}

// Get sent friend requests (outgoing)
export async function getSentRequests(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const sentRequests = await Friendship.find({
      requester: userId,
      status: 'pending',
    })
      .populate('recipient', 'fullName email profilePicture')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: sentRequests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to get sent requests' });
  }
}

// Accept a friend request
export async function acceptFriendRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid request ID' });
      return;
    }

    const friendship = await Friendship.findOne({
      _id: id,
      recipient: userId,
      status: 'pending',
    });

    if (!friendship) {
      res.status(404).json({ success: false, error: 'Friend request not found' });
      return;
    }

    friendship.status = 'accepted';
    friendship.acceptedAt = new Date();
    await friendship.save();

    res.status(200).json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ success: false, error: 'Failed to accept friend request' });
  }
}

// Decline a friend request
export async function declineFriendRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid request ID' });
      return;
    }

    const friendship = await Friendship.findOne({
      _id: id,
      recipient: userId,
      status: 'pending',
    });

    if (!friendship) {
      res.status(404).json({ success: false, error: 'Friend request not found' });
      return;
    }

    friendship.status = 'declined';
    await friendship.save();

    res.status(200).json({ success: true, message: 'Friend request declined' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ success: false, error: 'Failed to decline friend request' });
  }
}

// Get all accepted friends
export async function getFriends(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    })
      .populate('requester', 'fullName email profilePicture')
      .populate('recipient', 'fullName email profilePicture');

    // Extract friend info (the other user in the friendship)
    const friends = friendships.map((friendship) => {
      const friend =
        friendship.requester._id.toString() === userId.toString()
          ? friendship.recipient
          : friendship.requester;
      return {
        friendshipId: friendship._id,
        ...((friend as any).toObject ? (friend as any).toObject() : friend),
      };
    });

    res.status(200).json({ success: true, data: friends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ success: false, error: 'Failed to get friends' });
  }
}

// Remove a friend
export async function removeFriend(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid friendship ID' });
      return;
    }

    const friendship = await Friendship.findOne({
      _id: id,
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    });

    if (!friendship) {
      res.status(404).json({ success: false, error: 'Friendship not found' });
      return;
    }

    await Friendship.deleteOne({ _id: id });

    res.status(200).json({ success: true, message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove friend' });
  }
}

// Get friends leaderboard with stats
export async function getFriendsLeaderboard(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Get all accepted friendships
    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    });

    // Extract friend IDs
    const friendIds = friendships.map((f) =>
      f.requester.toString() === userId.toString() ? f.recipient : f.requester
    );

    // Include current user in leaderboard
    const allUserIds = [userId, ...friendIds];

    // Get user info for all users
    const users = await User.find({ _id: { $in: allUserIds } }).select(
      'fullName email profilePicture'
    );

    // Calculate stats for each user
    const leaderboardData = await Promise.all(
      users.map(async (user) => {
        // Get completed quizzes for this user
        const quizzes = await StartNewQuiz.find({
          userId: user._id,
          isCompleted: true,
        });

        const totalQuizzes = quizzes.length;
        const totalScore = quizzes.reduce((sum, q) => sum + (q.earnedScore || 0), 0);
        const averageScore =
          totalQuizzes > 0
            ? Math.round(
              quizzes.reduce((sum, q) => {
                const percentage = q.totalScore ? (q.earnedScore / q.totalScore) * 100 : 0;
                return sum + percentage;
              }, 0) / totalQuizzes
            )
            : 0;

        // Calculate streak
        const streak = await calculateStreak(user._id);

        return {
          userId: user._id.toString(),
          name: user.fullName,
          profilePicture: user.profilePicture,
          totalQuizzes,
          totalScore,
          averageScore,
          currentStreak: streak,
          isCurrentUser: user._id.toString() === userId.toString(),
        };
      })
    );

    // Sort by totalScore descending and add rank
    leaderboardData.sort((a, b) => b.totalScore - a.totalScore);
    const rankedLeaderboard = leaderboardData.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    res.status(200).json({ success: true, data: rankedLeaderboard });
  } catch (error) {
    console.error('Get friends leaderboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to get leaderboard' });
  }
}

// Helper function to calculate streak
async function calculateStreak(userId: mongoose.Types.ObjectId): Promise<number> {
  const quizzes = await StartNewQuiz.find({
    userId,
    isCompleted: true,
  }).sort({ completedAt: -1 });

  if (quizzes.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group quizzes by date
  const quizDates = new Set<string>();
  quizzes.forEach((q) => {
    if (q.completedAt) {
      const date = new Date(q.completedAt);
      date.setHours(0, 0, 0, 0);
      quizDates.add(date.toISOString());
    }
  });

  const sortedDates = Array.from(quizDates).sort().reverse();

  // Check if user has completed a quiz today or yesterday to continue streak
  const todayStr = today.toISOString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString();

  if (sortedDates[0] !== todayStr && sortedDates[0] !== yesterdayStr) {
    return 0; // Streak broken
  }

  // Count consecutive days
  let currentDate = sortedDates[0] === todayStr ? today : yesterday;
  for (const dateStr of sortedDates) {
    const date = new Date(dateStr);
    if (date.getTime() === currentDate.getTime()) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (date.getTime() < currentDate.getTime()) {
      break; // Gap in dates, streak ends
    }
  }

  return streak;
}

// Get pending request count (for badge)
export async function getPendingCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const count = await Friendship.countDocuments({
      recipient: userId,
      status: 'pending',
    });

    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get pending count error:', error);
    res.status(500).json({ success: false, error: 'Failed to get pending count' });
  }
}
