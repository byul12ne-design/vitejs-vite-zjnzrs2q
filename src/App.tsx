import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut, 
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc, 
  getDoc, 
  writeBatch, 
  arrayUnion, 
  query, 
  orderBy 
} from 'firebase/firestore';

// ==========================================
// 🛠️ 앱 기본 설정
// ==========================================
const APP_CONFIG = {
  logoText: "뷔르트 교육 센터",
  logoImageUrl: "https://eshop.wuerth.de/is-bin/intershop.static/WFS/1401-B1-Site/-/en_US/webkit_bootstrap/dist/img/wuerth-logo.svg",
};

const firebaseConfig = {
  apiKey: "AIzaSyAIBp1x4DalwhtlFnYjnz2TisQBA0wVBSg",
  authDomain: "product-exam-9b794.firebaseapp.com",
  projectId: "product-exam-9b794",
  storageBucket: "product-exam-9b794.firebasestorage.app",
  messagingSenderId: "443959122996",
  appId: "1:443959122996:web:355714f3a0c809b9ebbe61",
  measurementId: "G-X5NVNL1G96"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 인터페이스 ---
interface Question { category?: string; text: string; options: string[]; answerIndex: number; explanation: string; }
interface BankQuestion extends Question { id: string; createdAt: number; }
interface Exam { id: string; title: string; notice?: string; questions: Question[]; displayCount: number; createdAt: number; mode: 'study' | 'test'; requireName: boolean; recordScores?: boolean; }
interface ExamResult { id: string; examId: string; examTitle: string; studentId: string; studentName: string; score: number; correctCount: number; totalCount: number; answers: Record<number, number>; activeQuestions: Question[]; createdAt: number; mode: 'study' | 'test'; }
interface UserProfile { uid: string; employeeId: string; name: string; role: 'student' | 'admin'; }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questionBank, setQuestionBank] = useState<BankQuestion[]>([]);
  const [view, setView] = useState('home');
  const [adminTab, setAdminTab] = useState<'exams' | 'bank'>('exams');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentExamId, setCurrentExamId] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [empIdInput, setEmpIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]); 
  const [firstAttemptAnswers, setFirstAttemptAnswers] = useState<Record<number, number>>({}); 
  const [studentScore, setStudentScore] = useState(0);
  const [questionQueue, setQuestionQueue] = useState<{q: Question, originalIndex: number}[]>([]); 
  const [isAnswerChecked, setIsAnswerChecked] = useState(false); 
  const [currentSelectedOption, setCurrentSelectedOption] = useState<number | null>(null); 
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [customExamId, setCustomExamId] = useState(''); 
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamMode, setNewExamMode] = useState<'study' | 'test'>('study');
  const [displayCount, setDisplayCount] = useState('');
  const [recordScores, setRecordScores] = useState(true); 
  const [newQuestions, setNewQuestions] = useState<Question[]>([{ category: '', text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' }]);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [newBankQuestion, setNewBankQuestion] = useState<Question>({ category: '', text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [bankCategoryFilter, setBankCategoryFilter] = useState<string>('all');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkExamId = params.get('examId');
    if (linkExamId) setCurrentExamId(linkExamId);
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (docSnap.exists()) setUserProfile(docSnap.data() as UserProfile);
      } else { setUserProfile(null); }
    });

    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });

    const unsubBank = onSnapshot(collection(db, 'questionBank'), (snapshot) => {
      setQuestionBank(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankQuestion)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });

    return () => { unsubscribe(); unsubExams(); unsubBank(); };
  }, []);

  const showToast = (message: string) => { setToastMessage(message); setTimeout(() => setToastMessage(null), 3000); };
  
  const handleStudentAuth = async () => {
    if (empIdInput.length !== 8) return showToast('사번 8자리를 입력해주세요.');
    const finalEmpId = `WN${empIdInput}`;
    const pseudoEmail = `${finalEmpId.toLowerCase()}@wuerth.exam`;
    const PWD = "WuerthExamSecretPassword2026!";
    try {
      let currentUser;
      if (authMode === 'register') {
        if (!nameInput.trim()) return showToast('이름을 입력해주세요.');
        const cred = await createUserWithEmailAndPassword(auth, pseudoEmail, PWD);
        currentUser = cred.user;
        await setDoc(doc(db, 'users', currentUser.uid), { uid: currentUser.uid, employeeId: finalEmpId, name: nameInput.trim(), role: 'student' });
      } else {
        const cred = await signInWithEmailAndPassword(auth, pseudoEmail, PWD);
        currentUser = cred.user;
      }
      showToast('입장 성공!');
      if (currentExamId) setView('student-entry');
    } catch (e) { showToast('등록 정보가 없거나 오류가 발생했습니다.'); }
  };

  const startExam = async () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam || !userProfile) return;
    const pool = exam.questions;
    const finalCount = parseInt(displayCount) || pool.length;
    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, finalCount);
    setActiveQuestions(selected);
    if (exam.mode === 'test') { setTestAnswers({}); } 
    else { setQuestionQueue(selected.map((q, idx) => ({q, originalIndex: idx}))); setIsAnswerChecked(false); }
    setView('student-take');
  };

  const submitExam = async (finalAnswers: Record<number, number>) => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam || !userProfile) return;
    const correctCount = activeQuestions.reduce((cnt, q, idx) => finalAnswers[idx] === q.answerIndex ? cnt + 1 : cnt, 0);
    const score = Math.round((correctCount / activeQuestions.length) * 100);
    setStudentScore(score);
    if (exam.recordScores !== false) {
      await addDoc(collection(db, 'results'), { examId: currentExamId, studentName: userProfile.name, score, createdAt: Date.now() });
    }
    setView('student-result');
  };

  return (
    <>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      <style>{`body { background-color: #f8fafc; font-family: -apple-system, system-ui, sans-serif; } .animate-in { animation: fadeIn 0.4s ease-out; } @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      
      <div className="min-h-screen flex flex-col">
        <nav className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-50">
          <h1 onClick={() => setView('home')} className="cursor-pointer flex items-center gap-2">
            <img src={APP_CONFIG.logoImageUrl} alt="Würth" className="h-8" />
            <span className="font-bold text-slate-800 hidden sm:block">교육 센터</span>
          </h1>
          {userProfile && <button onClick={() => signOut(auth)} className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">로그아웃</button>}
        </nav>

        <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
          {view === 'home' && !userProfile && (
            <div className="flex flex-col items-center justify-center pt-12 animate-in">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 sm:p-12">
                <h2 className="text-3xl font-black text-center mb-2">교육 센터</h2>
                <p className="text-slate-400 text-center text-sm mb-10 font-medium">사번으로 로그인하세요</p>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
                  <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl font-bold text-sm ${authMode === 'login' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>로그인</button>
                  <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl font-bold text-sm ${authMode === 'register' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>최초 등록</button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl p-1 focus-within:border-blue-500 transition-all">
                    <span className="pl-4 pr-1 font-black text-blue-600 text-lg">WN</span>
                    <input type="text" value={empIdInput} onChange={e => setEmpIdInput(e.target.value.replace(/[^0-9]/g, ''))} maxLength={8} className="w-full bg-transparent py-4 font-bold text-lg outline-none" placeholder="사번 8자리" />
                  </div>
                  {authMode === 'register' && <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-bold text-center" placeholder="실명 입력" />}
                  <button onClick={handleStudentAuth} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-blue-600 transition-all text-lg">입장하기</button>
                </div>
                <button onClick={() => setView('admin-login')} className="w-full text-slate-300 text-xs mt-8 font-bold">⚙️ 관리자 접속</button>
              </div>
            </div>
          )}

          {view === 'home' && userProfile && (
            <div className="animate-in space-y-8">
              <h2 className="text-2xl font-black">{userProfile.name} 님, 환영합니다!</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
                  <h3 className="font-black text-lg mb-4 text-emerald-600">📖 자율 학습</h3>
                  {exams.filter(e => e.mode === 'study').map(ex => (
                    <div key={ex.id} className="p-4 bg-slate-50 rounded-xl mb-2 flex justify-between items-center border">
                      <span className="font-bold text-sm">{ex.title}</span>
                      <button onClick={() => { setCurrentExamId(ex.id); setView('student-entry'); }} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold">시작</button>
                    </div>
                  ))}
                </div>
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
                  <h3 className="font-black text-lg mb-4 text-purple-600">🏆 실전 퀴즈</h3>
                  {exams.filter(e => e.mode === 'test').map(ex => (
                    <div key={ex.id} className="p-4 bg-slate-50 rounded-xl mb-2 flex justify-between items-center border">
                      <span className="font-bold text-sm">{ex.title}</span>
                      <button onClick={() => { setCurrentExamId(ex.id); setView('student-entry'); }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold">응시</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'student-entry' && (
            <div className="py-20 text-center animate-in">
              <h2 className="text-3xl font-black mb-8">{exams.find(e => e.id === currentExamId)?.title}</h2>
              <button onClick={startExam} className="bg-blue-600 text-white px-12 py-5 rounded-[2rem] font-black text-xl shadow-2xl hover:scale-105 transition-all">과정 시작하기 👉</button>
            </div>
          )}

          {view === 'student-take' && (
            <div className="max-w-xl mx-auto space-y-6 animate-in">
              {questionQueue.length > 0 && (
                <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm space-y-6">
                  <h2 className="text-xl font-bold leading-tight">{questionQueue[0].q.text}</h2>
                  <div className="grid gap-3">
                    {questionQueue[0].q.options.map((opt, i) => (
                      <button key={i} onClick={() => { if(!isAnswerChecked) { setCurrentSelectedOption(i); setIsAnswerChecked(true); } }} className={`text-left p-5 rounded-2xl border-2 font-bold transition-all ${isAnswerChecked ? (i === questionQueue[0].q.answerIndex ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : (i === currentSelectedOption ? 'border-red-500 bg-red-50 text-red-600' : 'opacity-40')) : 'hover:border-blue-400 border-slate-100'}`}>
                        {i+1}. {opt}
                      </button>
                    ))}
                  </div>
                  {isAnswerChecked && (
                    <button onClick={() => {
                      const correct = currentSelectedOption === questionQueue[0].q.answerIndex;
                      let next = [...questionQueue]; const item = next.shift();
                      if(!correct && item) next.push(item);
                      setQuestionQueue(next); setIsAnswerChecked(false); setCurrentSelectedOption(null);
                      if(next.length === 0) submitExam({});
                    }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold mt-4">다음 문제</button>
                  )}
                </div>
              )}
              {exams.find(e => e.id === currentExamId)?.mode === 'test' && activeQuestions.map((q, idx) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border mb-4">
                  <p className="font-bold mb-4">{idx+1}. {q.text}</p>
                  <div className="grid gap-2">
                    {q.options.map((opt, oi) => (
                      <button key={oi} onClick={() => setTestAnswers({...testAnswers, [idx]: oi})} className={`p-3 rounded-xl border-2 text-left text-sm font-bold ${testAnswers[idx] === oi ? 'border-blue-600 bg-blue-50' : 'border-slate-50'}`}>{opt}</button>
                    ))}
                  </div>
                </div>
              ))}
              {exams.find(e => e.id === currentExamId)?.mode === 'test' && <button onClick={() => submitExam(testAnswers)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black text-xl">퀴즈 제출하기</button>}
            </div>
          )}

          {view === 'student-result' && (
            <div className="py-20 text-center animate-in space-y-6">
              <h2 className="text-4xl font-black">수고하셨습니다!</h2>
              <div className="text-7xl font-black text-blue-600">{studentScore}점</div>
              <button onClick={() => setView('home')} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold shadow-lg">메인으로</button>
            </div>
          )}

          {view === 'admin-login' && (
            <div className="max-w-xs mx-auto py-20 text-center animate-in">
              <h2 className="text-2xl font-black mb-8">관리자 접속</h2>
              <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full border p-4 rounded-2xl mb-4 text-center" placeholder="비밀번호" />
              <button onClick={() => adminPasswordInput === '2026' ? setView('admin-dash') : showToast('불일치')} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold">인증</button>
            </div>
          )}

          {view === 'admin-dash' && (
            <div className="animate-in space-y-6">
              <div className="flex bg-white p-2 rounded-2xl border w-fit font-bold text-sm">
                <button onClick={() => setAdminTab('exams')} className={`px-4 py-2 rounded-xl ${adminTab === 'exams' ? 'bg-blue-600 text-white' : ''}`}>세트 관리</button>
                <button onClick={() => setAdminTab('bank')} className={`px-4 py-2 rounded-xl ${adminTab === 'bank' ? 'bg-blue-600 text-white' : ''}`}>저장고</button>
              </div>
              <p className="text-slate-400 text-sm">관리자 기능이 활성화되었습니다.</p>
              <button onClick={() => setView('home')} className="text-blue-600 font-bold text-sm underline">메인화면으로 돌아가기</button>
            </div>
          )}
        </main>
      </div>

      {toastMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full text-sm font-bold shadow-2xl z-[100] animate-in">{toastMessage}</div>}
    </>
  );
}
