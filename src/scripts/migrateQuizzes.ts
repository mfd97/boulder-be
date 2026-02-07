/**
 * Migration script to assign existing quizzes to a specific user.
 * 
 * Run with: npx ts-node src/scripts/migrateQuizzes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import StartNewQuiz from '../models/startnewquiz.model';

dotenv.config();

const TARGET_EMAIL = 'm@m.com';

async function migrateQuizzes() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB');

        // Find the target user
        const user = await User.findOne({ email: TARGET_EMAIL });
        if (!user) {
            console.error(`User with email "${TARGET_EMAIL}" not found!`);
            process.exit(1);
        }
        console.log(`Found user: ${user.fullName} (${user.email}) - ID: ${user._id}`);

        // Find all quizzes without a userId
        const quizzesWithoutUser = await StartNewQuiz.find({ userId: { $exists: false } });
        console.log(`Found ${quizzesWithoutUser.length} quizzes without a userId`);

        if (quizzesWithoutUser.length === 0) {
            console.log('No quizzes to migrate. All quizzes already have a userId.');
            process.exit(0);
        }

        // Update all quizzes to belong to the target user
        const result = await StartNewQuiz.updateMany(
            { userId: { $exists: false } },
            { $set: { userId: user._id } }
        );

        console.log(`Successfully updated ${result.modifiedCount} quizzes to belong to ${TARGET_EMAIL}`);

        // Verify the migration
        const remainingWithoutUser = await StartNewQuiz.countDocuments({ userId: { $exists: false } });
        console.log(`Quizzes still without userId: ${remainingWithoutUser}`);

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateQuizzes();
