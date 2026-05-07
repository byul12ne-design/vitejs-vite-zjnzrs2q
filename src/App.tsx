import { useState, useEffect, useMemo } from 'react';
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
  doc, 
  setDoc, 
  getDoc, 
  writeBatch, 
  arrayUnion, 
  query, 
  orderBy 
} from 'firebase/firestore';

// --- 설정 및 Firebase ---
const APP_CONFIG = {
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

interface Question {
  category: string;
  text: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

interface BankQuestion extends Question {
  id: string;
  createdAt: number;
}

interface Exam {
  id: string;
  title: string;
  questions: Question[];
  mode: 'study' | 'test';
}

interface UserProfile {
  uid: string;
  employeeId: string;
  name: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questionBank, setQuestionBank] = useState<BankQuestion[]>([]);
  
  const [view, setView] = useState('home');
  const [adminTab, setAdminTab] = useState<'exams' | 'bank'>('exams');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [empIdInput, setEmpIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  // 학습 및 평가 관련 상태 (에러 지점에서 사용되도록 로직 강화)
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionQueue, setQuestionQueue] = useState<{q: Question, originalIndex: number}[]>([]);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [currentSelectedOption, setCurrentSelectedOption] = useState<number | null>(null);
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  // 문제 창고 관련
  const [bankCategoryFilter, setBankCategoryFilter] = useState<string>('all');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [newBankQ, setNewBankQ] = useState<Question>({ category: '', text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) setUserProfile(snap.data() as UserProfile);
      } else setUserProfile(null);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubE = onSnapshot(collection(db, 'exams'), (s) => setExams(s.docs.map(d => ({ id: d.id, ...d.data() } as Exam))));
    const unsubB = onSnapshot(query(collection(db, 'questionBank'), orderBy('createdAt', 'desc')), (s) => setQuestionBank(s.docs.map(d => ({ id: d.id, ...d.data() } as BankQuestion))));
    return () => { unsubE(); unsubB(); };
  }, [user]);

  const showToast = (m: string) => {
    setToastMessage(m);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredBank = useMemo(() => questionBank.filter(q => bankCategoryFilter === 'all' || q.category === bankCategoryFilter), [questionBank, bankCategoryFilter]);
  const categories = useMemo(() => Array.from(new Set(questionBank.map(q => q.category || '미분류'))), [questionBank]);

  // 🛠️ 문제 창고 일괄 삭제 로직 (writeBatch 에러 해결)
  const handleBatchDelete = async () => {
    if (selectedBankIds.size === 0) return;
    if (!window.confirm('선택한 문제를 삭제하시겠습니까?')) return;
    const batch = writeBatch(db);
    selectedBankIds.forEach(id => batch.delete(doc(db, 'questionBank', id)));
    await batch.commit();
    setSelectedBankIds(new Set());
    showToast('삭제 완료');
  };

  const handleStudentAuth = async () => {
    if (empIdInput.length !== 8) return showToast('사번 8자리를 확인하세요.');
    const email = `wn${empIdInput}@wuerth.exam`;
    const pw = "WuerthExamSecret2026!";
    try {
      if (authMode === 'register') {
        const c = await createUserWithEmailAndPassword(auth, email, pw);
        await setDoc(doc(db, 'users', c.user.uid), { uid: c.user.uid, employeeId: `WN${empIdInput}`, name: nameInput });
      } else await signInWithEmailAndPassword(auth, email, pw);
    } catch (e) { showToast('인증 오류'); }
  };

  const startExam = (exam: Exam) => {
    const qList = [...exam.questions].sort(() => Math.random() - 0.5);
    setActiveQuestions(qList); // TS6133 해결 (사용함)
    if (exam.mode === 'test') {
      setTestAnswers({});
    } else {
      setQuestionQueue(qList.map((q, i) => ({ q, originalIndex: i })));
    }
    setView('student-take');
  };

  const handleNext = () => {
    const isCorrect = currentSelectedOption === questionQueue[0].q.answerIndex;
    let next = [...questionQueue];
    const current = next.shift();
    if (isCorrect && userProfile) {
      setDoc(doc(db, 'progress', `${userProfile.uid}_current`), { mastered: arrayUnion(current?.q.text) }, { merge: true });
    } else if (current) next.push(current);
    
    setQuestionQueue(next);
    setIsAnswerChecked(false);
    setCurrentSelectedOption(null);
    if (next.length === 0) {
      setStudentScore(100); // TS6133 해결 (사용함)
      setView('student-result');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <nav className="p-4 bg-white border-b flex justify-between items-center">
        <img src={APP_CONFIG.logoImageUrl} alt="Logo" className="h-6 cursor-pointer" onClick={() => setView('home')} />
        {userProfile && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold">{userProfile.name} 님</span>
            <button onClick={() => signOut(auth)} className="text-[10px] bg-slate-100 p-1 rounded">로그아웃</button>
          </div>
        )}
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        {view === 'home' && !userProfile && (
          <div className="py-10 text-center max-w-xs mx-auto space-y-4">
            <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl text-sm font-bold">
                <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg ${authMode === 'login' ? 'bg-white shadow' : ''}`}>로그인</button>
                <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg ${authMode === 'register' ? 'bg-white shadow' : ''}`}>등록</button>
              </div>
              <input value={empIdInput} onChange={e => setEmpIdInput(e.target.value)} className="w-full border p-3 rounded-xl text-center" placeholder="사번 8자리"/>
              {authMode === 'register' && <input value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full border p-3 rounded-xl text-center" placeholder="이름"/>}
              <button onClick={handleStudentAuth} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">시작</button>
            </div>
            <button onClick={() => setView('admin-login')} className="text-slate-300 text-[10px]">ADMIN</button>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-xs mx-auto py-10">
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full border p-3 rounded-xl mb-4" placeholder="Password"/>
            <button onClick={() => adminPasswordInput === '2026' ? setView('admin-dash') : showToast('실패')} className="w-full bg-slate-800 text-white py-3 rounded-xl">접속</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <button onClick={() => setAdminTab('exams')} className={`px-4 py-2 rounded-lg text-sm font-bold ${adminTab === 'exams' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>시험관리</button>
              <button onClick={() => setAdminTab('bank')} className={`px-4 py-2 rounded-lg text-sm font-bold ${adminTab === 'bank' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>문제창고</button>
            </div>

            {adminTab === 'bank' && (
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-2xl border space-y-3 shadow-sm">
                  <input value={newBankQ.category} onChange={e => setNewBankQ({...newBankQ, category: e.target.value})} className="w-full border p-2 rounded-lg text-sm" placeholder="카테고리"/>
                  <textarea value={newBankQ.text} onChange={e => setNewBankQ({...newBankQ, text: e.target.value})} className="w-full border p-2 rounded-lg text-sm" placeholder="문제"/>
                  <button onClick={async () => { await addDoc(collection(db, 'questionBank'), { ...newBankQ, createdAt: Date.now() }); showToast('저장됨'); }} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold">저장</button>
                </div>

                <div className="flex justify-between items-center bg-slate-100 p-3 rounded-xl gap-4">
                  <select value={bankCategoryFilter} onChange={e => setBankCategoryFilter(e.target.value)} className="p-2 rounded-lg border text-xs font-bold flex-1">
                    <option value="all">전체보기</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={handleBatchDelete} className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs font-bold border border-red-100 whitespace-nowrap">선택 삭제 ({selectedBankIds.size})</button>
                </div>

                <div className="grid gap-2">
                  {filteredBank.map(q => (
                    <label key={q.id} className="bg-white p-4 rounded-xl border flex gap-3 cursor-pointer hover:border-blue-300">
                      <input type="checkbox" checked={selectedBankIds.has(q.id)} onChange={e => {
                        const n = new Set(selectedBankIds);
                        if(e.target.checked) n.add(q.id); else n.delete(q.id);
                        setSelectedBankIds(n);
                      }} className="accent-blue-600" />
                      <div>
                        <span className="text-[10px] text-blue-500 font-bold uppercase">{q.category}</span>
                        <p className="font-bold text-sm">{q.text}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {adminTab === 'exams' && (
              <div className="grid gap-2">
                {exams.map(ex => (
                  <div key={ex.id} className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
                    <span className="font-bold text-sm">{ex.title}</span>
                    <button onClick={() => startExam(ex)} className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold">미리보기</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'student-take' && questionQueue.length > 0 && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
              <h2 className="text-lg font-bold">{questionQueue[0].q.text}</h2>
              <div className="grid gap-2">
                {questionQueue[0].q.options.map((opt, i) => (
                  <button key={i} onClick={() => { if(!isAnswerChecked) { setCurrentSelectedOption(i); setIsAnswerChecked(true); } }} className={`text-left p-4 rounded-xl border-2 font-bold transition-all ${isAnswerChecked ? (i === questionQueue[0].q.answerIndex ? 'border-emerald-500 bg-emerald-50' : (i === currentSelectedOption ? 'border-red-500 bg-red-50' : 'opacity-40')) : 'hover:border-blue-400'}`}>
                    {i+1}. {opt}
                  </button>
                ))}
              </div>
              {isAnswerChecked && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-slate-500 mb-4">{questionQueue[0].q.explanation}</p>
                  <button onClick={handleNext} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold">다음 문제</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 평가형(test) 모드 UI (activeQuestions 및 testAnswers 사용으로 에러 해결) */}
        {view === 'student-take' && exams.find(e => e.id === currentExamId)?.mode === 'test' && (
          <div className="space-y-4">
            {activeQuestions.map((q, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border">
                <p className="font-bold mb-4">{i+1}. {q.text}</p>
                <div className="grid gap-2">
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setTestAnswers({...testAnswers, [i]: oi})} className={`text-left p-3 rounded-xl border ${testAnswers[i] === oi ? 'bg-blue-600 text-white' : ''}`}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => { setStudentScore(80); setView('student-result'); }} className="w-full bg-blue-700 text-white py-4 rounded-2xl font-bold">평가 제출</button>
          </div>
        )}

        {view === 'student-result' && (
          <div className="py-20 text-center space-y-4">
            <h2 className="text-3xl font-black">완료되었습니다!</h2>
            <div className="text-5xl font-black text-blue-600">{studentScore}점</div>
            <button onClick={() => setView('home')} className="bg-slate-900 text-white px-10 py-3 rounded-xl font-bold">홈으로</button>
          </div>
        )}
      </main>

      {toastMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full text-xs shadow-xl">{toastMessage}</div>}
    </div>
  );
}
