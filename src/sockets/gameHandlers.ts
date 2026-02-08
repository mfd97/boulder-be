import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import GameSession from '../models/GameSession';
import User from '../models/User';
import Friendship from '../models/Friendship';
import { generateQuizQuestions } from '../services/openrouter';

// Track connected users: Map<userId, socketId>
const connectedUsers = new Map<string, string>();

// Timer for each game: Map<gameId, NodeJS.Timeout>
const gameTimers = new Map<string, NodeJS.Timeout>();

const QUESTION_TIME_MS = 20000; // 20 seconds per question
const SPEED_BONUS_THRESHOLD_MS = 5000; // 5 seconds for speed bonus

export function setupGameHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    console.log(`[socket.io] User connected: ${userId}`);
    
    // Track user connection
    connectedUsers.set(userId, socket.id);
    
    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[socket.io] User disconnected: ${userId}`);
      connectedUsers.delete(userId);
    });

    // Create a new game
    socket.on('game:create', async (data: {
      topic: string;
      difficulty: 'easy' | 'medium' | 'hard';
      rounds: number;
      guestId: string;
    }) => {
      try {
        const { topic, difficulty, rounds, guestId } = data;

        // Validate rounds
        if (rounds < 1 || rounds > 3) {
          socket.emit('game:error', { message: 'Rounds must be between 1 and 3' });
          return;
        }

        // Convert string IDs to ObjectId for proper MongoDB comparison
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const guestObjectId = new mongoose.Types.ObjectId(guestId);

        // Check if guest is a friend
        const friendship = await Friendship.findOne({
          $or: [
            { requester: userObjectId, recipient: guestObjectId, status: 'accepted' },
            { requester: guestObjectId, recipient: userObjectId, status: 'accepted' },
          ],
        });

        console.log(`[game:create] Checking friendship between ${userId} and ${guestId}:`, friendship);

        if (!friendship) {
          socket.emit('game:error', { message: 'You can only invite friends to play' });
          return;
        }

        // Cancel any existing game between these two players (stale from disconnect, etc.)
        const staleGames = await GameSession.find({
          $or: [
            { hostId: userObjectId, guestId: guestObjectId, status: { $in: ['waiting', 'in_progress'] } },
            { hostId: guestObjectId, guestId: userObjectId, status: { $in: ['waiting', 'in_progress'] } },
          ],
        });

        if (staleGames.length > 0) {
          await GameSession.updateMany(
            { _id: { $in: staleGames.map((g) => g._id) } },
            { $set: { status: 'cancelled' } }
          );
          console.log(`[game:create] Cancelled ${staleGames.length} stale game(s) between ${userId} and ${guestId}`);
        }

        // Block only if either player is in an active game with someone else
        const existingGameWithOthers = await GameSession.findOne({
          status: { $in: ['waiting', 'in_progress'] },
          $or: [
            { hostId: userObjectId, guestId: { $ne: guestObjectId } },
            { guestId: userObjectId, hostId: { $ne: guestObjectId } },
            { hostId: guestObjectId, guestId: { $ne: userObjectId } },
            { guestId: guestObjectId, hostId: { $ne: userObjectId } },
          ],
        });

        if (existingGameWithOthers) {
          socket.emit('game:error', { message: 'You or your friend is already in an active game with someone else' });
          return;
        }

        // Generate questions for all rounds
        const totalQuestions = rounds * 5;
        const { questions } = await generateQuizQuestions(topic, difficulty, []);
        
        // Take only the needed questions (the generator returns 5 by default, we may need more)
        const gameQuestions = questions.slice(0, totalQuestions);

        // Create game session
        const game = await GameSession.create({
          hostId: userObjectId,
          guestId: guestObjectId,
          topic,
          difficulty,
          rounds,
          questions: gameQuestions,
          status: 'waiting',
        });

        // Get host and guest info
        const [host, guest] = await Promise.all([
          User.findById(userId).select('fullName email'),
          User.findById(guestId).select('fullName email'),
        ]);

        // Join the game room
        socket.join(`game:${game._id}`);

        // Emit to host that game was created
        socket.emit('game:created', {
          gameId: game._id,
          topic,
          difficulty,
          rounds,
          guestName: guest?.fullName || 'Unknown',
          status: 'waiting',
        });

        // Send invitation to guest
        io.to(`user:${guestId}`).emit('game:invitation', {
          gameId: game._id,
          hostId: userId,
          hostName: host?.fullName || 'Unknown',
          topic,
          difficulty,
          rounds,
        });

        console.log(`[game] Game ${game._id} created by ${userId}, invitation sent to ${guestId}`);
      } catch (error) {
        console.error('[game:create] Error:', error);
        socket.emit('game:error', { message: 'Failed to create game' });
      }
    });

    // Accept game invitation
    socket.on('game:accept', async (data: { gameId: string }) => {
      try {
        const { gameId } = data;

        const game = await GameSession.findById(gameId);
        if (!game) {
          socket.emit('game:error', { message: 'Game not found' });
          return;
        }

        if (game.guestId?.toString() !== userId) {
          socket.emit('game:error', { message: 'You are not invited to this game' });
          return;
        }

        if (game.status !== 'waiting') {
          socket.emit('game:error', { message: 'Game is no longer available' });
          return;
        }

        // Update game status
        game.status = 'in_progress';
        game.startedAt = new Date();
        game.currentQuestionIndex = 0;
        game.currentRound = 1;
        await game.save();

        // Join the game room
        socket.join(`game:${gameId}`);

        // Get player info
        const [host, guest] = await Promise.all([
          User.findById(game.hostId).select('fullName'),
          User.findById(game.guestId).select('fullName'),
        ]);

        // Notify both players that game is starting
        io.to(`game:${gameId}`).emit('game:started', {
          gameId,
          topic: game.topic,
          difficulty: game.difficulty,
          rounds: game.rounds,
          totalQuestions: game.questions.length,
          hostName: host?.fullName || 'Unknown',
          guestName: guest?.fullName || 'Unknown',
        });

        // Start the first question after a brief delay
        setTimeout(() => {
          sendNextQuestion(io, gameId);
        }, 3000); // 3 second countdown before first question

        console.log(`[game] Game ${gameId} started`);
      } catch (error) {
        console.error('[game:accept] Error:', error);
        socket.emit('game:error', { message: 'Failed to accept game' });
      }
    });

    // Decline game invitation
    socket.on('game:decline', async (data: { gameId: string }) => {
      try {
        const { gameId } = data;

        const game = await GameSession.findById(gameId);
        if (!game) {
          socket.emit('game:error', { message: 'Game not found' });
          return;
        }

        if (game.guestId?.toString() !== userId) {
          socket.emit('game:error', { message: 'You are not invited to this game' });
          return;
        }

        game.status = 'cancelled';
        await game.save();

        // Notify host that invitation was declined
        io.to(`user:${game.hostId}`).emit('game:declined', {
          gameId,
        });

        console.log(`[game] Game ${gameId} declined by ${userId}`);
      } catch (error) {
        console.error('[game:decline] Error:', error);
        socket.emit('game:error', { message: 'Failed to decline game' });
      }
    });

    // Submit answer
    socket.on('game:answer', async (data: { gameId: string; answer: string }) => {
      try {
        const { gameId, answer } = data;

        const game = await GameSession.findById(gameId);
        if (!game) {
          socket.emit('game:error', { message: 'Game not found' });
          return;
        }

        if (game.status !== 'in_progress') {
          socket.emit('game:error', { message: 'Game is not in progress' });
          return;
        }

        const isHost = game.hostId.toString() === userId;
        const isGuest = game.guestId?.toString() === userId;

        if (!isHost && !isGuest) {
          socket.emit('game:error', { message: 'You are not part of this game' });
          return;
        }

        const questionIndex = game.currentQuestionIndex;
        const currentQuestion = game.questions[questionIndex];

        // Check if player already answered this question
        const playerAnswers = isHost ? game.hostAnswers : game.guestAnswers;
        const alreadyAnswered = playerAnswers.some(a => a.questionIndex === questionIndex);

        if (alreadyAnswered) {
          socket.emit('game:error', { message: 'Already answered this question' });
          return;
        }

        // Calculate time taken
        const now = new Date();
        const timeMs = game.questionStartTime 
          ? now.getTime() - game.questionStartTime.getTime() 
          : QUESTION_TIME_MS;

        // Check if answer is correct
        const isCorrect = answer === currentQuestion.correct_answer;

        // Calculate score (base score + speed bonus)
        let score = 0;
        if (isCorrect) {
          score = currentQuestion.score;
          if (timeMs < SPEED_BONUS_THRESHOLD_MS) {
            score += 1; // Speed bonus
          }
        }

        // Save answer
        const answerRecord = {
          questionIndex,
          answer,
          isCorrect,
          timeMs,
          score,
        };

        if (isHost) {
          game.hostAnswers.push(answerRecord);
          game.hostScore += score;
        } else {
          game.guestAnswers.push(answerRecord);
          game.guestScore += score;
        }

        await game.save();

        // Notify opponent that player answered (don't reveal answer)
        const opponentId = isHost ? game.guestId : game.hostId;
        io.to(`user:${opponentId}`).emit('game:opponent_answered', {
          gameId,
          questionIndex,
        });

        // Check if both players have answered
        const hostAnswered = game.hostAnswers.some(a => a.questionIndex === questionIndex);
        const guestAnswered = game.guestAnswers.some(a => a.questionIndex === questionIndex);

        if (hostAnswered && guestAnswered) {
          // Clear the timer
          const timer = gameTimers.get(gameId);
          if (timer) {
            clearTimeout(timer);
            gameTimers.delete(gameId);
          }

          // Check if round/game is complete
          await checkGameProgress(io, gameId);
        }

        console.log(`[game] Player ${userId} answered question ${questionIndex} in game ${gameId}`);
      } catch (error) {
        console.error('[game:answer] Error:', error);
        socket.emit('game:error', { message: 'Failed to submit answer' });
      }
    });

    // Cancel/leave game
    socket.on('game:leave', async (data: { gameId: string }) => {
      try {
        const { gameId } = data;

        const game = await GameSession.findById(gameId);
        if (!game) {
          socket.emit('game:error', { message: 'Game not found' });
          return;
        }

        const isHost = game.hostId.toString() === userId;
        const isGuest = game.guestId?.toString() === userId;

        if (!isHost && !isGuest) {
          socket.emit('game:error', { message: 'You are not part of this game' });
          return;
        }

        // If game is waiting, just cancel
        if (game.status === 'waiting') {
          game.status = 'cancelled';
          await game.save();

          // Notify the other player
          const otherId = isHost ? game.guestId : game.hostId;
          io.to(`user:${otherId}`).emit('game:cancelled', { gameId });
        } else if (game.status === 'in_progress') {
          // Player forfeits - other player wins
          game.status = 'completed';
          game.completedAt = new Date();
          game.winnerId = isHost ? game.guestId : game.hostId;
          await game.save();

          // Clear timer
          const timer = gameTimers.get(gameId);
          if (timer) {
            clearTimeout(timer);
            gameTimers.delete(gameId);
          }

          // Notify both players
          io.to(`game:${gameId}`).emit('game:finished', {
            gameId,
            winnerId: game.winnerId,
            hostScore: game.hostScore,
            guestScore: game.guestScore,
            forfeit: true,
            forfeitedBy: userId,
          });
        }

        socket.leave(`game:${gameId}`);
        console.log(`[game] Player ${userId} left game ${gameId}`);
      } catch (error) {
        console.error('[game:leave] Error:', error);
        socket.emit('game:error', { message: 'Failed to leave game' });
      }
    });
  });
}

// Send the next question to both players
async function sendNextQuestion(io: Server, gameId: string) {
  try {
    const game = await GameSession.findById(gameId);
    if (!game || game.status !== 'in_progress') return;

    const questionIndex = game.currentQuestionIndex;
    const currentQuestion = game.questions[questionIndex];

    if (!currentQuestion) {
      // No more questions - this shouldn't happen normally
      await finishGame(io, gameId);
      return;
    }

    // Update question start time
    game.questionStartTime = new Date();
    await game.save();

    // Calculate round and question within round
    const round = Math.floor(questionIndex / 5) + 1;
    const questionInRound = (questionIndex % 5) + 1;

    // Send question to both players (without correct answer)
    io.to(`game:${gameId}`).emit('game:question', {
      gameId,
      questionIndex,
      round,
      questionInRound,
      totalRounds: game.rounds,
      question: currentQuestion.question,
      options: currentQuestion.options,
      timeLimit: QUESTION_TIME_MS,
      hostScore: game.hostScore,
      guestScore: game.guestScore,
    });

    // Set timer for question timeout
    const timer = setTimeout(async () => {
      await handleQuestionTimeout(io, gameId, questionIndex);
    }, QUESTION_TIME_MS);

    gameTimers.set(gameId, timer);

    console.log(`[game] Question ${questionIndex + 1}/${game.questions.length} sent for game ${gameId}`);
  } catch (error) {
    console.error('[sendNextQuestion] Error:', error);
  }
}

// Handle when question timer expires
async function handleQuestionTimeout(io: Server, gameId: string, questionIndex: number) {
  try {
    const game = await GameSession.findById(gameId);
    if (!game || game.status !== 'in_progress') return;

    // Only handle if we're still on this question
    if (game.currentQuestionIndex !== questionIndex) return;

    const currentQuestion = game.questions[questionIndex];

    // Add timeout answers for players who didn't answer
    const hostAnswered = game.hostAnswers.some(a => a.questionIndex === questionIndex);
    const guestAnswered = game.guestAnswers.some(a => a.questionIndex === questionIndex);

    if (!hostAnswered) {
      game.hostAnswers.push({
        questionIndex,
        answer: '',
        isCorrect: false,
        timeMs: QUESTION_TIME_MS,
        score: 0,
      });
    }

    if (!guestAnswered) {
      game.guestAnswers.push({
        questionIndex,
        answer: '',
        isCorrect: false,
        timeMs: QUESTION_TIME_MS,
        score: 0,
      });
    }

    await game.save();

    // Notify players of timeout
    io.to(`game:${gameId}`).emit('game:timeout', {
      gameId,
      questionIndex,
      correctAnswer: currentQuestion.correct_answer,
    });

    // Check game progress
    await checkGameProgress(io, gameId);

    console.log(`[game] Question ${questionIndex} timed out for game ${gameId}`);
  } catch (error) {
    console.error('[handleQuestionTimeout] Error:', error);
  }
}

// Check if round or game is complete
async function checkGameProgress(io: Server, gameId: string) {
  try {
    const game = await GameSession.findById(gameId);
    if (!game) return;

    const questionIndex = game.currentQuestionIndex;
    const totalQuestions = game.questions.length;
    const currentQuestion = game.questions[questionIndex];

    // Get answers for this question
    const hostAnswer = game.hostAnswers.find(a => a.questionIndex === questionIndex);
    const guestAnswer = game.guestAnswers.find(a => a.questionIndex === questionIndex);

    // Send answer result to both players
    io.to(`game:${gameId}`).emit('game:answer_result', {
      gameId,
      questionIndex,
      correctAnswer: currentQuestion.correct_answer,
      hostAnswer: hostAnswer?.answer || '',
      hostCorrect: hostAnswer?.isCorrect || false,
      hostScore: game.hostScore,
      guestAnswer: guestAnswer?.answer || '',
      guestCorrect: guestAnswer?.isCorrect || false,
      guestScore: game.guestScore,
    });

    // Check if this was the last question
    if (questionIndex >= totalQuestions - 1) {
      await finishGame(io, gameId);
      return;
    }

    // Check if round is complete (every 5 questions)
    if ((questionIndex + 1) % 5 === 0) {
      const round = Math.floor(questionIndex / 5) + 1;
      
      // Send round result
      io.to(`game:${gameId}`).emit('game:round_result', {
        gameId,
        round,
        hostScore: game.hostScore,
        guestScore: game.guestScore,
        nextRound: round + 1,
      });

      // Update current round
      game.currentRound = round + 1;
    }

    // Move to next question
    game.currentQuestionIndex = questionIndex + 1;
    await game.save();

    // Send next question after a delay
    setTimeout(() => {
      sendNextQuestion(io, gameId);
    }, 3000); // 3 second delay between questions
  } catch (error) {
    console.error('[checkGameProgress] Error:', error);
  }
}

// Finish the game and determine winner
async function finishGame(io: Server, gameId: string) {
  try {
    const game = await GameSession.findById(gameId);
    if (!game) return;

    game.status = 'completed';
    game.completedAt = new Date();

    // Determine winner
    if (game.hostScore > game.guestScore) {
      game.winnerId = game.hostId;
    } else if (game.guestScore > game.hostScore) {
      game.winnerId = game.guestId;
    } else {
      game.winnerId = null; // Draw
    }

    await game.save();

    // Get player names
    const [host, guest] = await Promise.all([
      User.findById(game.hostId).select('fullName'),
      User.findById(game.guestId).select('fullName'),
    ]);

    // Send final results
    io.to(`game:${gameId}`).emit('game:finished', {
      gameId,
      winnerId: game.winnerId,
      winnerName: game.winnerId 
        ? (game.winnerId.equals(game.hostId) ? host?.fullName : guest?.fullName)
        : null,
      isDraw: game.winnerId === null,
      hostId: game.hostId,
      hostName: host?.fullName || 'Unknown',
      hostScore: game.hostScore,
      guestId: game.guestId,
      guestName: guest?.fullName || 'Unknown',
      guestScore: game.guestScore,
      totalQuestions: game.questions.length,
    });

    // Clear any remaining timer
    const timer = gameTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      gameTimers.delete(gameId);
    }

    console.log(`[game] Game ${gameId} finished. Winner: ${game.winnerId || 'Draw'}`);
  } catch (error) {
    console.error('[finishGame] Error:', error);
  }
}
