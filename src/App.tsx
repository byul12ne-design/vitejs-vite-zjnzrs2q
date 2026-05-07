import { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut, 
  type User // import type 사용 (TS1484 에러 해결)
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

// ==========================================
// 🛠️ [설정] 앱 설정 및 Firebase
// ==========================================
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
  displayCount: number;
  createdAt: number;
  mode: 'study' | 'test';
}

interface UserProfile {
  uid: string;
  employeeId: string;
  name: string;
  role: 'student' | 'admin';
}

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

  // 학습/시험 관련
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionQueue, setQuestionQueue] = useState<{q: Question, originalIndex: number}[]>([]);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [currentSelectedOption, setCurrentSelectedOption] = useState<number | null>(null);
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  // 문제 창고 관련
  const [bankCategoryFilter, setBankCategoryFilter] = useState<string>('all');
  const [selectedBankQuestions, setSelectedBankQuestions] = useState<Set<string>>(new Set());
  const [newBankQuestion, setNewBankQuestion] = useState<Question>({ category: '', text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (docSnap.exists()) setUserProfile(docSnap.data() as UserProfile);
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snap) => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
    });
    const unsubBank = onSnapshot(query(collection(db, 'questionBank'), orderBy('createdAt', 'desc')), (snap) => {
      setQuestionBank(snap.docs.map(d => ({ id: d.id, ...d.data() } as BankQuestion)));
    });
    return () => { unsubExams(); unsubBank(); };
  }, [user]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredBank = useMemo(() => {
    return questionBank.filter(q => bankCategoryFilter === 'all' || q.category === bankCategoryFilter);
  }, [questionBank, bankCategoryFilter]);

  const categories = useMemo(() => {
    return Array.from(new Set(questionBank.map(q => q.category || '미분류')));
  }, [questionBank]);

  const handleStudentAuth = async () => {
    if (empIdInput.length !== 8) return showToast('사번 8자리를 입력하세요.');
    const email = `wn${empIdInput}@wuerth.exam`;
    const pw = "WuerthExamSecret2026!";
    try {
      if (authMode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, employeeId: `WN${empIdInput}`, name: nameInput, role: 'student' });
      } else {
        await signInWithEmailAndPassword(auth, email, pw);
      }
    } catch (e) { showToast('인증 오류'); }
  };

  const startExam = async (examId: string) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam || !userProfile) return;
    const selected = [...exam.questions].sort(() => Math.random() - 0.5);
    setActiveQuestions(selected);
    setCurrentExamId(examId);
    if (exam.mode === 'test') {
      setTestAnswers({});
    } else {
      setQuestionQueue(selected.map((q, i) => ({ q, originalIndex: i })));
    }
    setView('student-take');
  };

  const handleStudyNext = async () => {
    const current = questionQueue[0];
    const isCorrect = currentSelectedOption === current.q.answerIndex;
    let nextQueue = [...questionQueue];
    nextQueue.shift();
    if (isCorrect) {
      await setDoc(doc(db, 'progress', `${userProfile?.uid}_${currentExamId}`), {
        masteredQuestionTexts: arrayUnion(current.q.text),
        updatedAt: Date.now()
      }, { merge: true });
    } else {
      nextQueue.push(current);
    }
    setQuestionQueue(nextQueue);
    setIsAnswerChecked(false);
    setCurrentSelectedOption(null);
    if (nextQueue.length === 0) setView('student-result');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="p-4 bg-white border-b flex justify-between items-center">
        <img src={APP_CONFIG.logoImageUrl} alt="Logo" className="h-6" onClick={() => setView('home')} />
        {userProfile && <span className="text-sm font-bold">{userProfile.name} 님</span>}
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        {view === 'home' && !userProfile && (
          <div className="py-10 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-sm border space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg ${authMode === 'login' ? 'bg-white shadow' : ''}`}>로그인</button>
                <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg ${authMode === 'register' ? 'bg-white shadow' : ''}`}>등록</button>
              </div>
              <input value={empIdInput} onChange={e => setEmpIdInput(e.target.value)} className="w-full border p-3 rounded-xl" placeholder="사번 8자리"/>
              {authMode === 'register' && <input value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full border p-3 rounded-xl" placeholder="이름"/>}
              <button onClick={handleStudentAuth} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">시작하기</button>
            </div>
            <button onClick={() => setView('admin-login')} className="mt-8 text-slate-300 text-xs">관리자</button>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-xs mx-auto py-10">
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full border p-3 rounded-xl mb-4" placeholder="비밀번호"/>
            <button onClick={() => adminPasswordInput === '2026' ? setView('admin-dash') : showToast('불일치')} className="w-full bg-slate-800 text-white py-3 rounded-xl">접속</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <button onClick={() => setAdminTab('exams')} className={`px-4 py-2 rounded-lg ${adminTab === 'exams' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>시험관리</button>
              <button onClick={() => setAdminTab('bank')} className={`px-4 py-2 rounded-lg ${adminTab === 'bank' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>문제창고</button>
            </div>

            {adminTab === 'bank' && (
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-2xl border space-y-3">
                  <input value={newBankQuestion.category} onChange={e => setNewBankQuestion({...newBankQuestion, category: e.target.value})} className="w-full border p-2 rounded-lg text-sm" placeholder="카테고리"/>
                  <textarea value={newBankQuestion.text} onChange={e => setNewBankQuestion({...newBankQuestion, text: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="문제 내용"/>
                  <button onClick={async () => { await addDoc(collection(db, 'questionBank'), { ...newBankQuestion, createdAt: Date.now() }); showToast('저장됨'); }} className="w-full bg-blue-600 text-white py-2 rounded-lg">저장</button>
                </div>
                <select value={bankCategoryFilter} onChange={e => setBankCategoryFilter(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                  <option value="all">전체보기</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="grid gap-2">
                  {filteredBank.map(q => (
                    <div key={q.id} className="bg-white p-4 rounded-xl border flex gap-3">
                      <input type="checkbox" checked={selectedBankQuestions.has(q.id)} onChange={(e) => {
                        const next = new Set(selectedBankQuestions);
                        if(e.target.checked) next.add(q.id); else next.delete(q.id);
                        setSelectedBankQuestions(next);
                      }} />
                      <div>
                        <span className="text-[10px] text-blue-500 font-bold">{q.category}</span>
                        <p className="font-bold text-sm">{q.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adminTab === 'exams' && (
              <div className="grid gap-2">
                {exams.map(ex => (
                  <div key={ex.id} className="bg-white p-4 rounded-xl border flex justify-between items-center">
                    <span className="font-bold">{ex.title}</span>
                    <button onClick={() => startExam(ex.id)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg">미리보기</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'student-take' && questionQueue.length > 0 && (
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
              <h2 className="text-lg font-bold">{questionQueue[0].q.text}</h2>
              <div className="grid gap-2">
                {questionQueue[0].q.options.map((opt, i) => (
                  <button key={i} onClick={() => { setCurrentSelectedOption(i); setIsAnswerChecked(true); }} className={`text-left p-4 rounded-xl border ${isAnswerChecked ? (i === questionQueue[0].q.answerIndex ? 'bg-emerald-50 border-emerald-500' : 'opacity-50') : 'hover:bg-slate-50'}`}>{i+1}. {opt}</button>
                ))}
              </div>
              {isAnswerChecked && <button onClick={handleStudyNext} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">다음</button>}
            </div>
          </div>
        )}

        {view === 'student-result' && (
          <div className="py-20 text-center space-y-4">
            <h2 className="text-3xl font-black">학습 완료!</h2>
            <button onClick={() => setView('home')} className="bg-blue-600 text-white px-8 py-3 rounded-xl">홈으로</button>
          </div>
        )}
      </main>

      {toastMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-3 rounded-full text-sm">{toastMessage}</div>}
    </div>
  );
}
