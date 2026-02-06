import { Router } from "express";
import { createQuiz, getQuizHistory, submitQuizResult, getQuizById } from "../controllers/quiz.controllers";

const router = Router();
router.get("/history", getQuizHistory);
router.get("/:id", getQuizById);
router.post("/", createQuiz);
router.post("/submit", submitQuizResult);

export default router;
