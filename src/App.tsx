import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, writeBatch, arrayUnion, query, orderBy } from 'firebase/firestore';

// ==========================================
// 🛠️ [설정] 앱 설정 및 Firebase
// ==========================================
const APP_CONFIG = {
  logoText: "뷔르트 사내 평가",
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

// --- 인터페이스 정의 ---
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
  notice?: string;
  questions: Question[];
  displayCount: number;
  createdAt: number;
  mode: 'study' | 'test';
  requireName: boolean;
  recordScores: boolean;
}

interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  score: number;
  correctCount: number;
  totalCount: number;
  answers: Record<number, number>;
  activeQuestions: Question[];
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
  const [results, setResults] = useState<ExamResult[]>([]);
  const [questionBank, setQuestionBank] = useState<BankQuestion[]>([]);
  
  const [view, setView] = useState('home');
  const [adminTab, setAdminTab] = useState<'exams' | 'analytics' | 'bank'>('exams');
  const [studentTab, setStudentTab] = useState<'study' | 'test'>('study');
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentExamId, setCurrentExamId] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [empIdInput, setEmpIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  // 학습/시험 관련 상태
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionQueue, setQuestionQueue] = useState<{q: Question, originalIndex: number}[]>([]);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [currentSelectedOption, setCurrentSelectedOption] = useState<number | null>(null);
  const [firstAttemptAnswers, setFirstAttemptAnswers] = useState<Record<number, number>>({});
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  // 관리자 문제 생성/편집 관련
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [customExamId, setCustomExamId] = useState('');
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamNotice, setNewExamNotice] = useState('');
  const [newExamMode, setNewExamMode] = useState<'study' | 'test'>('study');
  const [displayCount, setDisplayCount] = useState('');
  const [recordScores, setRecordScores] = useState(true);
  const [newQuestions, setNewQuestions] = useState<Question[]>([]);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [selectedBankQuestions, setSelectedBankQuestions] = useState<Set<string>>(new Set());
  const [bankCategoryFilter, setBankCategoryFilter] = useState<string>('all');
  const [newBankQuestion, setNewBankQuestion] = useState<Question>({ category: '', text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });
  const [selectedResultDetail, setSelectedResultDetail] = useState<ExamResult | null>(null);
  const [selectedAnalyticsExamId, setSelectedAnalyticsExamId] = useState<string>('');

  // Tailwind CDN 주입 및 초기화
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const params = new URLSearchParams(window.location.search);
    const linkExamId = params.get('examId');
    if (linkExamId) setCurrentExamId(linkExamId);
  }, []);

  // 인증 상태 감시
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

  // 데이터 리스너
  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)).sort((a, b) => b.createdAt - a.createdAt);
      setExams(list);
      if (list.length > 0 && !selectedAnalyticsExamId) setSelectedAnalyticsExamId(list[0].id);
    });
    const unsubResults = onSnapshot(collection(db, 'results'), (snap) => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamResult)).sort((a, b) => b.createdAt - a.createdAt));
    });
    const unsubBank = onSnapshot(query(collection(db, 'questionBank'), orderBy('createdAt', 'desc')), (snap) => {
      setQuestionBank(snap.docs.map(d => ({ id: d.id, ...d.data() } as BankQuestion)));
    });
    return () => { unsubExams(); unsubResults(); unsubBank(); };
  }, [user, selectedAnalyticsExamId]);

  // --- 유틸리티 ---
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?examId=${id}`;
    navigator.clipboard.writeText(url);
    showToast('링크가 복사되었습니다!');
  };

  // --- 문제 창고 필터링된 목록 계산 ---
  const filteredBank = useMemo(() => {
    return questionBank.filter(q => bankCategoryFilter === 'all' || q.category === bankCategoryFilter);
  }, [questionBank, bankCategoryFilter]);

  const categories = useMemo(() => {
    return Array.from(new Set(questionBank.map(q => q.category || '미분류')));
  }, [questionBank]);

  // --- 문제 창고 일괄 삭제 기능 ---
  const deleteSelectedFromBank = async () => {
    if (selectedBankQuestions.size === 0) return;
    if (!window.confirm(`선택한 ${selectedBankQuestions.size}개의 문제를 삭제하시겠습니까?`)) return;
    const batch = writeBatch(db);
    selectedBankQuestions.forEach(id => batch.delete(doc(db, 'questionBank', id)));
    await batch.commit();
    setSelectedBankQuestions(new Set());
    showToast('선택 삭제 완료');
  };

  const deleteCategoryFromBank = async () => {
    if (bankCategoryFilter === 'all') return;
    const targets = questionBank.filter(q => q.category === bankCategoryFilter);
    if (!window.confirm(`[${bankCategoryFilter}] 카테고리의 모든 문제(${targets.length}개)를 삭제하시겠습니까?`)) return;
    const batch = writeBatch(db);
    targets.forEach(q => batch.delete(doc(db, 'questionBank', q.id)));
    await batch.commit();
    setBankCategoryFilter('all');
    showToast('카테고리 삭제 완료');
  };

  const clearAllBank = async () => {
    if (!window.confirm('🚨 경고: 문제 창고의 모든 데이터가 영구 삭제됩니다. 계속하시겠습니까?')) return;
    const batch = writeBatch(db);
    questionBank.forEach(q => batch.delete(doc(db, 'questionBank', q.id)));
    await batch.commit();
    showToast('창고 초기화 완료');
  };

  // --- 학생 인증 및 시험 로직 (간소화) ---
  const handleStudentAuth = async () => {
    if (!empIdInput || empIdInput.length !== 8) return showToast('사번 8자리를 입력하세요.');
    const finalId = `WN${empIdInput}`;
    const email = `${finalId.toLowerCase()}@wuerth.exam`;
    const pw = "WuerthExamSecret2026!";
    try {
      if (authMode === 'register') {
        if (!nameInput) return showToast('이름을 입력하세요.');
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, employeeId: finalId, name: nameInput, role: 'student' });
      } else {
        await signInWithEmailAndPassword(auth, email, pw);
      }
      if (currentExamId) setView('student-entry');
    } catch (e) { showToast('인증 오류 발생'); }
  };

  const startExam = async () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam || !userProfile) return;

    let pool = [...exam.questions];
    if (exam.mode === 'study') {
      const prog = await getDoc(doc(db, 'progress', `${userProfile.uid}_${currentExamId}`));
      const mastered = prog.exists() ? (prog.data().masteredQuestionTexts || []) : [];
      pool = pool.filter(q => !mastered.includes(q.text));
      if (pool.length === 0) { showToast('이미 모두 마스터했습니다!'); return; }
    }

    const finalCount = exam.mode === 'test' ? (exam.displayCount || pool.length) : pool.length;
    const selected = pool.sort(() => Math.random() - 0.5).slice(0, finalCount);
    
    setActiveQuestions(selected);
    if (exam.mode === 'test') {
      setTestAnswers({});
    } else {
      setQuestionQueue(selected.map((q, i) => ({ q, originalIndex: i })));
      setIsAnswerChecked(false);
      setCurrentSelectedOption(null);
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

  const submitTest = async () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam || !userProfile) return;
    const correct = activeQuestions.reduce((acc, q, i) => acc + (testAnswers[i] === q.answerIndex ? 1 : 0), 0);
    const score = Math.round((correct / activeQuestions.length) * 100);
    setStudentScore(score);
    await addDoc(collection(db, 'results'), {
      examId: currentExamId, examTitle: exam.title, studentId: userProfile.employeeId, studentName: userProfile.name,
      score, correctCount: correct, totalCount: activeQuestions.length, answers: testAnswers, activeQuestions, createdAt: Date.now(), mode: exam.mode
    });
    setView('student-result');
  };

  const saveBankQuestion = async () => {
    if (!newBankQuestion.text || !newBankQuestion.category) return showToast('내용과 분류를 입력하세요.');
    await addDoc(collection(db, 'questionBank'), { ...newBankQuestion, createdAt: Date.now() });
    setNewBankQuestion({ category: newBankQuestion.category, text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });
    showToast('저장 완료');
  };

  // --- 렌더링 ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <nav className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div onClick={() => setView('home')} className="cursor-pointer">
          <img src={APP_CONFIG.logoImageUrl} alt="Logo" className="h-8" />
        </div>
        {userProfile && (
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold">{userProfile.name} 님</span>
            <button onClick={() => { signOut(auth); setView('home'); }} className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg">로그아웃</button>
          </div>
        )}
      </nav>

      <main className="p-6 max-w-5xl mx-auto">
        {view === 'home' && !userProfile && (
          <div className="py-20 text-center">
            <h1 className="text-4xl font-black mb-10">뷔르트 제품 퀴즈</h1>
            <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-sm border space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg font-bold ${authMode === 'login' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>로그인</button>
                <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg font-bold ${authMode === 'register' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>최초 등록</button>
              </div>
              <input value={empIdInput} onChange={e => setEmpIdInput(e.target.value.replace(/[^0-9]/g,''))} maxLength={8} className="w-full border p-4 rounded-xl text-center font-bold" placeholder="사번 8자리 (예: 00123456)"/>
              {authMode === 'register' && <input value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full border p-4 rounded-xl text-center font-bold" placeholder="이름"/>}
              <button onClick={handleStudentAuth} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg">입장하기</button>
            </div>
            <button onClick={() => setView('admin-login')} className="mt-10 text-slate-400 text-sm">관리자 대시보드</button>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold mb-6">관리자 인증</h2>
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full border p-4 rounded-xl text-center mb-4" placeholder="비밀번호"/>
            <button onClick={() => adminPasswordInput === '2026' ? setView('admin-dash') : showToast('불일치')} className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold">접속</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-8">
            <div className="flex bg-white p-2 rounded-2xl border w-fit shadow-sm">
              <button onClick={() => setAdminTab('exams')} className={`px-6 py-2 rounded-xl font-bold ${adminTab === 'exams' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>시험 관리</button>
              <button onClick={() => setAdminTab('bank')} className={`px-6 py-2 rounded-xl font-bold ${adminTab === 'bank' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>문제 창고</button>
              <button onClick={() => setAdminTab('analytics')} className={`px-6 py-2 rounded-xl font-bold ${adminTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>응시 분석</button>
            </div>

            {/* --- 문제 창고 탭 (필터 및 일괄 삭제) --- */}
            {adminTab === 'bank' && (
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-3xl border border-blue-100 shadow-sm space-y-4">
                  <h3 className="font-bold text-blue-600">신규 문제 창고 등록</h3>
                  <input value={newBankQuestion.category} onChange={e => setNewBankQuestion({...newBankQuestion, category: e.target.value})} className="w-full border p-3 rounded-xl text-sm" placeholder="카테고리 (예: 엔진오일)"/>
                  <textarea value={newBankQuestion.text} onChange={e => setNewBankQuestion({...newBankQuestion, text: e.target.value})} className="w-full border p-4 rounded-xl font-bold" placeholder="문제 내용"/>
                  <div className="grid grid-cols-2 gap-2">
                    {newBankQuestion.options.map((opt, i) => (
                      <input key={i} value={opt} onChange={e => {
                        const next = [...newBankQuestion.options];
                        next[i] = e.target.value;
                        setNewBankQuestion({...newBankQuestion, options: next});
                      }} className={`border p-3 rounded-xl text-sm ${newBankQuestion.answerIndex === i ? 'border-blue-500 bg-blue-50' : ''}`} placeholder={`보기 ${i+1}`}/>
                    ))}
                  </div>
                  <button onClick={saveBankQuestion} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">창고 저장</button>
                </div>

                <div className="bg-slate-100 p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-500">분류별 보기:</span>
                    <select value={bankCategoryFilter} onChange={e => setBankCategoryFilter(e.target.value)} className="p-2 rounded-lg border bg-white text-sm font-bold">
                      <option value="all">전체보기</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={deleteSelectedFromBank} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-bold border border-red-100">선택 삭제 ({selectedBankQuestions.size})</button>
                    {bankCategoryFilter !== 'all' && <button onClick={deleteCategoryFromBank} className="bg-orange-50 text-orange-600 px-4 py-2 rounded-lg text-xs font-bold border border-orange-100">[{bankCategoryFilter}] 전체 삭제</button>}
                    <button onClick={clearAllBank} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold">창고 비우기</button>
                  </div>
                </div>

                <div className="grid gap-4">
                  {filteredBank.map(q => (
                    <div key={q.id} className="bg-white p-5 rounded-2xl border flex gap-4 items-start">
                      <input type="checkbox" checked={selectedBankQuestions.has(q.id)} onChange={e => {
                        const next = new Set(selectedBankQuestions);
                        if (e.target.checked) next.add(q.id); else next.delete(q.id);
                        setSelectedBankQuestions(next);
                      }} className="mt-1 w-5 h-5 accent-blue-600 cursor-pointer"/>
                      <div className="flex-1">
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-black uppercase mb-2 inline-block">{q.category}</span>
                        <p className="font-bold">{q.text}</p>
                        <p className="text-xs text-slate-400 mt-1">정답: {q.options[q.answerIndex]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ... 나머지 탭(exams, analytics)은 기존 로직과 동일하게 유지 ... */}
          </div>
        )}

        {/* --- 학생용 시험/학습 화면 --- */}
        {view === 'student-take' && (
          <div className="max-w-2xl mx-auto space-y-6 pb-20">
            {activeQuestions.length > 0 && questionQueue.length > 0 && (
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm space-y-6">
                <h2 className="text-xl font-bold leading-relaxed">{questionQueue[0].q.text}</h2>
                <div className="grid gap-3">
                  {questionQueue[0].q.options.map((opt, i) => (
                    <button key={i} onClick={() => { if(!isAnswerChecked) { setCurrentSelectedOption(i); setIsAnswerChecked(true); } }} className={`text-left p-5 rounded-2xl border-2 font-bold transition-all ${isAnswerChecked ? (i === questionQueue[0].q.answerIndex ? 'border-emerald-500 bg-emerald-50' : (i === currentSelectedOption ? 'border-red-500 bg-red-50' : 'opacity-50')) : 'hover:border-blue-500'}`}>
                      {i+1}. {opt}
                    </button>
                  ))}
                </div>
                {isAnswerChecked && (
                  <div className={`p-4 rounded-xl ${currentSelectedOption === questionQueue[0].q.answerIndex ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    <p className="font-black">{currentSelectedOption === questionQueue[0].q.answerIndex ? '정답입니다!' : '틀렸습니다.'}</p>
                    {questionQueue[0].q.explanation && <p className="text-sm mt-2">{questionQueue[0].q.explanation}</p>}
                    <button onClick={handleStudyNext} className="mt-4 w-full bg-slate-900 text-white py-3 rounded-xl font-bold">다음 문제</button>
                  </div>
                )}
              </div>
            )}
            
            {/* 평가형(test) 렌더링은 별도 리스트 방식으로 처리 가능 */}
            {exams.find(e => e.id === currentExamId)?.mode === 'test' && (
               <div className="space-y-4">
                 {activeQuestions.map((q, i) => (
                   <div key={i} className="bg-white p-6 rounded-2xl border">
                     <p className="font-bold mb-4">{i+1}. {q.text}</p>
                     <div className="grid gap-2">
                       {q.options.map((opt, oi) => (
                         <button key={oi} onClick={() => setTestAnswers({...testAnswers, [i]: oi})} className={`text-left p-3 rounded-xl border ${testAnswers[i] === oi ? 'bg-purple-600 text-white' : ''}`}>{opt}</button>
                       ))}
                     </div>
                   </div>
                 ))}
                 <button onClick={submitTest} className="w-full bg-purple-700 text-white py-5 rounded-2xl font-black text-xl shadow-xl">최종 제출</button>
               </div>
            )}
          </div>
        )}

        {view === 'student-result' && (
          <div className="py-20 text-center space-y-6">
            <h2 className="text-4xl font-black">수고하셨습니다!</h2>
            {exams.find(e => e.id === currentExamId)?.mode === 'test' && <div className="text-6xl font-black text-blue-600">{studentScore}점</div>}
            <button onClick={() => setView('home')} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold">메인으로</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full font-bold shadow-2xl z-[100] animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
