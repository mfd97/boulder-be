# Boulder — Backend

REST API for [Boulder](https://github.com/your-org/boulder), an iOS app to create quizzes and use AI to evaluate topic mastery.

## Tech stack

- **Node.js** + **Express**
- **TypeScript** (strict)
- **MongoDB** + **Mongoose**
- **JWT** (jsonwebtoken) + **bcrypt** for auth

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `env.example` to `.env` and set:

   ```env
   PORT=4000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/boulder
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   JWT_EXPIRES_IN=7d
   ```

3. **Run**

   - Dev (with reload): `npm run dev`
   - Build: `npm run build`
   - Start: `npm start`

## API

- **POST** `/api/auth/register` — Register (body: `fullName`, `email`, `password`)
- **POST** `/api/auth/login` — Login (body: `email`, `password`)
- **GET** `/api/users/me` — Current user (header: `Authorization: Bearer <token>`)
- **GET** `/api/health` — Health check

Responses use `{ success: true, data }` or `{ success: false, error }`.
