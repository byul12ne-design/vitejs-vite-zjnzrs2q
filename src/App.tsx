import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, writeBatch, arrayUnion } from 'firebase/firestore';

// ==========================================
// 🛠️ [개별 설정] 브랜드 커스터마이징 영역
// ==========================================
const APP_CONFIG = {
  logoText: "뷔르트 사내 평가",
  logoImageUrl: "https://eshop.wuerth.de/is-bin/intershop.static/WFS/1401-B1-Site/-/en_US/webkit_bootstrap/dist/img/wuerth-logo.svg",
  mainIconUrl: "",  
  bgImageUrl: "",   
};

// --- 인터페이스 정의 ---
interface Question {
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
  recordScores?: boolean; 
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

// --- Firebase Config ---
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [questionBank, setQuestionBank] = useState<BankQuestion[]>([]);
  
  const [view, setView] = useState('home');
  const [adminTab, setAdminTab] = useState<'exams' | 'analytics' | 'bank'>('exams');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [currentExamId, setCurrentExamId] = useState('');
  
  // --- 인증(Auth) 상태 ---
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [empIdInput, setEmpIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 

  const [selectedAnalyticsExamId, setSelectedAnalyticsExamId] = useState<string>('');

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
  const [newExamNotice, setNewExamNotice] = useState('');
  const [newExamMode, setNewExamMode] = useState<'study' | 'test'>('study');
  const [displayCount, setDisplayCount] = useState('');
  const [requireName, setRequireName] = useState(true);
  const [recordScores, setRecordScores] = useState(true); 
  
  const [selectedResultDetail, setSelectedResultDetail] = useState<ExamResult | null>(null);

  const [newQuestions, setNewQuestions] = useState<Question[]>([
    { text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' }
  ]);

  const [newBankQuestion, setNewBankQuestion] = useState<Question>({ text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [selectedBankQuestions, setSelectedBankQuestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const params = new URLSearchParams(window.location.search);
    const linkExamId = params.get('examId');
    if (linkExamId) {
      setCurrentExamId(linkExamId);
      setView('home'); 
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        }
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      const loadedExams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)).sort((a, b) => b.createdAt - a.createdAt);
      setExams(loadedExams);
      if (loadedExams.length > 0 && !selectedAnalyticsExamId) {
        setSelectedAnalyticsExamId(loadedExams[0].id);
      }
    });
    const unsubResults = onSnapshot(collection(db, 'results'), (snapshot) => {
      setResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult)).sort((a, b) => b.createdAt - a.createdAt));
    });
    const unsubBank = onSnapshot(collection(db, 'questionBank'), (snapshot) => {
      setQuestionBank(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankQuestion)).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => { unsubExams(); unsubResults(); unsubBank(); };
  }, [user, selectedAnalyticsExamId]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = (examId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?examId=${examId}`;
    navigator.clipboard.writeText(url);
    showToast('응시 링크가 복사되었습니다!');
  };

  // --- 💡 강력해진 인증 및 좀비 계정 자동 복구 로직 ---
  const handleStudentAuth = async () => {
    if (!empIdInput.trim()) return showToast('사번을 입력해주세요.');
    
    const finalEmpId = empIdInput.trim().replace(/\s+/g, '').toUpperCase();
    const pseudoEmail = `${finalEmpId.toLowerCase()}@wuerth.exam`;
    const HIDDEN_SYSTEM_PASSWORD = "WuerthExamSecretPassword2026!";

    try {
      let currentUser;
      let userProf = null;

      if (authMode === 'register') {
        if (!nameInput.trim()) return showToast('이름을 입력해주세요.');
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, pseudoEmail, HIDDEN_SYSTEM_PASSWORD);
          currentUser = userCredential.user;
          userProf = { uid: currentUser.uid, employeeId: finalEmpId, name: nameInput.trim(), role: 'student' };
          await setDoc(doc(db, 'users', currentUser.uid), userProf);
          showToast('가입이 완료되었습니다!');
        } catch (err: any) {
          // 아까 권한 에러 났을 때 생성된 좀비 계정을 마주치면 자동으로 치료하고 로그인시킴!
          if (err.code === 'auth/email-already-in-use') {
             const userCredential = await signInWithEmailAndPassword(auth, pseudoEmail, HIDDEN_SYSTEM_PASSWORD);
             currentUser = userCredential.user;
             userProf = { uid: currentUser.uid, employeeId: finalEmpId, name: nameInput.trim(), role: 'student' };
             await setDoc(doc(db, 'users', currentUser.uid), userProf);
             showToast('기존 등록 정보를 연동하여 접속했습니다!');
          } else {
             throw err;
          }
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, pseudoEmail, HIDDEN_SYSTEM_PASSWORD);
        currentUser = userCredential.user;
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (docSnap.exists()) {
          userProf = docSnap.data() as UserProfile;
          showToast('로그인 성공!');
        } else {
          return showToast('이름 정보가 유실되었습니다. [최초 등록] 탭에서 이름을 다시 입력하고 진행해주세요.');
        }
      }

      setUser(currentUser);
      if (userProf) setUserProfile(userProf as UserProfile);
      setEmpIdInput(''); setNameInput('');
      
      if (currentExamId) setView('student-entry'); 
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        showToast('등록되지 않은 사번입니다. [최초 등록]을 먼저 진행해주세요.');
      } else {
        showToast('오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
    setView('home');
    showToast('로그아웃 되었습니다.');
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === '2026') { 
      setView('admin-dash'); setAdminPasswordInput(''); 
      window.history.replaceState({}, '', window.location.pathname);
    } else showToast('비밀번호 불일치');
  };

  const handleEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setCustomExamId(exam.id);
    setNewExamTitle(exam.title);
    setNewExamNotice(exam.notice || '');
    setNewExamMode(exam.mode || 'study');
    setRequireName(exam.requireName !== false);
    setRecordScores(exam.recordScores !== false); 
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setDisplayCount(exam.displayCount?.toString() || '');
    setView('admin-create');
  };

  const handleCopyExam = (exam: Exam) => {
    setEditingExamId(null);
    setCustomExamId(exam.id + "-COPY");
    setNewExamTitle(exam.title + " (복사본)");
    setNewExamNotice(exam.notice || '');
    setNewExamMode(exam.mode || 'study');
    setRequireName(exam.requireName !== false);
    setRecordScores(exam.recordScores !== false);
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setDisplayCount(exam.displayCount?.toString() || '');
    setView('admin-create');
    showToast('시험 내용이 복제되었습니다!');
  };

  const resetAdminForm = () => {
    setEditingExamId(null); setCustomExamId(''); setNewExamTitle(''); 
    setNewExamNotice(''); setNewExamMode('study'); setRequireName(true);
    setRecordScores(true);
    setDisplayCount('');
    setNewQuestions([{ text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' }]); 
  };

  const parseCSV = (text: string) => {
    const rows = [];
    const lines = text.split(/\r?\n/);
    for (let line of lines) {
      if (!line.trim()) continue;
      const cols = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          cols.push(cur.replace(/^"|"$/g, '').trim());
          cur = '';
        } else cur += char;
      }
      cols.push(cur.replace(/^"|"$/g, '').trim());
      rows.push(cols);
    }
    return rows.map(cols => ({
      text: cols[0], 
      options: [cols[1], cols[2], cols[3], cols[4]], 
      answerIndex: parseInt(cols[5]) - 1,
      explanation: cols[6] || ''
    })).filter(q => q.text && q.options.length >= 4 && !isNaN(q.answerIndex));
  };

  const handleExamFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const parsedFromFile = parseCSV(evt.target?.result as string);
      if (parsedFromFile.length > 0) { 
        const existingNotEmpty = newQuestions.filter(q => q.text.trim() !== '');
        setNewQuestions([...existingNotEmpty, ...parsedFromFile]); 
        showToast(`${parsedFromFile.length}문제가 추가되었습니다!`); 
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleBankFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const parsedFromFile = parseCSV(evt.target?.result as string);
      if (parsedFromFile.length > 0) { 
        try {
          const batch = writeBatch(db);
          parsedFromFile.forEach(q => {
            const docRef = doc(collection(db, 'questionBank'));
            batch.set(docRef, { ...q, createdAt: Date.now() });
          });
          await batch.commit();
          showToast(`문제 창고에 ${parsedFromFile.length}문제가 등록되었습니다!`); 
        } catch(error) {
          showToast('업로드 중 오류가 발생했습니다.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleSaveBankQuestion = async () => {
    if (!newBankQuestion.text.trim()) return showToast('문제를 입력해주세요.');
    try {
      await addDoc(collection(db, 'questionBank'), { ...newBankQuestion, createdAt: Date.now() });
      setNewBankQuestion({ text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });
      showToast('문제 창고에 저장되었습니다.');
    } catch(e) { showToast('저장 실패'); }
  };

  const handleAddSelectedToExam = () => {
    const selected = questionBank.filter(q => selectedBankQuestions.has(q.id)).map(q => {
      const { id, createdAt, ...rest } = q;
      return rest;
    });
    
    if (selected.length === 0) return showToast('선택된 문제가 없습니다.');
    
    const existingNotEmpty = newQuestions.filter(q => q.text.trim() !== '');
    setNewQuestions([...existingNotEmpty, ...selected]);
    setIsBankModalOpen(false);
    setSelectedBankQuestions(new Set());
    showToast(`${selected.length}문제가 시험지에 추가되었습니다!`);
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력해주세요.');
    
    let finalId = customExamId.trim().replace(/\s+/g, '-'); 
    if (!finalId) {
        if (editingExamId) finalId = editingExamId;
        else finalId = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const cleanedQuestions = newQuestions.filter(q => q.text.trim() !== '').map(q => ({...q, explanation: q.explanation || ''}));
    if (cleanedQuestions.length === 0) return showToast('최소 1개 이상의 문제를 등록해주세요.');
    const dCount = parseInt(displayCount) || cleanedQuestions.length;

    const examData = { 
      title: newExamTitle, 
      notice: newExamNotice,
      mode: newExamMode,
      requireName,
      recordScores,
      questions: cleanedQuestions, 
      displayCount: dCount, 
      createdAt: Date.now() 
    };

    try {
      if (editingExamId) {
          if (editingExamId === finalId) {
              await updateDoc(doc(db, 'exams', editingExamId), examData);
          } else {
              const docSnap = await getDoc(doc(db, 'exams', finalId));
              if (docSnap.exists()) return showToast('이미 사용 중인 시험 코드입니다.');
              await setDoc(doc(db, 'exams', finalId), examData);
              await deleteDoc(doc(db, 'exams', editingExamId));
          }
      } else {
          const docSnap = await getDoc(doc(db, 'exams', finalId));
          if (docSnap.exists()) return showToast('이미 사용 중인 시험 코드입니다.');
          await setDoc(doc(db, 'exams', finalId), examData);
      }
      setView('admin-dash'); showToast('시험이 출시되었습니다.');
      resetAdminForm();
    } catch (e) { showToast('저장 실패'); }
  };

  const startExam = async () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return showToast('시험 코드를 확인하세요.');
    if (!user || !userProfile) return showToast('회원 인증에 실패했습니다. 다시 로그인해주세요.');

    let masteredQuestions: string[] = [];
    
    if (exam.mode === 'study') {
      const progressDocRef = doc(db, 'progress', `${user.uid}_${currentExamId}`);
      const progressDoc = await getDoc(progressDocRef);
      if (progressDoc.exists()) {
        masteredQuestions = progressDoc.data().masteredQuestionTexts || [];
      }
    }

    const pool = exam.questions.filter(q => !masteredQuestions.includes(q.text));
    
    if (pool.length === 0) {
      showToast('이미 이 학습 과정의 모든 문제를 완벽하게 마스터하셨습니다!');
      setStudentScore(100);
      setView('student-result');
      return;
    }

    const finalCount = parseInt(exam.displayCount?.toString() || pool.length.toString());
    const selectedQuestions = pool.sort(() => Math.random() - 0.5).slice(0, finalCount);
    
    setActiveQuestions(selectedQuestions);
    setFirstAttemptAnswers({});
    
    if (exam.mode === 'test') {
      setTestAnswers({});
    } else {
      setQuestionQueue(selectedQuestions.map((q, idx) => ({q, originalIndex: idx})));
      setIsAnswerChecked(false);
      setCurrentSelectedOption(null);
    }
    
    setView('student-take');
  };

  const handleStudyOptionClick = (optionIndex: number) => {
    if (isAnswerChecked || questionQueue.length === 0) return;
    const currentItem = questionQueue[0];
    setCurrentSelectedOption(optionIndex);
    setIsAnswerChecked(true);

    setFirstAttemptAnswers(prev => {
        if (prev[currentItem.originalIndex] === undefined) {
            return {...prev, [currentItem.originalIndex]: optionIndex};
        }
        return prev;
    });
  };

  const handleStudyNextQuestion = () => {
    if (questionQueue.length === 0) return;
    const currentItem = questionQueue[0];
    const isCorrect = currentSelectedOption === currentItem.q.answerIndex;
    let nextQueue = [...questionQueue];
    const shiftedItem = nextQueue.shift();

    if (!isCorrect && shiftedItem) {
        nextQueue.push(shiftedItem);
    }

    setQuestionQueue(nextQueue);
    setIsAnswerChecked(false);
    setCurrentSelectedOption(null);

    if (nextQueue.length === 0) {
        submitExam(firstAttemptAnswers);
    }
  };

  const handleTestOptionClick = (questionIndex: number, optionIndex: number) => {
    setTestAnswers(prev => ({
      ...prev,
      [questionIndex]: optionIndex
    }));
  };

  const handleTestSubmit = () => {
    if (Object.keys(testAnswers).length < activeQuestions.length) {
      if (!window.confirm('아직 풀지 않은 문제가 있습니다. 제출하시겠습니까?')) return;
    }
    submitExam(testAnswers);
  };

  const submitExam = async (finalAnswers: Record<number, number>) => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam || !userProfile) return;

    let newlyMasteredTexts: string[] = [];
    
    const correctCount = activeQuestions.reduce((count, q, idx) => {
        if (finalAnswers[idx] === q.answerIndex) {
          if (exam.mode === 'study') newlyMasteredTexts.push(q.text); 
          return count + 1;
        }
        return count;
    }, 0);

    const score = Math.round((correctCount / activeQuestions.length) * 100);
    setStudentScore(score);
    
    if (exam.recordScores !== false) {
      await addDoc(collection(db, 'results'), {
        examId: currentExamId, 
        examTitle: exam.title, 
        studentId: userProfile.employeeId,
        studentName: userProfile.name, 
        score,
        correctCount: correctCount, 
        totalCount: activeQuestions.length,
        answers: finalAnswers, 
        activeQuestions, 
        createdAt: Date.now(),
        mode: exam.mode || 'study'
      });
    }

    if (exam.mode === 'study' && newlyMasteredTexts.length > 0) {
      const progressDocRef = doc(db, 'progress', `${userProfile.uid}_${currentExamId}`);
      await setDoc(progressDocRef, {
        masteredQuestionTexts: arrayUnion(...newlyMasteredTexts),
        updatedAt: Date.now()
      }, { merge: true });
    }
    
    setView('student-result');
  };

  const getFilteredResults = () => {
    return results.filter(r => r.examId === selectedAnalyticsExamId);
  };

  const getQuestionStats = () => {
    const stats: Record<string, { total: number, wrong: number }> = {};
    const targetResults = getFilteredResults();

    targetResults.forEach(res => {
      if (!res.activeQuestions) return; 
      res.activeQuestions.forEach((q, idx) => {
        if (!stats[q.text]) stats[q.text] = { total: 0, wrong: 0 };
        stats[q.text].total += 1;
        if (res.answers[idx] !== q.answerIndex) stats[q.text].wrong += 1;
      });
    });
    return Object.entries(stats)
      .map(([text, s]) => ({ text, rate: Math.round((s.wrong / s.total) * 100), count: s.wrong }))
      .sort((a, b) => b.rate - a.rate);
  };

  const handleBulkDeleteResults = async () => {
    const targetResults = getFilteredResults();
    if (targetResults.length === 0) return showToast('삭제할 기록이 없습니다.');
    
    if (window.confirm(`정말 선택한 시험의 응시 기록 ${targetResults.length}개를 모두 삭제하시겠습니까?\n(이 작업은 복구할 수 없습니다)`)) {
      try {
        const batch = writeBatch(db);
        targetResults.forEach(r => {
          batch.delete(doc(db, 'results', r.id));
        });
        await batch.commit();
        showToast('해당 시험의 모든 응시 기록이 삭제되었습니다.');
      } catch (e) {
        showToast('기록 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const exportToCSV = () => {
    const targetExam = exams.find(e => e.id === selectedAnalyticsExamId);
    if (!targetExam) return showToast('선택된 시험을 찾을 수 없습니다.');
    
    const targetResults = getFilteredResults();
    if (targetResults.length === 0) return showToast('다운로드할 응시 기록이 없습니다.');

    let headers = ["시험명", "응시 모드", "사번", "이름", "최종 점수", "제출 일시"];
    
    targetExam.questions.forEach((_, idx) => {
      headers.push(`[Q${idx+1}] 정/오답`);
      headers.push(`[Q${idx+1}] 제출한 답안`);
    });

    const rows = targetResults.map(r => {
      const baseRow = [
        r.examTitle, 
        r.mode === 'test' ? '평가형' : '학습형', 
        r.studentId || 'N/A',
        r.studentName, 
        `${r.score}`, 
        new Date(r.createdAt).toLocaleString()
      ];
      
      targetExam.questions.forEach((examQ) => {
        const studentQIdx = r.activeQuestions?.findIndex(aq => aq.text === examQ.text);
        
        if (studentQIdx !== undefined && studentQIdx !== -1) {
          const studentAnswerIdx = r.answers[studentQIdx];
          const isCorrect = studentAnswerIdx === examQ.answerIndex;
          const studentAnswerText = studentAnswerIdx !== undefined ? examQ.options[studentAnswerIdx] : '선택 안함';
          
          baseRow.push(isCorrect ? 'O' : 'X');
          baseRow.push(studentAnswerText);
        } else {
          baseRow.push('-');
          baseRow.push('출제되지 않음');
        }
      });
      return baseRow;
    });

    const escapeCSV = (str: any) => `"${String(str).replace(/"/g, '""')}"`;
    const csvContent = [headers.map(escapeCSV), ...rows.map(row => row.map(escapeCSV))].map(e => e.join(",")).join("\n");
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `[${targetExam.title}] 상세_응시결과.csv`;
    link.click();
  };

  return (
    <>
      <style>{`
        body, html { background-color: #f8fafc !important; color-scheme: light; }
      `}</style>

      <div className="min-h-[100dvh] font-sans bg-slate-50 text-slate-900 relative">
        {APP_CONFIG.bgImageUrl && (
          <div 
            className="fixed inset-0 z-0" 
            style={{ 
              backgroundImage: `url(${APP_CONFIG.bgImageUrl})`, 
              backgroundSize: 'cover', 
              backgroundPosition: 'center' 
            }}
          />
        )}
        {APP_CONFIG.bgImageUrl && <div className="fixed inset-0 bg-white/70 backdrop-blur-sm z-0"></div>}

        <div className="relative z-10 flex flex-col min-h-[100dvh]">
          <nav className="p-4 bg-white/90 backdrop-blur-md border-b flex justify-between items-center sticky top-0 z-50 shadow-sm">
            <h1 onClick={() => setView('home')} className={`text-blue-600 font-bold flex items-center gap-2 cursor-pointer`}>
              {APP_CONFIG.logoImageUrl ? (
                <img src={APP_CONFIG.logoImageUrl} alt="Logo" className="h-10 object-contain" />
              ) : (
                <span className="text-2xl">📋</span>
              )}
              {!APP_CONFIG.logoImageUrl && <span>{APP_CONFIG.logoText}</span>}
            </h1>
            {userProfile && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-600">{userProfile.name} 님</span>
                <button onClick={handleLogout} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-1.5 rounded-lg font-bold transition-colors">로그아웃</button>
              </div>
            )}
          </nav>

          <main className="p-6 max-w-5xl mx-auto w-full flex-1 flex flex-col">
            
            {view === 'home' && !userProfile && (
              <div className="flex flex-col items-center gap-12 py-20 text-center flex-1 justify-center">
                <h2 className="text-4xl sm:text-5xl font-black text-slate-800 break-keep">뷔르트 제품 Quiz</h2>
                
                <div className="bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-sm border w-full max-w-md space-y-6">
                  <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
                    <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${authMode === 'login' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>사번으로 시작</button>
                    <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${authMode === 'register' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>최초 등록</button>
                  </div>
                  
                  <div className="space-y-4">
                    <input 
                      type="text" 
                      value={empIdInput} 
                      onChange={e => setEmpIdInput(e.target.value.toUpperCase())} 
                      placeholder="사번 (예: WN1234)" 
                      className="w-full bg-slate-50 border p-4 rounded-2xl text-sm outline-none focus:border-blue-500 transition-colors text-center font-bold placeholder:font-normal"
                    />
                    
                    {authMode === 'register' && (
                      <input 
                        type="text" 
                        value={nameInput} 
                        onChange={e => setNameInput(e.target.value)} 
                        placeholder="실명 (예: 홍길동)" 
                        className="w-full bg-slate-50 border p-4 rounded-2xl text-sm outline-none focus:border-blue-500 transition-colors text-center font-bold placeholder:font-normal"
                      />
                    )}
                    
                    <button onClick={handleStudentAuth} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-md hover:bg-blue-700 transition-colors mt-2">
                      {authMode === 'login' ? '입장하기' : '등록하고 입장하기'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 💡 완전히 새로워진 대기실(학생 홈) UI: 코드를 칠 필요 없이 목록에서 바로 입장! */}
            {view === 'home' && userProfile && (
               <div className="flex flex-col items-center py-10 w-full animate-fade-in-up">
                <div className="text-center mb-10">
                  <span className="text-5xl mb-4 block">👋</span>
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-800 break-keep">환영합니다, {userProfile.name}님!</h2>
                  <p className="text-slate-500 mt-2 font-medium">응시할 시험을 선택하고 바로 시작해보세요.</p>
                </div>

                <div className="w-full max-w-2xl bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-sm border border-slate-200">
                  <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                    <span className="text-blue-500">📋</span> 현재 열려있는 시험 목록
                  </h3>
                  
                  {exams.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                      <p className="text-slate-400 font-bold">현재 등록된 시험이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {exams.map(exam => (
                        <div key={exam.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-slate-50 border border-slate-200 rounded-3xl hover:border-blue-300 hover:bg-blue-50/50 transition-all gap-4 group">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-lg text-slate-800 group-hover:text-blue-700 transition-colors break-keep">{exam.title}</h4>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${exam.mode === 'test' ? 'bg-purple-100 text-purple-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {exam.mode === 'test' ? '평가형' : '학습형'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">출제 문항 수: {exam.displayCount || exam.questions.length}개</p>
                          </div>
                          <button 
                            onClick={() => { setCurrentExamId(exam.id); setView('student-entry'); }}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all text-sm shadow-md active:scale-95 whitespace-nowrap"
                          >
                            시험 입장하기 👉
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={() => setView('admin-login')} className="mt-12 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
                  ⚙️ 관리자 대시보드 접속
                </button>
              </div>
            )}

            {view === 'admin-login' && (
              <div className="max-w-md mx-auto py-20 text-center flex-1">
                <h2 className="text-2xl font-bold mb-8 text-slate-800">관리자 인증</h2>
                <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} className="w-full border-2 rounded-2xl p-4 mb-4 text-center text-lg outline-none focus:border-blue-500" placeholder="비밀번호를 입력하세요"/>
                <button onClick={handleAdminLogin} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-slate-900 transition-colors">접속</button>
                <button onClick={() => setView('home')} className="mt-6 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">⬅️ 뒤로 가기</button>
              </div>
            )}

            {view === 'admin-dash' && (
              <div className="space-y-8">
                <div className="flex bg-white p-2 rounded-2xl border w-fit shadow-sm overflow-x-auto">
                  <button onClick={() => setAdminTab('exams')} className={`px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${adminTab === 'exams' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>시험 관리</button>
                  <button onClick={() => setAdminTab('bank')} className={`px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${adminTab === 'bank' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>🗃️ 문제 창고</button>
                  <button onClick={() => setAdminTab('analytics')} className={`px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${adminTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>교육 통계 분석</button>
                </div>

                {adminTab === 'exams' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl sm:text-2xl font-bold text-slate-800">시험 목록</h3>
                      <button onClick={() => {resetAdminForm(); setView('admin-create');}} className="bg-blue-600 hover:bg-blue-700 transition-colors text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold shadow-md text-sm sm:text-base whitespace-nowrap"><span>➕</span> 새 시험</button>
                    </div>
                    <div className="grid gap-4">
                      {exams.map(exam => (
                        <div key={exam.id} className="bg-white p-5 sm:p-6 rounded-[2rem] border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all">
                          <div className="flex-1 w-full">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="font-bold text-lg sm:text-xl text-slate-800 break-keep">{exam.title}</h4>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${exam.mode === 'test' ? 'bg-purple-100 text-purple-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {exam.mode === 'test' ? '일제 평가형' : '적응형 학습 (자동건너뛰기)'}
                              </span>
                            </div>
                            <p className="text-xs text-blue-500 font-mono mb-1">코드: {exam.id}</p>
                            <p className="text-xs text-slate-400">문항: {exam.questions.length}개 / 기록: {exam.recordScores !== false ? '저장함' : '저장안함'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            <button onClick={() => copyToClipboard(exam.id)} className="flex-1 sm:flex-none px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-bold text-sm transition-colors text-center whitespace-nowrap">🔗 링크복사</button>
                            <button onClick={() => handleCopyExam(exam)} className="p-2 text-blue-400 hover:bg-blue-50 rounded-xl transition-colors">📋</button>
                            <button onClick={() => handleEditExam(exam)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">✏️</button>
                            <button onClick={async () => {if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id))}} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors">🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminTab === 'bank' && (
                   <div className="space-y-8">
                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                       <h3 className="text-xl sm:text-2xl font-bold text-slate-800">🗃️ 중앙 문제 창고</h3>
                       <label className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold cursor-pointer hover:bg-green-700 transition-all text-sm shadow-md whitespace-nowrap">
                         <span>📊</span> CSV 문제 대량 등록<input type="file" accept=".csv" className="hidden" onChange={handleBankFileUpload} />
                       </label>
                     </div>

                     <div className="bg-blue-50/50 p-6 sm:p-8 rounded-[2.5rem] border border-blue-100 space-y-4">
                       <h4 className="font-bold text-blue-800 mb-2">새로운 문제 단건 등록</h4>
                       <textarea value={newBankQuestion.text} onChange={e => setNewBankQuestion({...newBankQuestion, text: e.target.value})} className="w-full text-lg font-bold outline-none resize-none bg-white p-4 rounded-xl border border-blue-200" placeholder="문제를 입력하세요" rows={2}/>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {newBankQuestion.options.map((opt, oi) => (
                           <div key={oi} className="relative">
                             <input value={opt} onChange={e => setNewBankQuestion({...newBankQuestion, options: newBankQuestion.options.map((o, oIdx) => oIdx === oi ? e.target.value : o)})} className={`w-full p-3 pl-12 rounded-xl border-2 outline-none text-sm transition-colors ${newBankQuestion.answerIndex === oi ? 'border-blue-500 bg-blue-50' : 'border-slate-100'}`} placeholder={`보기 ${oi+1}`}/>
                             <button onClick={() => setNewBankQuestion({...newBankQuestion, answerIndex: oi})} className={`absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 font-black text-[10px] flex items-center justify-center ${newBankQuestion.answerIndex === oi ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-300'}`}>{oi+1}</button>
                           </div>
                         ))}
                       </div>
                       <textarea value={newBankQuestion.explanation} onChange={e => setNewBankQuestion({...newBankQuestion, explanation: e.target.value})} className="w-full mt-2 p-3 bg-white border border-blue-200 rounded-xl text-sm outline-none resize-none" placeholder="해설 (선택사항)" rows={2}/>
                       <button onClick={handleSaveBankQuestion} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md">창고에 저장하기</button>
                     </div>

                     <div className="space-y-4">
                       <h4 className="font-bold text-slate-700">보관된 문제 목록 (총 {questionBank.length}개)</h4>
                       {questionBank.map((q) => (
                         <div key={q.id} className="bg-white p-5 rounded-2xl border flex flex-col sm:flex-row justify-between gap-4 group hover:border-blue-300 transition-colors">
                           <div className="flex-1">
                             <p className="font-bold text-slate-800 line-clamp-2"><span className="text-blue-400 mr-2">Q.</span>{q.text}</p>
                             <div className="flex flex-wrap gap-2 mt-2">
                               <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md font-bold shrink-0">정답: {q.options[q.answerIndex]}</span>
                               {q.explanation && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md line-clamp-1">💡 {q.explanation}</span>}
                             </div>
                           </div>
                           <button onClick={async () => {if(window.confirm('창고에서 완전히 삭제하시겠습니까? (기존 출제된 시험지에는 영향이 없습니다)')) await deleteDoc(doc(db, 'questionBank', q.id))}} className="text-red-400 hover:bg-red-50 p-2 rounded-lg transition-colors self-end sm:self-center shrink-0">🗑️ 삭제</button>
                         </div>
                       ))}
                       {questionBank.length === 0 && <p className="text-center text-slate-400 py-10">창고에 등록된 문제가 없습니다.</p>}
                     </div>
                   </div>
                )}

                {adminTab === 'analytics' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 sm:p-6 rounded-[2rem] border shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                        <h3 className="text-lg font-bold text-slate-800 whitespace-nowrap">분석할 시험 선택</h3>
                        <select 
                          value={selectedAnalyticsExamId} 
                          onChange={(e) => setSelectedAnalyticsExamId(e.target.value)}
                          className="w-full sm:w-auto bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-3 outline-none font-bold shadow-sm"
                        >
                          {exams.length === 0 && <option value="">등록된 시험이 없습니다</option>}
                          {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button onClick={exportToCSV} className="w-full sm:w-auto text-sm font-bold text-blue-600 px-5 py-3 bg-blue-50 hover:bg-blue-100 transition-colors rounded-xl whitespace-nowrap shadow-sm border border-blue-100">
                          📊 엑셀 전체 상세 다운로드
                        </button>
                        <button onClick={handleBulkDeleteResults} className="w-full sm:w-auto text-sm font-bold text-red-600 px-5 py-3 bg-red-50 hover:bg-red-100 transition-colors rounded-xl whitespace-nowrap shadow-sm border border-red-100">
                          🗑️ 전체 기록 삭제
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                      <h3 className="text-lg font-bold text-slate-800">시험 응시자 현황</h3>
                      <div className="bg-white rounded-[2rem] border overflow-x-auto shadow-sm">
                        <table className="w-full text-left min-w-[500px]">
                          <thead className="bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b">
                            <tr>
                              <th className="px-4 sm:px-6 py-4">사번/이름</th>
                              <th className="px-4 sm:px-6 py-4">점수</th>
                              <th className="px-4 sm:px-6 py-4 text-right">일시</th>
                              <th className="px-4 sm:px-6 py-4 text-center">상세 내역</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {getFilteredResults().length === 0 && (
                              <tr><td colSpan={4} className="text-center py-10 text-slate-400">해당 시험의 응시 기록이 없습니다.</td></tr>
                            )}
                            {getFilteredResults().map(r => (
                              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 sm:px-6 py-4 font-bold text-slate-700">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">{r.studentId}</span>
                                    {r.studentName}
                                    <button onClick={async () => {if(window.confirm('기록을 삭제하시겠습니까?')) await deleteDoc(doc(db, 'results', r.id))}} className="text-red-300 hover:text-red-500 text-[10px] transition-colors whitespace-nowrap ml-2">삭제</button>
                                  </div>
                                </td>
                                <td className="px-4 sm:px-6 py-4 font-bold text-blue-600">{r.score}점</td>
                                <td className="px-4 sm:px-6 py-4 text-right text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                                <td className="px-4 sm:px-6 py-4 text-center">
                                  <button 
                                    onClick={() => setSelectedResultDetail(r)} 
                                    className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                                  >
                                    모달로 보기
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-slate-800">현재 시험 오답 TOP 5</h3>
                       <div className="bg-white p-5 sm:p-6 rounded-[2rem] border shadow-sm space-y-4">
                        {getQuestionStats().length === 0 && <p className="text-slate-400 text-sm text-center py-5">통계 데이터가 없습니다.</p>}
                        {getQuestionStats().slice(0, 5).map((stat, idx) => (
                          <div key={idx} className="space-y-2">
                            <div className="flex justify-between items-start gap-4">
                              <p className="text-sm font-bold text-slate-700 line-clamp-2 leading-tight">{stat.text}</p>
                              <span className="text-red-500 font-black text-xs shrink-0">{stat.rate}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 transition-all" style={{ width: `${stat.rate}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'admin-create' && (
              <div className="space-y-8 pb-20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <button onClick={() => setView('admin-dash')} className="text-2xl hover:bg-white p-2 rounded-full transition-colors shrink-0">⬅️</button>
                  <div className="flex-1 w-full flex flex-col gap-1">
                     <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="w-full text-2xl sm:text-3xl font-black outline-none bg-transparent border-b-2 border-transparent focus:border-blue-500 transition-all text-slate-800" placeholder="시험 제목"/>
                     <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs font-bold text-slate-400">시험 코드(ID):</span>
                        <input value={customExamId} onChange={e => setCustomExamId(e.target.value)} className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-1 rounded outline-none border border-blue-100 min-w-[150px]" placeholder="미입력시 자동생성"/>
                     </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-5 sm:p-6 rounded-[2rem] border shadow-sm space-y-4">
                    <span className="text-xs font-black text-slate-400 tracking-widest uppercase">🎯 응시 방식 선택</span>
                    <div className="grid grid-cols-1 gap-3">
                      <div onClick={() => setNewExamMode('study')} className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${newExamMode === 'study' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-200'}`}>
                        <span className="text-2xl">🔁</span>
                        <div>
                          <h5 className={`font-bold text-sm ${newExamMode === 'study' ? 'text-emerald-700' : 'text-slate-700'}`}>적응형 학습 (단어장)</h5>
                          <p className="text-[10px] text-slate-500 mt-1">틀린 문제는 맞출 때까지 반복 출제되며, <strong className="text-emerald-600">다음에 접속 시 이미 마스터한 문제는 자동으로 제외</strong>됩니다.</p>
                        </div>
                      </div>
                      <div onClick={() => setNewExamMode('test')} className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${newExamMode === 'test' ? 'border-purple-500 bg-purple-50' : 'border-slate-100 hover:border-slate-200'}`}>
                        <span className="text-2xl">📝</span>
                        <div>
                          <h5 className={`font-bold text-sm ${newExamMode === 'test' ? 'text-purple-700' : 'text-slate-700'}`}>평가형 (일제 시험형)</h5>
                          <p className="text-[10px] text-slate-500 mt-1">한 번에 전체를 풀고 제출하여 평가합니다. 매번 모든 문제가 다시 출제됩니다.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-5 sm:p-6 rounded-[2rem] border shadow-sm space-y-6 flex flex-col justify-center">
                    <span className="text-xs font-black text-slate-400 tracking-widest uppercase">⚙️ 추가 설정</span>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="pr-4">
                          <h5 className="font-bold text-sm text-slate-700">성적 데이터 저장</h5>
                          <p className="text-[10px] text-slate-500 mt-1">끄면 학생의 점수가 통계에 남지 않고 학생 본인 화면에만 표시됩니다.</p>
                        </div>
                        <div className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${recordScores ? 'bg-blue-600' : 'bg-slate-200'}`} onClick={() => setRecordScores(!recordScores)}>
                          <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${recordScores ? 'translate-x-7' : 'translate-x-1'}`}></div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 sm:p-6 rounded-[2rem] border shadow-sm space-y-4">
                  <span className="text-xs font-black text-slate-400 tracking-widest uppercase">📌 선생님 공지사항</span>
                  <textarea value={newExamNotice} onChange={e => setNewExamNotice(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm outline-none focus:ring-2 ring-blue-100 h-24 resize-none text-slate-700" placeholder="시험 시작 전 응시자에게 보여줄 공지사항을 입력하세요"/>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 sm:p-6 rounded-[2.5rem] border shadow-sm">
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-blue-700">
                    <span>🔀</span> 랜덤 출제 문항 수: 
                    <input type="number" value={displayCount} onChange={e => setDisplayCount(e.target.value)} className="w-20 p-2 rounded-xl border bg-slate-50 text-center outline-none text-slate-700" placeholder="전체"/>
                  </div>
                  <label className="w-full sm:w-auto bg-green-600 text-white px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold cursor-pointer hover:bg-green-700 transition-all shadow-md">
                    <span>📊</span> CSV 문제 추가하기<input type="file" accept=".csv" className="hidden" onChange={handleExamFileUpload} />
                  </label>
                </div>
                
                <div className="space-y-6">
                  <button onClick={() => setIsBankModalOpen(true)} className="w-full py-5 bg-blue-50 text-blue-600 border-2 border-blue-200 border-dashed rounded-[2.5rem] font-black text-lg hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm">
                    🗃️ 문제 창고에서 선택해서 불러오기
                  </button>

                  {newQuestions.map((q, i) => (
                    <div key={i} className="bg-white p-6 sm:p-10 rounded-[2.5rem] border shadow-sm space-y-6 relative group">
                      <button onClick={() => setNewQuestions(newQuestions.filter((_, idx) => idx !== i))} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors">🗑️</button>
                      <div className="space-y-2 pr-8">
                        <span className="text-xs font-black text-blue-300 uppercase tracking-widest">Question {i+1}</span>
                        <textarea value={q.text} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} className="w-full text-lg sm:text-xl font-bold outline-none resize-none bg-transparent text-slate-800" placeholder="문제 내용" rows={2}/>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="relative">
                            <input value={opt} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, options: item.options.map((o, oIdx) => oIdx === oi ? e.target.value : o) } : item))} className={`w-full p-3 sm:p-4 pl-12 rounded-2xl border-2 outline-none transition-all text-sm sm:text-base text-slate-700 ${q.answerIndex === oi ? 'border-blue-600 bg-blue-50/50' : 'border-slate-50 bg-slate-50 focus:border-slate-200'}`} placeholder={`보기 ${oi+1}`}/>
                            <button onClick={() => setNewQuestions(prev => prev.map((item, iIdx) => iIdx === i ? { ...item, answerIndex: oi } : item))} className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 font-black text-[10px] flex items-center justify-center transition-colors ${q.answerIndex === oi ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-300 hover:border-blue-300'}`}>{oi+1}</button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 border-t pt-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">💡 해설 (선택)</span>
                        <textarea value={q.explanation || ''} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, explanation: e.target.value } : item))} className="w-full mt-2 p-3 bg-slate-50 border rounded-xl text-xs sm:text-sm outline-none focus:border-blue-300 resize-none text-slate-600" placeholder="오답 시 학생에게 보여줄 해설을 입력하세요" rows={2}/>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setNewQuestions([...newQuestions, {text:'', options:['','','',''], answerIndex:0, explanation: ''}])} className="w-full py-8 sm:py-10 bg-white border-4 border-dashed border-slate-100 rounded-[2.5rem] text-slate-300 font-black text-base sm:text-lg hover:border-blue-100 hover:text-blue-400 transition-all">+ 빈 문항 추가하기</button>
                </div>
                <button onClick={handleSaveExam} className="w-full py-5 sm:py-6 bg-slate-900 hover:bg-slate-800 text-white rounded-[2.5rem] font-black text-lg sm:text-xl sticky bottom-4 shadow-2xl active:scale-95 transition-all z-20">설정 저장하고 출시하기</button>
              </div>
            )}

            {view === 'student-entry' && (
              <div className="max-w-md mx-auto py-10 space-y-8 sm:space-y-10 px-2 sm:px-0">
                <div className="text-center space-y-4 sm:space-y-6">
                    {APP_CONFIG.mainIconUrl ? (
                      <img src={APP_CONFIG.mainIconUrl} alt="Main Icon" className="w-24 h-24 sm:w-32 sm:h-32 mx-auto object-contain animate-bounce" />
                    ) : (
                      <div className="text-7xl sm:text-8xl animate-bounce">🏆</div>
                    )}
                    <h2 className="text-2xl sm:text-4xl font-black text-slate-800 leading-tight break-keep">{exams.find(e => e.id === currentExamId)?.title}</h2>
                </div>
                
                {exams.find(e => e.id === currentExamId)?.notice && (
                  <div className="bg-blue-50 p-6 sm:p-8 rounded-[2rem] border border-blue-100 space-y-3 relative overflow-hidden shadow-inner">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-400"></div>
                    <h4 className="text-xs font-black text-blue-600 tracking-widest uppercase flex items-center gap-2">📢 선생님 공지사항</h4>
                    <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed whitespace-pre-wrap italic break-keep">
                      "{exams.find(e => e.id === currentExamId)?.notice}"
                    </p>
                  </div>
                )}

                <div className="space-y-3 sm:space-y-4">
                  <div className="bg-slate-50 p-6 rounded-[2rem] text-center border-2 border-slate-100">
                    <p className="font-bold text-slate-700">응시자: <span className="text-blue-600">{userProfile?.name}</span> ({userProfile?.employeeId})</p>
                  </div>
                  <button onClick={startExam} className="w-full bg-blue-600 text-white py-5 sm:py-6 rounded-[2rem] font-black text-lg sm:text-xl shadow-xl hover:bg-blue-700 transition-all active:scale-95">시험 시작하기</button>
                </div>
              </div>
            )}

            {view === 'student-take' && exams.find(e => e.id === currentExamId)?.mode === 'test' && activeQuestions.length > 0 && (
              <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8 pb-32">
                <div className="bg-white/90 backdrop-blur-md p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] sticky top-20 border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 shadow-xl z-20">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-black text-sm sm:text-base shrink-0">{userProfile?.name[0]}</div>
                    <span className="font-bold text-sm sm:text-base text-slate-700 line-clamp-1">{userProfile?.name} 님 평가 중</span>
                  </div>
                  <span className="text-xs font-black px-4 py-2 sm:px-5 sm:py-2.5 bg-slate-900 text-white rounded-full tracking-widest shadow-sm self-end sm:self-auto">
                    마킹 완료: {Object.keys(testAnswers).length} / {activeQuestions.length}
                  </span>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  {activeQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="bg-white p-6 sm:p-10 rounded-3xl sm:rounded-[3rem] border shadow-sm space-y-6 sm:space-y-8">
                      <h4 className="text-lg sm:text-2xl font-black text-slate-800 flex gap-3 sm:gap-4 leading-relaxed break-keep">
                        <span className="text-purple-300 italic shrink-0">Q{qIndex + 1}.</span>{q.text}
                      </h4>
                      <div className="grid gap-2 sm:gap-3">
                        {q.options.map((opt, oi) => {
                          const isSelected = testAnswers[qIndex] === oi;
                          return (
                            <button 
                              key={oi} 
                              onClick={() => handleTestOptionClick(qIndex, oi)} 
                              className={`text-left p-4 sm:p-6 rounded-2xl border-2 font-bold transition-all text-sm sm:text-base break-keep ${isSelected ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-inner' : 'border-slate-50 hover:bg-slate-50 text-slate-600'}`}
                            >
                              <span className={`inline-block w-6 h-6 sm:w-8 sm:h-8 rounded-lg text-center leading-6 sm:leading-8 mr-3 sm:mr-4 transition-colors shrink-0 ${isSelected ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{oi+1}</span>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleTestSubmit} 
                  className={`w-full py-6 sm:py-8 text-white rounded-[2.5rem] sm:rounded-[3rem] font-black text-xl sm:text-2xl shadow-xl transition-all active:scale-95 ${Object.keys(testAnswers).length === activeQuestions.length ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-300'}`}
                >
                  전체 답안 제출하기
                </button>
              </div>
            )}

            {view === 'student-take' && exams.find(e => e.id === currentExamId)?.mode !== 'test' && questionQueue.length > 0 && (
              <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8 pb-32">
                <div className="bg-white/90 backdrop-blur-md p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] sticky top-20 border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 shadow-xl z-20">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-black text-sm sm:text-base shrink-0">{userProfile?.name[0]}</div>
                    <span className="font-bold text-sm sm:text-base text-slate-700 line-clamp-1">{userProfile?.name} 님 학습 중</span>
                  </div>
                  <span className="text-xs font-black px-4 py-2 sm:px-5 sm:py-2.5 bg-slate-900 text-white rounded-full tracking-widest shadow-sm self-end sm:self-auto">
                    진행률: {activeQuestions.length - questionQueue.length + (isAnswerChecked && currentSelectedOption === questionQueue[0].q.answerIndex ? 1 : 0)} / {activeQuestions.length}
                  </span>
                </div>
                
                <div className="bg-white p-6 sm:p-12 rounded-3xl sm:rounded-[3.5rem] border shadow-sm space-y-8 sm:space-y-10">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <h4 className="text-xl sm:text-3xl font-black text-slate-800 flex gap-3 sm:gap-4 leading-relaxed break-keep"><span className="text-emerald-100 italic shrink-0">Q.</span>{questionQueue[0].q.text}</h4>
                        {firstAttemptAnswers[questionQueue[0].originalIndex] !== undefined && firstAttemptAnswers[questionQueue[0].originalIndex] !== questionQueue[0].q.answerIndex && (
                            <span className="bg-red-100 text-red-600 text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 rounded-full whitespace-nowrap self-start">🔄 재도전</span>
                        )}
                    </div>

                    <div className="grid gap-3 sm:gap-4">
                      {questionQueue[0].q.options.map((opt, oi) => {
                        let btnStyle = 'border-slate-50 hover:bg-slate-50 text-slate-500';
                        let numStyle = 'bg-slate-100 text-slate-300';
                        
                        if (isAnswerChecked) {
                            if (oi === questionQueue[0].q.answerIndex) {
                                btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-inner sm:translate-x-2';
                                numStyle = 'bg-emerald-500 text-white';
                            } else if (oi === currentSelectedOption) {
                                btnStyle = 'border-red-500 bg-red-50 text-red-700';
                                numStyle = 'bg-red-500 text-white';
                            }
                        }

                        return (
                            <button 
                                key={oi} 
                                onClick={() => handleStudyOptionClick(oi)} 
                                disabled={isAnswerChecked}
                                className={`text-left p-5 sm:p-8 rounded-2xl sm:rounded-[2rem] border-2 font-bold text-sm sm:text-lg transition-all break-keep ${btnStyle}`}
                            >
                                <span className={`inline-block w-6 h-6 sm:w-8 sm:h-8 rounded-lg text-center leading-6 sm:leading-8 mr-3 sm:mr-4 shrink-0 ${numStyle}`}>{oi+1}</span>{opt}
                            </button>
                        );
                      })}
                    </div>

                    {isAnswerChecked && (
                        <div className={`mt-6 sm:mt-8 p-5 sm:p-6 rounded-2xl sm:rounded-3xl border-2 animate-fade-in-up ${currentSelectedOption === questionQueue[0].q.answerIndex ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <h5 className={`font-black text-lg sm:text-xl mb-2 flex items-center gap-2 ${currentSelectedOption === questionQueue[0].q.answerIndex ? 'text-emerald-700' : 'text-red-700'}`}>
                                {currentSelectedOption === questionQueue[0].q.answerIndex ? '🎉 정답입니다!' : '❌ 틀렸습니다.'}
                            </h5>
                            {questionQueue[0].q.explanation && (
                                <p className="text-sm sm:text-base text-slate-700 whitespace-pre-wrap mt-4 leading-relaxed bg-white/50 p-4 rounded-xl break-keep">
                                    <span className="font-bold text-xs sm:text-sm block mb-1 opacity-60">💡 해설</span>
                                    {questionQueue[0].q.explanation}
                                </p>
                            )}
                            {!currentSelectedOption || currentSelectedOption !== questionQueue[0].q.answerIndex ? (
                                <p className="text-red-500 font-bold mt-4 text-xs sm:text-sm px-1 sm:px-2">※ 이 문제는 나중에 다시 출제됩니다.</p>
                            ) : null}
                        </div>
                    )}
                </div>

                {isAnswerChecked && (
                    <button onClick={handleStudyNextQuestion} className="w-full py-6 sm:py-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2.5rem] sm:rounded-[3rem] font-black text-xl sm:text-2xl shadow-xl active:scale-95 transition-all animate-fade-in-up z-20 relative">
                        {questionQueue.length === 1 && currentSelectedOption === questionQueue[0].q.answerIndex ? '학습 완료하기' : '다음 문제로 넘어가기 👉'}
                    </button>
                )}
              </div>
            )}

            {view === 'student-result' && (
              <div className="max-w-2xl mx-auto py-10 sm:py-20 text-center space-y-6 sm:space-y-8 px-4 sm:px-0">
                <div className="text-7xl sm:text-9xl mb-2 sm:mb-4 animate-pulse">🎉</div>
                <h2 className="text-2xl sm:text-4xl font-black text-slate-800 break-keep">
                  {exams.find(e => e.id === currentExamId)?.mode === 'test' ? '평가가 종료되었습니다!' : '모든 문제를 마스터했습니다!'}
                </h2>
                <div className="bg-white p-8 sm:p-16 rounded-3xl sm:rounded-[4rem] shadow-2xl border-4 sm:border-8 border-blue-50 relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
                   <p className="text-sm sm:text-lg text-slate-400 font-black mb-2 sm:mb-4 uppercase tracking-widest">
                    {studentScore === 100 ? '완벽합니다!' : '최종 점수 (첫 시도 기준)'}
                   </p>
                   <div className="text-7xl sm:text-[12rem] font-black text-blue-600 leading-none">{studentScore}<span className="text-2xl sm:text-4xl text-slate-200 ml-2 sm:ml-4 font-normal">pts</span></div>
                </div>
                
                <button onClick={() => {setView('home'); window.history.replaceState({}, '', window.location.pathname);}} className="w-full sm:w-auto bg-slate-900 text-white px-8 sm:px-12 py-4 sm:py-5 rounded-2xl sm:rounded-[2rem] font-black hover:bg-slate-800 transition-all mt-6 sm:mt-10 shadow-xl active:scale-95">메인으로 돌아가기</button>
              </div>
            )}
          </main>
        </div>

        {/* 창고에서 문제 불러오기 모달 */}
        {isBankModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-6 shrink-0 border-b pb-4">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-800">🗃️ 문제 창고</h3>
                  <p className="text-sm text-slate-500 mt-1">시험지에 추가할 문제를 선택하세요. (총 {questionBank.length}개)</p>
                </div>
                <button onClick={() => {setIsBankModalOpen(false); setSelectedBankQuestions(new Set());}} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center font-bold transition-colors">✕</button>
              </div>

              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 mb-6">
                {questionBank.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">창고에 등록된 문제가 없습니다. 관리자 대시보드에서 먼저 문제를 등록해주세요.</p>
                ) : (
                  questionBank.map((q) => {
                    const isSelected = selectedBankQuestions.has(q.id);
                    return (
                      <label key={q.id} className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-blue-200 bg-white'}`}>
                        <div className="mt-1">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 cursor-pointer accent-blue-600"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSet = new Set(selectedBankQuestions);
                              if (e.target.checked) newSet.add(q.id);
                              else newSet.delete(q.id);
                              setSelectedBankQuestions(newSet);
                            }}
                          />
                        </div>
                        <div>
                          <p className={`font-bold text-sm sm:text-base line-clamp-2 ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>{q.text}</p>
                          <p className="text-xs text-slate-400 mt-1">정답: {q.options[q.answerIndex]}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <button 
                onClick={handleAddSelectedToExam} 
                disabled={selectedBankQuestions.size === 0}
                className={`w-full py-4 rounded-xl font-bold text-white transition-colors shrink-0 ${selectedBankQuestions.size > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}
              >
                선택한 {selectedBankQuestions.size}개 문제 시험지에 추가하기
              </button>
            </div>
          </div>
        )}

        {/* 오답 상세보기 모달 팝업 */}
        {selectedResultDetail && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-start sm:items-center mb-4 sm:mb-6 shrink-0 border-b pb-4">
                <div className="pr-4">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">{selectedResultDetail.studentName} 님의 결과</h3>
                  <p className="text-xs sm:text-sm text-blue-600 font-bold mt-2 bg-blue-50 px-2 sm:px-3 py-1 rounded-lg inline-block break-keep">{selectedResultDetail.examTitle} ({selectedResultDetail.score}점)</p>
                </div>
                <button onClick={() => setSelectedResultDetail(null)} className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center font-bold transition-colors text-lg sm:text-xl shrink-0">✕</button>
              </div>

              <div className="space-y-3 sm:space-y-4 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar flex-1">
                {selectedResultDetail.activeQuestions?.map((q, idx) => {
                  const studentAnswer = selectedResultDetail.answers[idx];
                  const isCorrect = studentAnswer === q.answerIndex;

                  return (
                    <div key={idx} className={`p-4 sm:p-6 rounded-2xl border-2 transition-colors ${isCorrect ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50'}`}>
                      <p className="font-bold text-sm sm:text-base text-slate-800 mb-3 sm:mb-4 flex gap-2 sm:gap-3 leading-relaxed break-keep">
                        <span className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-white text-xs sm:text-sm ${isCorrect ? 'bg-emerald-500' : 'bg-red-500'}`}>
                          {isCorrect ? '✓' : '✕'}
                        </span>
                        <span>Q{idx + 1}. {q.text}</span>
                      </p>
                      
                      <div className="text-xs sm:text-sm space-y-2 pl-7 sm:pl-9 bg-white/70 p-3 sm:p-4 rounded-xl border border-white/50">
                        <p className="text-slate-600 flex items-start sm:items-center gap-2">
                          <span className="inline-block w-10 sm:w-12 text-slate-400 font-bold text-[10px] sm:text-xs uppercase shrink-0 mt-0.5 sm:mt-0">정답</span> 
                          <span className="font-bold text-emerald-600 break-keep">{q.options[q.answerIndex]}</span>
                        </p>
                        {!isCorrect && (
                          <p className="text-slate-600 flex items-start sm:items-center gap-2 border-t border-slate-100 pt-2">
                            <span className="inline-block w-10 sm:w-12 text-slate-400 font-bold text-[10px] sm:text-xs uppercase shrink-0 mt-0.5 sm:mt-0">오답</span> 
                            <span className="font-bold text-red-500 line-through decoration-red-300 break-keep">
                              {studentAnswer !== undefined ? q.options[studentAnswer] : '선택 안함 (미입력)'}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {toastMessage && (
          <div className="fixed bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md text-white px-6 sm:px-10 py-4 sm:py-5 rounded-full font-black text-sm sm:text-base z-[100] shadow-2xl animate-fade-in-up tracking-tight whitespace-nowrap">
            {toastMessage}
          </div>
        )}
      </div>
    </>
  );
}
