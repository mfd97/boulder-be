import { Router } from "express";
import { createQuiz, getQuizHistory, submitQuizResult, getQuizById, getStreak, getMastery, getProfileStats } from "../controllers/quiz.controllers";
import { authenticate } from "../middleware/authenticate";

const router = Router();

// All quiz routes require authentication
router.get("/history", authenticate, getQuizHistory);
router.get("/streak", authenticate, getStreak);
router.get("/mastery", authenticate, getMastery);
router.get("/profile-stats", authenticate, getProfileStats);
router.get("/:id", authenticate, getQuizById);
router.post("/", authenticate, createQuiz);
router.post("/submit", authenticate, submitQuizResult);

export default router;
