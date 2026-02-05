import { Request, Response } from 'express';

export const recordActiveUser = async (userId: string): Promise<void> => {
  // Placeholder analytics hook until a persistence layer exists.
  console.log(`Active user recorded: ${userId}`);
};

export const recordActiveUserHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() ?? req.body.userId;
    if (!userId) {
      res.status(400).json({ success: false, error: 'User ID is required.' });
      return;
    }

    await recordActiveUser(userId);

    res.status(200).json({ success: true, data: { userId } });
  } catch (error) {
    console.error('recordActiveUserHandler error:', error);
    res.status(500).json({ success: false, error: 'Failed to record active user.' });
  }
};
