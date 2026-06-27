import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import historyRoutes from './routes/historyRoutes.js';

dotenv.config();

const app = express();
const port = 3000;

app.use(cors({ allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'] }));
app.use(express.json({ limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/history', historyRoutes);

app.get('/api/debug-db', async (req, res) => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        res.json({ success: true, message: "Connected successfully in debug route!" });
    } catch (err) {
        res.json({ success: false, errorName: err.name, errorMessage: err.message, errorDetails: err });
    }
});

// Rate Limiting: 5 requests per hour per IP to protect the free tier from abuse
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 15, // limit each IP to 15 requests per windowMs
    message: { error: "Too many requests from this IP, please try again after an hour." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiter specifically to the evaluate endpoint
app.use('/evaluate', limiter);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const getWandboxCompiler = (lang) => {
    switch(lang) {
        case 'python': return 'cpython-3.12.7';
        case 'javascript': return 'nodejs-20.17.0';
        case 'cpp': return 'gcc-13.2.0';
        default: return 'cpython-3.12.7';
    }
};

// ==========================================
// STAGE 1: INTENT PARSER
// ==========================================
const parseIntent = async (problemDescription) => {
    const prompt = `You are a Stage 1 Intent Parser.
Extract the structured requirements from the user's plain English ML problem description.
Problem Description: "${problemDescription}"
Respond ONLY with a valid JSON object matching this schema:
{
  "must_do": ["rule 1", "rule 2"],
  "must_not_do": ["failure condition 1"],
  "expected_data_distribution": "description of expected data",
  "implied_edge_cases": ["edge case 1"]
}`;
    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0]?.message?.content);
};

// ==========================================
// STAGE 2: ADVERSARIAL INPUT GENERATOR
// ==========================================
const generateAdversarialInputs = async (intent) => {
    const prompt = `You are a Stage 2 Adversarial Input Generator.
Based on the following parsed model intent, generate 10 targeted test cases to break the model. Focus specifically on violating the 'must_not_do' conditions and triggering 'implied_edge_cases'.
Intent: ${JSON.stringify(intent)}
Respond ONLY with a valid JSON object with a key "tests" containing an array of exactly 10 objects.
Each object MUST have an "input" key containing a JSON array string of features AND an "expected_output" key containing a single numerical fallback value as a string (e.g. "0.0000" or the mathematically calculated float value). DO NOT use the word "Error". DO NOT return an array for expected_output.`;
    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0]?.message?.content).tests;
};

// ==========================================
// STAGE 4: INTENT GAP SCORE CALCULATOR
// ==========================================
const calculateGapScore = async (intent, testResults) => {
    const prompt = `You are a Stage 4 Intent Gap Score Calculator.
Analyze the execution logs of an ML model against its stated requirements.
Requirements: ${JSON.stringify(intent)}
Execution Logs (Input, Expected, Actual Output, Passed): ${JSON.stringify(testResults.map(r => ({input: r.input, expected: r.expected, actual: r.actual, passed: r.passed})))}
Produce a structured Intent Gap Score report.
Respond ONLY with a valid JSON object matching this schema:
{
  "overall_score": 82,
  "summary": "your model satisfies 4/6 stated requirements, critically fails on requirement 2...",
  "requirement_breakdown": [
    { "requirement": "must handle missing values", "status": "Fail", "reason": "Crashed on NaN inputs" }
  ]
}`;
    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0]?.message?.content);
};

// ==========================================
// STANDARD CODE TEST GENERATOR
// ==========================================
const generateStandardTests = async (problemDescription) => {
    const prompt = `You are a brutal QA engineer.
Code Intent: "${problemDescription}"
Generate exactly 10 test cases. AT LEAST 80% (8 or more) MUST BE tough edge cases (empty arrays, massive numbers, negative values, nulls, tricky boundary conditions). Only 1 or 2 should be "standard" cases.
Respond ONLY with a valid JSON object with a key "tests" containing an array of exactly 10 objects.
Each object MUST have an "input" key and an "expected_output" key. Both must be strings.
Example:
{
  "tests": [
    { "input": "[1, 2, 3]", "expected_output": "3" },
    { "input": "[]", "expected_output": "None" }
  ]
}`;
    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0]?.message?.content).tests;
};

