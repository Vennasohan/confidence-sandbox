import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [isMlMode, setIsMlMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  
  // Form State
  const [problemDescription, setProblemDescription] = useState("");
  const [language, setLanguage] = useState("python");
  const [sourceCode, setSourceCode] = useState("");
  const [modelBase64, setModelBase64] = useState("");
  const [modelFileName, setModelFileName] = useState("");

  // Auth & History State
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Auth Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : `http://${window.location.hostname}:3000`;
  const API_URL = `${API_BASE}/api`;

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      loadHistory(token);
    }
  }, []);

  const loadHistory = async (token) => {
    try {
      const res = await fetch(`${API_URL}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch history");
      const docs = await res.json();
      setHistory(docs);
    } catch (err) {
      console.error("Error loading history:", err);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isRegistering ? '/auth/register' : '/auth/login';
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        setAuthModalOpen(false);
        setEmail("");
        setPassword("");
        loadHistory(data.token);
    } catch (err) {
        alert("Auth Error: " + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setHistory([]);
  };

  const handleFileDrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          setModelBase64(event.target.result);
          setModelFileName(file.name);
      };
      reader.readAsDataURL(file);
  };

  const handleEvaluate = async () => {
      setLoading(true);
      setReport(null);

      try {
          const response = await fetch(`${API_BASE}/evaluate`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  is_ml_mode: isMlMode,
                  language: isMlMode ? 'python' : language,
                  source_code: sourceCode,
                  problem_description: problemDescription,
                  model_file_base64: isMlMode ? modelBase64 : null,
                  model_file_name: isMlMode ? modelFileName : null
              })
          });

          const data = await response.json();
          if (data.error) throw new Error(data.details ? `${data.error}: ${data.details}` : data.error);
          setReport(data);

          const token = localStorage.getItem('token');
          if (token) {
            try {
              await fetch(`${API_URL}/history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    problemDescription,
                    language: isMlMode ? 'python' : language,
                    isMlMode: isMlMode,
                    intentGapScore: data.confidence_score || 0,
                    results: data.test_results ? data.test_results.slice(0, 3) : [],
                    sourceCode: sourceCode,
                    parsedIntent: data.parsed_intent ? (typeof data.parsed_intent === 'object' ? JSON.stringify(data.parsed_intent, null, 2) : data.parsed_intent) : ""
                })
              });
              loadHistory(token);
            } catch (err) {
              console.error("Failed to save to history", err);
              alert("History Save Error: " + err.message);
            }
          }
      } catch (error) {
          console.error("Evaluation failed", error);
          alert(error.message || "Failed to evaluate. Ensure the backend server is running.");
      } finally {
          setLoading(false);
      }
  };

  const formatError = (errorString) => {
      if (!errorString) return "";
      if (typeof errorString !== 'string') return String(errorString);
      // If it's a python traceback, the actual error is usually on the last non-empty line
      const lines = errorString.split('\n').map(l => l.trim()).filter(l => l);
      const errorLine = lines.slice().reverse().find(line => line.includes('Error:'));
      return errorLine ? errorLine : errorString;
  };

  return (
    <div className="app-container">
      <header className="header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
          <h1>Confidence Scorer</h1>
          <p style={{margin: 0}}>AI-powered pipeline to evaluate code and ML models against rigorous edge cases.</p>
        </div>
        <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
          {user ? (
            <>
              <span style={{color: 'var(--text-muted)'}}>{user.email}</span>
              <button className="btn-secondary" onClick={() => setShowHistory(true)} style={{padding: '8px 15px'}}>History</button>
              <button className="btn-secondary" onClick={handleLogout} style={{padding: '8px 15px'}}>Log Out</button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => setAuthModalOpen(true)} style={{padding: '8px 15px'}}>Sign In</button>
          )}
        </div>
      </header>

      <main className="main-content">

      {authModalOpen && (
          <div className="modal-backdrop" style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'}} onClick={() => setAuthModalOpen(false)}>
              <div className="glass-panel" style={{width: '400px'}} onClick={e => e.stopPropagation()}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
                      <h2>{isRegistering ? 'Create Account' : 'Sign In'}</h2>
                      <button className="btn-secondary" onClick={() => setAuthModalOpen(false)} style={{padding: '5px 10px'}}>Close</button>
                  </div>
                  <form onSubmit={handleAuth}>
                      <div className="form-group">
                          <label>Email</label>
                          <input type="email" required className="input-field" value={email} onChange={e => setEmail(e.target.value)} />
                      </div>
                      <div className="form-group" style={{position: 'relative'}}>
                          <label>Password</label>
                          <input type={showPassword ? "text" : "password"} required className="input-field" value={password} onChange={e => setPassword(e.target.value)} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} style={{position: 'absolute', right: '10px', top: '35px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem'}}>
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                      </div>
                      <button type="submit" className="btn-primary" style={{width: '100%', marginBottom: '10px'}}>{isRegistering ? 'Register' : 'Login'}</button>
                  </form>
                  <p style={{textAlign: 'center', cursor: 'pointer', color: 'var(--accent)'}} onClick={() => setIsRegistering(!isRegistering)}>
                      {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
                  </p>
              </div>
          </div>
      )}

      {showHistory && (
          <div className="modal-backdrop" style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'}} onClick={() => setShowHistory(false)}>
              <div className="glass-panel" style={{width: '600px', maxHeight: '80vh', overflowY: 'auto'}} onClick={e => e.stopPropagation()}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
                      <h2>Your Evaluation History</h2>
                      <button className="btn-secondary" onClick={() => setShowHistory(false)} style={{padding: '5px 10px'}}>Close</button>
                  </div>
                  {history.length === 0 ? <p>No history found.</p> : (
                      history.map(item => (
                          <div key={item._id} style={{padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                              <div>
                                  <div style={{fontWeight: 'bold'}}>
                                    {item.isMlMode ? '🤖 ML Model Evaluation' : `${item.language?.toUpperCase()} Code Evaluation`}
                                  </div>
                                  <div style={{fontSize: '0.8rem', color: '#888'}}>{item.problemDescription?.substring(0, 50)}...</div>
                                  {item.parsedIntent && <div style={{fontSize: '0.85rem', color: '#aaa', marginTop: '10px', whiteSpace: 'pre-wrap', lineHeight: '1.4'}}><strong>Intent:</strong><br/>{item.parsedIntent}</div>}
                                  {item.sourceCode && <div style={{fontSize: '0.85rem', color: '#aaa', marginTop: '10px', fontFamily: 'monospace', backgroundColor: '#000', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto'}}><strong>Code/Inference Script:</strong><br/>{item.sourceCode}</div>}
                              </div>
                              <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: item.intentGapScore >= 80 ? '#4CAF50' : item.intentGapScore >= 50 ? '#FFC107' : '#F44336'}}>
                                  {item.intentGapScore}
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
      )}

        {/* Input Panel */}
        <section className="glass-panel">
          <div className="panel-title">
            <span>Evaluation Setup</span>
            <div className="toggle-container">
              <label className="toggle-switch">
                <input type="checkbox" checked={isMlMode} onChange={() => setIsMlMode(!isMlMode)} />
                <span className="slider"></span>
              </label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ML Mode</span>
            </div>
          </div>

          <div className="form-group">
            <label>Problem Description & Intent</label>
            <textarea 
              className="textarea-field" 
              placeholder="E.g., Write a function that finds the maximum number. It must handle empty arrays safely..."
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
            ></textarea>
          </div>
          

          {!isMlMode ? (
            <>
              <div className="form-group">
                <label>Target Language</label>
                <select className="select-field" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                </select>
              </div>
              <div className="form-group">
                <label>Source Code</label>
                <textarea 
                  className="textarea-field" 
                  style={{ fontFamily: 'monospace', minHeight: '200px' }}
                  placeholder="def find_max(arr):&#10;  return max(arr)"
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                ></textarea>
              </div>
            </>
          ) : (
             <>
              <div className="form-group">
                <label>Inference Script (Python)</label>
                <textarea 
                  className="textarea-field" 
                  style={{ fontFamily: 'monospace', minHeight: '150px' }}
                  placeholder="import pickle&#10;import sys&#10;import json&#10;&#10;model = pickle.load(open('model.pkl', 'rb'))&#10;input_data = json.loads(sys.stdin.read())&#10;print(model.predict([input_data]))"
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                ></textarea>
              </div>
              <div className="form-group">
                <label>Artifacts (.pkl, .joblib, .exe, .onnx)</label>
                <div 
                  className="dropzone" 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                >
                  <input type="file" onChange={handleFileDrop} style={{display: 'none'}} id="fileUpload" />
                  <label htmlFor="fileUpload" style={{cursor: 'pointer', display: 'block', height: '100%'}}>
                    {modelBase64 ? `${modelFileName} loaded successfully! ✓` : "Drag & drop your artifact file here, or click to browse"}
                  </label>
                </div>
              </div>
             </>
          )}
          
          <button className="btn-primary" onClick={handleEvaluate} disabled={loading} style={{marginTop: 'auto'}}>
            {loading ? 'Evaluating via AI...' : 'Generate Confidence Score'}
          </button>
        </section>

        {/* Results Panel */}
        <section className="glass-panel">
          <div className="panel-title">Confidence Report</div>
          
          {loading ? (
             <div className="score-display">
                <div style={{color: 'var(--accent)', fontSize: '1.2rem'}}>Analyzing edge cases...</div>
             </div>
          ) : report ? (
            <div>
              <div className="score-display">
                <div className="score-circle">
                  <span className="score-text">{report.confidence_score}</span>
                </div>
                <div style={{color: 'var(--text-muted)'}}>{isMlMode ? 'Intent Gap Score' : 'Confidence Score'}</div>
              </div>
              
              <div style={{marginTop: '2rem'}}>
                <h3 style={{marginBottom: '1rem'}}>AI Analysis Summary</h3>
                <div style={{background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', lineHeight: '1.6'}}>
                  {report.summary}
                </div>
                
                {report.test_results && report.test_results.length > 0 && (
                  <div style={{marginTop: '2rem'}}>
                    <h3 style={{marginBottom: '1rem'}}>Rigorous Edge Cases</h3>
                    {report.test_results.map((test, idx) => (
                      <div key={idx} style={{
                        background: 'rgba(255,255,255,0.02)', 
                        border: `1px solid ${test.passed ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
                        padding: '1rem', 
                        borderRadius: '8px',
                        marginBottom: '10px'
                      }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                          <span style={{fontWeight: 'bold'}}>Input: <code>{test.input}</code></span>
                          <span style={{color: test.passed ? '#4CAF50' : '#F44336'}}>
                            {test.passed ? '✓ PASSED' : '✗ FAILED'}
                          </span>
                        </div>
                        <div style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '4px'}}>
                          Expected: {test.expected}
                        </div>
                        <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                          Actual: {formatError(test.actual || test.error)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Submit your code and intent on the left to generate an AI-driven confidence report.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
