import { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, db, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp } from './firebase';
import './App.css';
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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        loadHistory(user.uid);
      } else {
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadHistory = async (uid) => {
    try {
      const q = query(collection(db, "evaluations"), where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in descending order by timestamp locally to avoid Firestore Index requirements
      docs.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
      setHistory(docs);
    } catch (err) {
      console.error("Error loading history:", err);
      alert("History Load Error: " + err.message);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      alert("Login Error: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
      alert("Logout Error: " + err.message);
    }
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
          const apiUrl = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/evaluate` : `http://${window.location.hostname}:3000/evaluate`;
          const response = await fetch(apiUrl, {
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

          // Auto-save to Firestore if user is logged in
          if (auth.currentUser) {
            try {
              await addDoc(collection(db, "evaluations"), {
                userId: auth.currentUser.uid,
                problemDescription,
                language: isMlMode ? 'python' : language,
                intentGapScore: data.confidence_score || 0,
                timestamp: serverTimestamp(),
                results: data.test_results ? data.test_results.slice(0, 3) : [],
                sourceCode: sourceCode,
                parsedIntent: data.parsed_intent || ""
              });
              loadHistory(auth.currentUser.uid);
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
              <span style={{color: 'var(--text-muted)'}}>Hi, {user.displayName?.split(' ')[0]}</span>
              <button className="btn-secondary" onClick={() => setShowHistory(true)} style={{padding: '8px 15px'}}>History</button>
              <button className="btn-secondary" onClick={handleLogout} style={{padding: '8px 15px'}}>Log Out</button>
            </>
          ) : (
            <button className="btn-primary" onClick={handleLogin} style={{padding: '8px 15px'}}>Log in with Google</button>
          )}
        </div>
      </header>

      <main className="main-content">

      {showHistory && (
          <div className="modal-backdrop" style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'}} onClick={() => setShowHistory(false)}>
              <div className="glass-panel" style={{width: '600px', maxHeight: '80vh', overflowY: 'auto'}} onClick={e => e.stopPropagation()}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
                      <h2>Your Evaluation History</h2>
                      <button className="btn-secondary" onClick={() => setShowHistory(false)} style={{padding: '5px 10px'}}>Close</button>
                  </div>
                  {history.length === 0 ? <p>No history found.</p> : (
                      history.map(item => (
                          <div key={item.id} style={{padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                              <div>
                                  <div style={{fontWeight: 'bold'}}>{item.language?.toUpperCase()} Evaluation</div>
                                  <div style={{fontSize: '0.8rem', color: '#888'}}>{item.problemDescription?.substring(0, 50)}...</div>
                                  {item.parsedIntent && <div style={{fontSize: '0.85rem', color: '#aaa', marginTop: '10px', whiteSpace: 'pre-wrap', lineHeight: '1.4'}}><strong>Intent:</strong><br/>{item.parsedIntent}</div>}
                                  {item.sourceCode && <div style={{fontSize: '0.85rem', color: '#aaa', marginTop: '10px', fontFamily: 'monospace', backgroundColor: '#000', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto'}}><strong>Code:</strong><br/>{item.sourceCode}</div>}
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

          <button className="btn-primary" onClick={handleEvaluate} disabled={loading}>
              {loading ? "Analyzing Pipeline..." : "Generate Score"}
          </button>
        </section>

        {/* Results Panel */}
        <section className="glass-panel" style={{ overflowY: 'auto', maxHeight: '800px' }}>
          <div className="panel-title">Confidence Report</div>
          
          <div className="score-display" style={{justifyContent: report ? 'flex-start' : 'center'}}>
            {!report && !loading && (
              <div className="empty-state">
                <svg style={{width: '64px', height: '64px', marginBottom: '1rem', opacity: 0.5}} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p>Submit your code to see the evaluation report and edge-case analysis.</p>
              </div>
            )}

            {loading && (
                <div className="empty-state">
                    <div style={{
                        width: '40px', height: '40px', 
                        border: '4px solid var(--border)', 
                        borderTop: '4px solid var(--primary)', 
                        borderRadius: '50%', 
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 1rem'
                    }}></div>
                    <style>{"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"}</style>
                    <p style={{ color: 'var(--primary)', fontWeight: 'bold', marginBottom: '1rem' }}>Executing 4-Stage Agentic Pipeline...</p>
                    <div style={{textAlign: 'left', display: 'inline-block'}}>
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: isMlMode ? 'white' : 'var(--text-muted)'}}>1. Parsing Intent & Requirements</p>
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: isMlMode ? 'white' : 'var(--text-muted)'}}>2. Generating Targeted Adversarial Inputs</p>
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem'}}>3. Auditing Behavioral Executions</p>
                      <p style={{ fontSize: '0.9rem', color: isMlMode ? 'white' : 'var(--text-muted)'}}>4. Calculating Intent Gap Score</p>
                    </div>
                </div>
            )}

            {report && !loading && (
              <>
                <div className="score-circle">
                  <span className="score-text">{report.confidence_score}</span>
                </div>
                <h3 style={{color: 'var(--text-main)', marginBottom: '0.5rem'}}>Intent Gap Score</h3>
                <p style={{color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2rem'}}>{report.summary}</p>
                
                {report.intent_gap_report && (
                  <div style={{width: '100%', textAlign: 'left', marginBottom: '2rem'}}>
                    <h4 style={{marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem'}}>Requirement Breakdown</h4>
                    {report.intent_gap_report.requirement_breakdown && report.intent_gap_report.requirement_breakdown.map((req, idx) => (
                      <div key={idx} style={{
                        background: 'rgba(0,0,0,0.2)', 
                        padding: '1rem', 
                        borderRadius: '8px', 
                        marginBottom: '0.5rem',
                        borderLeft: `4px solid ${req.status.toLowerCase() === 'pass' ? '#22c55e' : '#ef4444'}`
                      }}>
                        <p style={{fontSize: '0.95rem', fontWeight: 'bold'}}>{req.requirement}</p>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem'}}>{req.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{width: '100%', textAlign: 'left'}}>
                    <h4 style={{marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem'}}>Execution Audit Logs</h4>
                    {report.test_results.map((test, idx) => (
                        <div key={idx} style={{
                            background: 'rgba(0,0,0,0.2)', 
                            padding: '1rem', 
                            borderRadius: '8px', 
                            marginBottom: '1rem',
                            borderLeft: `4px solid ${test.passed ? '#22c55e' : '#ef4444'}`
                        }}>
                            <p style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}><strong>Targeted Input:</strong> {test.input}</p>
                            <p style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}><strong>Expected:</strong> {test.expected}</p>
                            <p style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}><strong>Actual:</strong> {test.actual !== "" ? test.actual : <span style={{color: '#ef4444'}}>No output produced</span>}</p>
                            {test.error && <p style={{fontSize: '0.8rem', color: '#ef4444', marginTop: '0.5rem', fontFamily: 'monospace'}}>{test.error}</p>}
                        </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
