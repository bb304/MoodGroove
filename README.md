# MoodGroove

A music mood-based recommendation application built with React.

## Project Structure

```
MoodGroove/
├── frontend/          # React frontend application
│   ├── src/          # React components and source code
│   ├── public/       # Static assets
│   └── package.json  # Frontend dependencies
│
└── backend/          # Backend API server (ready for setup)
    ├── src/          # Server source code
    ├── routes/       # API route handlers
    ├── controllers/ # Request controllers
    ├── middleware/  # Custom middleware
    └── utils/        # Utility functions
```

## Getting Started

### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and add your API keys:
     - **REACT_APP_SPOTIFY_CLIENT_ID**: Get from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
     - **REACT_APP_GEMINI_API_KEY**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

4. Start the development server:
```bash
npm start
```

The app will run on `http://localhost:3000`

**Important**: Never commit your `.env` file to version control. It contains sensitive API keys.

### Backend

The backend folder is set up and ready for development. Navigate to the backend directory when you're ready to set up your API server:

```bash
cd backend
npm install
```

## Features

- **Mood-Based Playlist Discovery**: Find songs based on your mood (Happy, Sad, Calm, Energetic, Focus)
- **Artist Recommendations**: Get personalized artist recommendations based on your Spotify listening habits
- **Spotify Integration**: Connect your Spotify account to access your top artists and discover new music
- **Learning System**: Like/dislike songs to improve recommendations
