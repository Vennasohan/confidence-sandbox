# Confidence Scorer AI

Confidence Scorer is an AI-powered pipeline to evaluate both standard code and Machine Learning models against rigorous edge cases.

## Features
- **Code Evaluation**: Submit your Python, JavaScript, or C++ code along with your problem intent, and an AI agent will generate test cases, run them against your code, and give you a Confidence Score (0-100) based on how well it handles edge cases.
- **ML Model Evaluation**: Upload ML models (`.pkl`, `.onnx`, etc.) and provide an inference script. The AI will generate adversarial inputs to test the robustness of your model.
- **Evaluation History**: Save and review all of your previous evaluations in a secure MongoDB database.

## Architecture
- **Frontend**: React + Vite (Glassmorphism UI)
- **Backend**: Node.js + Express + Mongoose + Groq API
- **AI Agent**: Uses `llama-3.1-70b-versatile` to parse intent and generate edge case payloads.
- **Sandbox**: Code is securely executed in the Wandbox Sandbox API.

## Getting Started

### Prerequisites
- Node.js
- MongoDB URI
- Groq API Key

### Backend Setup
1. `cd backend`
2. `npm install`
3. Create a `.env` file with `MONGO_URI` and `GROQ_API_KEY`.
4. `npm run dev`

### Frontend Setup
1. `cd confidence-scorer-ui`
2. `npm install`
3. `npm run dev`
