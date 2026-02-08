import { Request, Response } from 'express';
import GameSession from '../models/GameSession';
import User from '../models/User';

// Get pending game invitations for the current user
export const getPendingInvitations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const invitations = await GameSession.find({
      guestId: userId,
      status: 'waiting',
      expiresAt: { $gt: new Date() },
    })
      .populate('hostId', 'fullName email')
      .sort({ createdAt: -1 });

    const formattedInvitations = invitations.map(inv => ({
      gameId: inv._id,
      hostId: inv.hostId,
      topic: inv.topic,
      difficulty: inv.difficulty,
      rounds: inv.rounds,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    }));

    res.status(200).json({ success: true, data: formattedInvitations });
  } catch (error) {
    console.error('[getPendingInvitations] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to get invitations' });
  }
};

// Get active game for the current user
export const getActiveGame = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const game = await GameSession.findOne({
      $or: [
        { hostId: userId, status: { $in: ['waiting', 'in_progress'] } },
        { guestId: userId, status: { $in: ['waiting', 'in_progress'] } },
      ],
    })
      .populate('hostId', 'fullName email')
      .populate('guestId', 'fullName email');

    if (!game) {
      res.status(200).json({ success: true, data: null });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        gameId: game._id,
        hostId: game.hostId,
        guestId: game.guestId,
        topic: game.topic,
        difficulty: game.difficulty,
        rounds: game.rounds,
        status: game.status,
        currentQuestionIndex: game.currentQuestionIndex,
        currentRound: game.currentRound,
        hostScore: game.hostScore,
        guestScore: game.guestScore,
        totalQuestions: game.questions.length,
        createdAt: game.createdAt,
        startedAt: game.startedAt,
      },
    });
  } catch (error) {
    console.error('[getActiveGame] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to get active game' });
  }
};

// Get game by ID
export const getGameById = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const game = await GameSession.findById(id)
      .populate('hostId', 'fullName email')
      .populate('guestId', 'fullName email')
      .populate('winnerId', 'fullName email');

    if (!game) {
      res.status(404).json({ success: false, message: 'Game not found' });
      return;
    }

    // Check if user is part of this game
    const isHost = game.hostId._id.toString() === userId.toString();
    const isGuest = game.guestId?._id.toString() === userId.toString();

    if (!isHost && !isGuest) {
      res.status(403).json({ success: false, message: 'Not authorized to view this game' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        gameId: game._id,
        hostId: game.hostId,
        guestId: game.guestId,
        topic: game.topic,
        difficulty: game.difficulty,
        rounds: game.rounds,
        status: game.status,
        hostScore: game.hostScore,
        guestScore: game.guestScore,
        winnerId: game.winnerId,
        totalQuestions: game.questions.length,
        createdAt: game.createdAt,
        startedAt: game.startedAt,
        completedAt: game.completedAt,
      },
    });
  } catch (error) {
    console.error('[getGameById] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to get game' });
  }
};

// Get game history for the current user
export const getGameHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const games = await GameSession.find({
      $or: [{ hostId: userId }, { guestId: userId }],
      status: 'completed',
    })
      .populate('hostId', 'fullName email')
      .populate('guestId', 'fullName email')
      .populate('winnerId', 'fullName')
      .sort({ completedAt: -1 })
      .limit(20);

    const formattedGames = games.map(game => {
      const isHost = game.hostId._id.toString() === userId.toString();
      const myScore = isHost ? game.hostScore : game.guestScore;
      const opponentScore = isHost ? game.guestScore : game.hostScore;
      const opponent = isHost ? game.guestId : game.hostId;
      const isWinner = game.winnerId?._id.toString() === userId.toString();
      const isDraw = game.winnerId === null;

      return {
        gameId: game._id,
        topic: game.topic,
        difficulty: game.difficulty,
        rounds: game.rounds,
        myScore,
        opponentScore,
        opponent,
        result: isDraw ? 'draw' : (isWinner ? 'won' : 'lost'),
        completedAt: game.completedAt,
      };
    });

    res.status(200).json({ success: true, data: formattedGames });
  } catch (error) {
    console.error('[getGameHistory] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to get game history' });
  }
};

// Get count of pending invitations
export const getPendingCount = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const count = await GameSession.countDocuments({
      guestId: userId,
      status: 'waiting',
      expiresAt: { $gt: new Date() },
    });

    res.status(200).json({ success: true, data: count });
  } catch (error) {
    console.error('[getPendingCount] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to get pending count' });
  }
};
