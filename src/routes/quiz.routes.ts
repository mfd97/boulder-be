import { Router } from "express";
import { createQuiz, getQuizHistory, submitQuizResult, getQuizById, getStreak, getMastery, getProfileStats } from "../controllers/quiz.controllers";

const router = Router();
router.get("/history", getQuizHistory);
router.get("/streak", getStreak);
router.get("/mastery", getMastery);
router.get("/profile-stats", getProfileStats);
router.get("/:id", getQuizById);
router.post("/", createQuiz);
router.post("/submit", submitQuizResult);

export default router;