app.post('/evaluate', async (req, res) => {
    try {
        const { language, source_code, problem_description, model_file_base64, model_file_name, is_ml_mode } = req.body;

        if (!source_code || !problem_description) {
            return res.status(400).json({ error: "Missing source_code or problem_description" });
        }

        let passedTests = 0;
        const testResults = [];
        let tests = [];
        let intent = null;
        let gapScoreReport = null;
        let tempDir = null;

        if (is_ml_mode) {
            console.log("Stage 1: Parsing Intent...");
            intent = await parseIntent(problem_description);
            
            console.log("Stage 2: Generating Adversarial Inputs...");
            tests = await generateAdversarialInputs(intent);
            
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'confidence-scorer-'));
            const mainFile = path.join(tempDir, 'main.py');
            fs.writeFileSync(mainFile, source_code);

            if (model_file_base64 && model_file_name) {
                const base64Data = model_file_base64.split(',')[1] || model_file_base64;
                fs.writeFileSync(path.join(tempDir, model_file_name), Buffer.from(base64Data, 'base64'));
            }
            console.log("Stage 3: Behavioral Auditor (Execution)...");
        } else {
            console.log("Generating 10 tough tests (80% edge cases) via Groq...");
            tests = await generateStandardTests(problem_description);
        }

        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            console.log(`Running test ${i + 1}/${tests.length}...`);

            let actualOutput = "";
            let stderr = "";
            let exitCode = 0;
            let stringInput = typeof test.input === 'string' ? test.input : JSON.stringify(test.input);

            if (is_ml_mode) {
                // UNIFIED CONTAINER EXECUTION FOR ML
                try {
                    // We run python directly, because the Node.js server IS the Docker container!
                    const stdoutBuffer = execSync('python main.py', { 
                        cwd: tempDir,
                        input: stringInput, 
                        timeout: 15000,
                        stdio: ['pipe', 'pipe', 'pipe'] 
                    });
                    actualOutput = stdoutBuffer.toString().trim();
                } catch (err) {
                    exitCode = err.status || 1;
                    actualOutput = err.stdout ? err.stdout.toString().trim() : "";
                    stderr = err.stderr ? err.stderr.toString().trim() : err.message;
                }
            } else {
                // WANDBOX REMOTE EXECUTION FOR STANDARD CODE
                try {
                    const compiler = getWandboxCompiler(language);
                    const response = await axios.post('https://wandbox.org/api/compile.json', {
                        compiler: compiler,
                        code: source_code,
                        stdin: stringInput
                    }, { timeout: 10000 });
                    
                    if (response.data.status !== "0") {
                        exitCode = parseInt(response.data.status);
                        stderr = response.data.compiler_error || response.data.program_error || "Execution failed";
                        actualOutput = response.data.program_output ? response.data.program_output.trim() : "";
                    } else {
                        actualOutput = response.data.program_message ? response.data.program_message.trim() : (response.data.program_output ? response.data.program_output.trim() : "");
                    }
                } catch (err) {
                    exitCode = 1;
                    stderr = "Sandbox Connection Error: " + err.message;
                }
            }

            let passed = false;
            if (is_ml_mode) {
                const noCrash = stderr === "" && exitCode === 0 && !actualOutput.toLowerCase().includes("error:");
                const matchesExpected = test.expected_output ? actualOutput.includes(test.expected_output) : true;
                passed = noCrash && matchesExpected;
            } else {
                passed = actualOutput === test.expected_output;
            }

            if (passed) passedTests++;

            testResults.push({
                input: stringInput,
                expected: test.expected_output || "No crash (ML)",
                actual: actualOutput,
                error: stderr,
                passed: passed
            });
        }

        if (is_ml_mode) {
            console.log("Stage 4: Calculating Intent Gap Score...");
            gapScoreReport = await calculateGapScore(intent, testResults);
            
            if (tempDir) {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            }
            
            res.json({
                confidence_score: gapScoreReport.overall_score,
                summary: gapScoreReport.summary,
                test_results: testResults,
                intent_gap_report: gapScoreReport,
                parsed_intent: intent
            });
        } else {
            const confidenceScore = Math.round((passedTests / tests.length) * 100);
            res.json({
                confidence_score: confidenceScore,
                summary: `Passed ${passedTests} out of ${tests.length} rigorous test cases.`,
                test_results: testResults
            });
        }

    } catch (error) {
        console.error("Error in evaluation pipeline:", error);
        res.status(500).json({ error: "Evaluation failed", details: error.message });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend Confidence Scorer listening at http://0.0.0.0:${port} (Wandbox Remote Mode)`);
});
