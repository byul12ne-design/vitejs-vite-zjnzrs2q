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
  
  // 로그인 인풋 상태
  const [empIdInput, setEmpIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  // 학습/평가 상태
  const [currentExamId, setCurrentExamId] = useState(''); 
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionQueue, setQuestionQueue] = useState<{q: Question, originalIndex: number}[]>([]);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [currentSelectedOption, setCurrentSelectedOption] = useState<number | null>(null);
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  // 창고 상태
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

  const handleBatchDelete = async () => {
    if (selectedBankIds.size === 0) return;
    if (!window.confirm('선택 항목을 삭제하시겠습니까?')) return;
    const batch = writeBatch(db);
    selectedBankIds.forEach(id => batch.delete(doc(db, 'questionBank', id)));
    await batch.commit();
    setSelectedBankIds(new Set());
    showToast('삭제 완료');
  };

  // 💡 [수정] 인증 오류 수정 및 고정 비밀번호 원상 복구
  const handleStudentAuth = async () => {
    if (empIdInput.length !== 8) return showToast('사번 8자리 숫자를 확인하세요.');
    
    const finalId = `WN${empIdInput}`;
    const email = `${finalId.toLowerCase()}@wuerth.exam`;
    const pw = "WuerthExamSecretPassword2026!"; // 기존 가입자와 호환되는 원래 비밀번호 복구

    try {
      if (authMode === 'register') {
        if (!nameInput.trim()) return showToast('이름을 입력해주세요.');
        const c = await createUserWithEmailAndPassword(auth, email, pw);
        await setDoc(doc(db, 'users', c.user.uid), { uid: c.user.uid, employeeId: finalId, name: nameInput });
        showToast('등록 및 로그인 완료!');
      } else {
        await signInWithEmailAndPassword(auth, email, pw);
        showToast('로그인 성공!');
      }
    } catch (e: any) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found') {
        showToast('등록되지 않은 사번입니다. [최초 등록]을 진행해주세요.');
      } else if (e.code === 'auth/email-already-in-use') {
        showToast('이미 등록된 사번입니다. [로그인] 탭을 이용해주세요.');
      } else {
        showToast('인증 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  const startExam = (exam: Exam) => {
    const qList = [...exam.questions].sort(() => Math.random() - 0.5);
    setActiveQuestions(qList);
    setCurrentExamId(exam.id);
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
      setDoc(doc(db, 'progress', `${userProfile.uid}_${currentExamId}`), { mastered: arrayUnion(current?.q.text) }, { merge: true });
    } else if (current) next.push(current);
    
    setQuestionQueue(next);
    setIsAnswerChecked(false);
    setCurrentSelectedOption(null);
    if (next.length === 0) {
      setStudentScore(100);
      setView('student-result');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <nav className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
        {/* 💡 [수정] 뷔르트 로고 원상 복구 */}
        <h1 onClick={() => setView('home')} className="cursor-pointer flex items-center gap-2">
          {APP_CONFIG.logoImageUrl ? (
            <img src={APP_CONFIG.logoImageUrl} alt="Logo" className="h-8 object-contain" />
          ) : (
            <span className="text-blue-600 font-bold">WÜRTH QUIZ</span>
          )}
        </h1>
        {userProfile && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold">{userProfile.name} 님</span>
            <button onClick={() => signOut(auth)} className="text-[10px] bg-slate-100 p-1.5 rounded font-bold hover:bg-slate-200">로그아웃</button>
          </div>
        )}
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        {view === 'home' && !userProfile && (
          <div className="py-10 text-center max-w-sm mx-auto space-y-6">
            <div className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
              <div className="flex bg-slate-100 p-1 rounded-xl text-sm font-bold">
                <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-lg transition-all ${authMode === 'login' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>로그인</button>
                <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-lg transition-all ${authMode === 'register' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>최초 등록</button>
              </div>
              
              <div className="space-y-4">
                {/* 💡 [수정] WN 고정 글자 및 숫자 전용 입력창 원상 복구 */}
                <div className="flex items-center bg-slate-50 border rounded-2xl focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all overflow-hidden">
                  <span className="pl-5 pr-2 font-black text-slate-400">WN</span>
                  <input 
                    type="text"
                    value={empIdInput} 
                    onChange={e => setEmpIdInput(e.target.value.replace(/[^0-9]/g, ''))} 
                    maxLength={8}
                    className="w-full bg-transparent p-4 pl-1 text-sm outline-none font-bold placeholder:font-normal text-slate-700" 
                    placeholder="사번 숫자 8자리"
                  />
                </div>

                {authMode === 'register' && (
                  <input 
                    value={nameInput} 
                    onChange={e => setNameInput(e.target.value)} 
                    className="w-full bg-slate-50 border p-4 rounded-2xl text-sm outline-none focus:border-blue-500 transition-colors text-center font-bold" 
                    placeholder="실명 (예: 홍길동)"
                  />
                )}
              </div>

              <button onClick={handleStudentAuth} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold transition-all shadow-md mt-2">
                {authMode === 'login' ? '입장하기' : '등록하고 입장하기'}
              </button>
            </div>
            <button onClick={() => setView('admin-login')} className="text-slate-300 hover:text-slate-500 text-xs font-bold transition-colors">⚙️ 관리자 접속</button>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-xs mx-auto py-10">
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full border p-4 rounded-2xl mb-4 text-center" placeholder="비밀번호"/>
            <button onClick={() => adminPasswordInput === '2026' ? setView('admin-dash') : showToast('실패')} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold">접속</button>
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
                  <select value={bankCategoryFilter} onChange={e => setBankCategoryFilter(e.target.value)} className="p-2 rounded-lg border text-xs font-bold flex-1 outline-none">
                    <option value="all">전체보기</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={handleBatchDelete} className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs font-bold border border-red-100 whitespace-nowrap">선택 삭제 ({selectedBankIds.size})</button>
                </div>
                <div className="grid gap-2">
                  {filteredBank.map(q => (
                    <label key={q.id} className="bg-white p-4 rounded-xl border flex gap-3 cursor-pointer hover:border-blue-300 transition-colors">
                      <input type="checkbox" checked={selectedBankIds.has(q.id)} onChange={e => {
                        const n = new Set(selectedBankIds);
                        if(e.target.checked) n.add(q.id); else n.delete(q.id);
                        setSelectedBankIds(n);
                      }} className="accent-blue-600 w-4 h-4 mt-1 cursor-pointer" />
                      <div><span className="text-[10px] text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded">{q.category}</span><p className="font-bold text-sm mt-1">{q.text}</p></div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {adminTab === 'exams' && (
              <div className="grid gap-2">
                {exams.map(ex => (
                  <div key={ex.id} className="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <span className="font-bold text-slate-800">{ex.title}</span>
                    <button onClick={() => startExam(ex)} className="text-xs bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold hover:bg-blue-100">미리보기</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'student-take' && (
          <div className="space-y-4">
            {/* 자율 학습 모드 */}
            {questionQueue.length > 0 && (
              <div className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                <h2 className="text-xl font-bold leading-relaxed">{questionQueue[0].q.text}</h2>
                <div className="grid gap-3">
                  {questionQueue[0].q.options.map((opt, i) => (
                    <button key={i} onClick={() => { if(!isAnswerChecked) { setCurrentSelectedOption(i); setIsAnswerChecked(true); } }} className={`text-left p-5 rounded-2xl border-2 font-bold transition-all ${isAnswerChecked ? (i === questionQueue[0].q.answerIndex ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : (i === currentSelectedOption ? 'border-red-500 bg-red-50 text-red-700' : 'opacity-40 border-slate-100')) : 'hover:border-blue-400 hover:bg-blue-50 border-slate-100'}`}>{i+1}. {opt}</button>
                  ))}
                </div>
                {isAnswerChecked && <button onClick={handleNext} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold mt-4 shadow-lg active:scale-95 transition-all">다음 문제</button>}
              </div>
            )}
            
            {/* 평가형 모드 UI */}
            {exams.find(e => e.id === currentExamId)?.mode === 'test' && questionQueue.length === 0 && (
              <div className="space-y-6">
                {activeQuestions.map((q, i) => (
                  <div key={i} className="bg-white p-8 rounded-3xl border shadow-sm">
                    <p className="font-bold text-lg mb-6 leading-relaxed"><span className="text-blue-500 mr-2">{i+1}.</span>{q.text}</p>
                    <div className="grid gap-3">
                      {q.options.map((opt, oi) => (
                        <button key={oi} onClick={() => setTestAnswers({...testAnswers, [i]: oi})} className={`text-left p-4 rounded-2xl border-2 font-bold transition-all ${testAnswers[i] === oi ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:bg-slate-50'}`}>{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={() => { setStudentScore(100); setView('student-result'); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-3xl font-black text-xl shadow-xl active:scale-95 transition-all">전체 답안 제출</button>
              </div>
            )}
          </div>
        )}

        {view === 'student-result' && (
          <div className="py-20 text-center space-y-6">
            <h2 className="text-4xl font-black text-slate-800">수고하셨습니다!</h2>
            <div className="text-6xl font-black text-blue-600 drop-shadow-md">{studentScore}점</div>
            <button onClick={() => setView('home')} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-bold hover:bg-slate-800 shadow-xl mt-8">메인으로</button>
          </div>
        )}
      </main>

      {toastMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full text-sm shadow-2xl font-bold whitespace-nowrap z-50 animate-fade-in-up">{toastMessage}</div>}
    </div>
  );
}
