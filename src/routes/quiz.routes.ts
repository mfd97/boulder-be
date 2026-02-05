import { Router } from "express";
import { createQuiz } from "../controllers/quiz.controllers";

const router = Router();
router.post("/", createQuiz);

export default router;
