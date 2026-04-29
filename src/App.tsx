import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Users, 
  Plus, 
  Copy, 
  ArrowLeft, 
  CheckCircle, 
  Trash2, 
  Trophy,
  AlertCircle,
  FileSpreadsheet,
  Shuffle,
  Edit
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// --- 사용자님의 실제 Firebase 설정 정보 ---
const firebaseConfig = {
  apiKey: "AIzaSyAIBp1x4DalwhtlFnYjnz2TisQBA0wVBSg",
  authDomain: "product-exam-9b794.firebaseapp.com",
  projectId: "product-exam-9b794",
  storageBucket: "product-exam-9b794.firebasestorage.app",
  messagingSenderId: "443959122996",
  appId: "1:443959122996:web:355714f3a0c809b9ebbe61",
  measurementId: "G-X5NVNL1G96"
};

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // 온라인 에디터용 디자인(Tailwind) 자동 로드 설정
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // ⭐ 관리자 접속 비밀번호 설정 (원하는 비밀번호로 변경하세요)
  const ADMIN_SECRET = '1234'; 

  // --- Auth & Data State ---
  const [user, setUser] = useState(null);
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- UI State ---
  const [view, setView] = useState('home');
  const [toastMessage, setToastMessage] = useState(null);

  // --- Active Items State ---
  const [currentExamId, setCurrentExamId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  
  // Create / Edit Exam State
  const [editingExamId, setEditingExamId] = useState(null); // 편집 모드 식별
  const [newExamTitle, setNewExamTitle] = useState('');
  const [displayCount, setDisplayCount] = useState(''); // 랜덤 출제 문항 수
  const [newQuestions, setNewQuestions] = useState([
    { text: '', options: ['', '', '', ''], answerIndex: 0 }
  ]);
  
  // Bulk Upload State
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');

  // Take Exam State
  const [activeQuestions, setActiveQuestions] = useState([]); // 학생에게 실제 보여질 문제 목록 (랜덤 추출 후)
  const [studentAnswers, setStudentAnswers] = useState({});
  const [studentScore, setStudentScore] = useState(0);

  // --- Effect: Initialize Auth ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth); 
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- Effect: Handle Direct Links (URL Params) ---
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const examParam = queryParams.get('exam');
    if (examParam) {
      setCurrentExamId(examParam);
      setView('student-entry');
    }
  }, []);

  // --- Effect: Firestore Listeners ---
  useEffect(() => {
    if (!user) return;

    const examsRef = collection(db, 'exams');
    const resultsRef = collection(db, 'results');

    const unsubExams = onSnapshot(examsRef, (snapshot) => {
      const examsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExams(examsData.sort((a, b) => b.createdAt - a.createdAt));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching exams:", error);
      setIsLoading(false);
    });

    const unsubResults = onSnapshot(resultsRef, (snapshot) => {
      const resultsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setResults(resultsData);
    }, (error) => {
      console.error("Error fetching results:", error);
    });

    return () => {
      unsubExams();
      unsubResults();
    };
  }, [user]);

  // --- Helpers: UI ---
  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyLink = (examId) => {
    const baseUrl = window.location.href.split('?')[0];
    const link = `${baseUrl}?exam=${examId}`;
    
    const textArea = document.createElement("textarea");
    textArea.value = link;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('시험 링크가 복사되었습니다! 학생들에게 공유하세요.');
    } catch (err) {
      console.error('Copy failed', err);
      showToast('링크 복사에 실패했습니다.');
    }
    document.body.removeChild(textArea);
  };

  // --- Handlers: Admin ---
  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_SECRET) {
      setView('admin-dash');
      setAdminPasswordInput(''); 
    } else {
      showToast('비밀번호가 일치하지 않습니다.');
    }
  };

  // 기존 시험 편집 모드로 불러오기
  const handleEditClick = (exam) => {
    setEditingExamId(exam.id);
    setNewExamTitle(exam.title || '');
    
    // 이전 버전에서 생성되어 displayCount 값이 아예 없는 경우 에러를 방지합니다.
    const questionsLength = exam.questions?.length || 0;
    if (exam.displayCount && exam.displayCount < questionsLength) {
      setDisplayCount(exam.displayCount.toString());
    } else {
      setDisplayCount('');
    }
    
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions || []))); // 깊은 복사로 상태 독립
    setShowBulkUpload(false);
    setBulkData('');
    setView('admin-create');
  };

  const addQuestionField = () => {
    setNewQuestions([...newQuestions, { text: '', options: ['', '', '', ''], answerIndex: 0 }]);
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...newQuestions];
    if (field === 'text') updated[index].text = value;
    if (field === 'answerIndex') updated[index].answerIndex = parseInt(value);
    setNewQuestions(updated);
  };

  const updateOption = (qIndex, optIndex, value) => {
    const updated = [...newQuestions];
    updated[qIndex].options[optIndex] = value;
    setNewQuestions(updated);
  };

  const removeQuestionField = (index) => {
    if (newQuestions.length === 1) {
      showToast('최소 1개의 문제가 필요합니다.');
      return;
    }
    const updated = newQuestions.filter((_, i) => i !== index);
    setNewQuestions(updated);
  };

  // 엑셀 대량 업로드 핸들러
  const handleBulkUpload = () => {
    if (!bulkData.trim()) {
      showToast('엑셀 데이터를 붙여넣어 주세요.');
      return;
    }

    const rows = bulkData.split('\n');
    const parsedQuestions = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;
      
      const separator = row.includes('\t') ? '\t' : ',';
      const cols = row.split(separator).map(c => c.trim());

      if (cols.length >= 6 && cols[0]) {
        const answerNum = parseInt(cols[5]);
        const answerIdx = (isNaN(answerNum) || answerNum < 1 || answerNum > 4) ? 0 : answerNum - 1;
        
        parsedQuestions.push({
          text: cols[0],
          options: [cols[1] || '', cols[2] || '', cols[3] || '', cols[4] || ''],
          answerIndex: answerIdx
        });
      }
    }

    if (parsedQuestions.length > 0) {
      setNewQuestions(parsedQuestions);
      setShowBulkUpload(false);
      setBulkData('');
      showToast(`총 ${parsedQuestions.length}개의 문제가 성공적으로 변환되었습니다!`);
    } else {
      showToast('올바른 형식의 데이터가 없습니다. 양식(6개 열)을 확인해주세요.');
    }
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) {
      showToast('시험 제목을 입력해주세요.');
      return;
    }
    for (let i = 0; i < newQuestions.length; i++) {
      const q = newQuestions[i];
      if (!q.text.trim() || q.options.some(opt => !opt.trim())) {
        showToast(`문제 ${i + 1}의 내용과 모든 보기를 채워주세요.`);
        return;
      }
    }

    // 설정된 랜덤 표시 문항 수 검증
    let parsedDisplayCount = parseInt(displayCount);
    if (isNaN(parsedDisplayCount) || parsedDisplayCount <= 0 || parsedDisplayCount > newQuestions.length) {
      parsedDisplayCount = newQuestions.length; // 기본값은 전체 문항
    }

    try {
      const examData = {
        title: newExamTitle,
        questions: newQuestions,
        displayCount: parsedDisplayCount, 
      };

      if (editingExamId) {
        // 기존 시험 업데이트
        await updateDoc(doc(db, 'exams', editingExamId), examData);
        showToast('시험이 성공적으로 수정되었습니다.');
      } else {
        // 새 시험 생성
        examData.createdAt = Date.now();
        await addDoc(collection(db, 'exams'), examData);
        showToast('시험이 성공적으로 생성되었습니다.');
      }

      // 폼 초기화
      setEditingExamId(null);
      setNewExamTitle('');
      setDisplayCount('');
      setNewQuestions([{ text: '', options: ['', '', '', ''], answerIndex: 0 }]);
      setView('admin-dash');
    } catch (error) {
      console.error("Error saving exam:", error);
      showToast('시험 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteExam = async (examId) => {
    if (window.confirm('정말로 이 시험을 삭제하시겠습니까? 관련 응시 결과도 함께 표시되지 않을 수 있습니다.')) {
      try {
        await deleteDoc(doc(db, 'exams', examId));
        showToast('시험이 삭제되었습니다.');
      } catch (error) {
        console.error("Error deleting exam:", error);
      }
    }
  };

  // --- Handlers: Student ---
  const currentExamData = exams.find(e => e.id === currentExamId);

  const startExam = () => {
    if (!studentName.trim()) {
      showToast('이름을 입력해주세요.');
      return;
    }
    if (!currentExamData) {
      showToast('유효하지 않은 시험입니다.');
      return;
    }

    let pool = [...currentExamData.questions];
    let count = currentExamData.displayCount || pool.length;
    
    if (count > pool.length) count = pool.length;

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const selectedQuestions = pool.slice(0, count);
    
    setActiveQuestions(selectedQuestions);
    setStudentAnswers({});
    setView('student-take');
  };

  const submitExam = async () => {
    if (!currentExamData || activeQuestions.length === 0) return;

    if (Object.keys(studentAnswers).length < activeQuestions.length) {
      showToast('모든 문제에 답해주세요.');
      return;
    }

    let correctCount = 0;
    activeQuestions.forEach((q, idx) => {
      if (studentAnswers[idx] === q.answerIndex) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / activeQuestions.length) * 100);
    setStudentScore(score);

    try {
      const resultsRef = collection(db, 'results');
      await addDoc(resultsRef, {
        examId: currentExamId,
        examTitle: currentExamData.title,
        studentName: studentName,
        score: score,
        correctCount: correctCount,
        totalCount: activeQuestions.length, 
        answers: studentAnswers,
        createdAt: Date.now()
      });
      setView('student-result');
    } catch (error) {
      console.error("Error saving result:", error);
      showToast('결과 저장 중 오류가 발생했습니다.');
    }
  };

  // --- Render Views ---
  const renderToast = () => {
    if (!toastMessage) return null;
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg z-50 flex items-center gap-2">
        <AlertCircle size={18} />
        <span>{toastMessage}</span>
      </div>
    );
  };

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-800 flex items-center justify-center gap-3">
          <ClipboardList className="text-blue-600" size={40} />
          스마트 문제은행
        </h1>
        <p className="text-gray-500 text-lg">쉽게 시험을 출제하고 결과를 실시간으로 관리하세요.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        <button 
          onClick={() => setView('admin-login')} 
          className="bg-white border-2 border-blue-100 hover:border-blue-500 hover:shadow-lg transition-all p-8 rounded-2xl flex flex-col items-center gap-4 group cursor-pointer"
        >
          <div className="bg-blue-100 p-4 rounded-full group-hover:bg-blue-500 group-hover:text-white text-blue-600 transition-colors">
            <Users size={32} />
          </div>
          <div className="text-xl font-bold text-gray-800">선생님 / 관리자</div>
          <p className="text-sm text-gray-500">시험 출제 및 성적 관리</p>
        </button>

        <div className="bg-white border-2 border-green-100 p-8 rounded-2xl flex flex-col items-center gap-4">
          <div className="bg-green-100 p-4 rounded-full text-green-600">
            <CheckCircle size={32} />
          </div>
          <div className="text-xl font-bold text-gray-800">학생 응시자</div>
          <p className="text-sm text-gray-500 mb-2">공유받은 링크로 바로 접속 가능</p>
          <div className="flex w-full gap-2 mt-auto">
            <input 
              type="text" 
              placeholder="시험 코드 입력" 
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={currentExamId}
              onChange={(e) => setCurrentExamId(e.target.value)}
            />
            <button 
              onClick={() => {
                if (currentExamId) setView('student-entry');
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
            >
              입장
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdminLogin = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 w-full max-w-md text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
          <Users size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">관리자 인증</h2>
        <p className="text-gray-500 mb-8">선생님 전용 메뉴입니다. 비밀번호를 입력해주세요.</p>

        <div className="space-y-4 text-left">
          <div>
            <input 
              type="password" 
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
              placeholder="비밀번호 입력"
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdminLogin();
              }}
            />
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => {
                setView('home');
                setAdminPasswordInput('');
              }}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button 
              onClick={handleAdminLogin}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdminDash = () => (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-2xl font-bold text-gray-800">관리자 대시보드</h2>
        </div>
        <button 
          onClick={() => {
            setEditingExamId(null); // 편집 모드 해제
            setNewExamTitle('');
            setDisplayCount('');
            setNewQuestions([{ text: '', options: ['', '', '', ''], answerIndex: 0 }]);
            setShowBulkUpload(false);
            setBulkData('');
            setView('admin-create');
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          새 시험 출제하기
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {exams.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            등록된 시험이 없습니다. 새 시험을 출제해보세요!
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm border-b">
                <th className="p-4 font-medium">시험 제목</th>
                <th className="p-4 font-medium">풀 (Pool)</th>
                <th className="p-4 font-medium">출제 문항</th>
                <th className="p-4 font-medium">생성일</th>
                <th className="p-4 font-medium text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {exams.map(exam => {
                const examResults = results.filter(r => r.examId === exam.id);
                return (
                  <tr key={exam.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-800">{exam.title}</td>
                    <td className="p-4 text-gray-600">{exam.questions.length}문항</td>
                    <td className="p-4 text-gray-600">
                      {exam.displayCount === exam.questions.length || !exam.displayCount ? '전체 출제' : `랜덤 ${exam.displayCount}문항`}
                    </td>
                    <td className="p-4 text-gray-500 text-sm">
                      {new Date(exam.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button 
                        onClick={() => handleCopyLink(exam.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                        title="응시 링크 복사"
                      >
                        <Copy size={16} /> 링크
                      </button>
                      
                      {/* 편집 버튼 추가 */}
                      <button 
                        onClick={() => handleEditClick(exam)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-600 rounded-md text-sm hover:bg-yellow-100"
                        title="시험 편집"
                      >
                        <Edit size={16} /> 편집
                      </button>

                      <button 
                        onClick={() => {
                          setCurrentExamId(exam.id);
                          setView('admin-results');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md text-sm hover:bg-blue-200"
                      >
                        <Users size={16} /> 결과 ({examResults.length})
                      </button>
                      <button 
                        onClick={() => handleDeleteExam(exam.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-md text-sm hover:bg-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const renderAdminCreate = () => (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('admin-dash')} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            {editingExamId ? '시험 편집' : '새 시험 출제'}
          </h2>
        </div>
        
        {/* 엑셀 대량 업로드 토글 버튼 */}
        <button 
          onClick={() => setShowBulkUpload(!showBulkUpload)} 
          className="text-sm flex items-center gap-2 text-green-700 font-bold hover:text-green-800 bg-green-100 px-4 py-2 rounded-lg transition-colors"
        >
          <FileSpreadsheet size={18} />
          {showBulkUpload ? '직접 하나씩 입력하기' : '엑셀로 대량 등록하기'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Exam Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">시험 제목</label>
            <input 
              type="text" 
              className="w-full text-lg border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 transition-colors"
              placeholder="예: 2026년 1학기 중간고사 (수학)"
              value={newExamTitle}
              onChange={(e) => setNewExamTitle(e.target.value)}
            />
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 md:col-span-1">
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <Shuffle size={16} className="text-blue-500" />
              랜덤 출제 문항 수
            </label>
            <input 
              type="number" 
              className="w-full text-lg border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 transition-colors"
              placeholder="전체"
              value={displayCount}
              onChange={(e) => setDisplayCount(e.target.value)}
              min="1"
            />
            <p className="text-xs text-gray-400 mt-2">비워두면 등록한 모든 문항이 출제됩니다.</p>
          </div>
        </div>

        {/* 엑셀 대량 업로드 입력창 */}
        {showBulkUpload && (
          <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-green-200 border-l-8 border-l-green-500 animate-fade-in-up">
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-green-600" />
              엑셀 복사/붙여넣기로 문제 등록
            </h3>
            <p className="text-sm text-gray-500 mb-4 bg-gray-50 p-3 rounded-lg">
              엑셀에서 <strong>[문제, 보기1, 보기2, 보기3, 보기4, 정답번호(1~4)]</strong> 총 6개의 열 순서로 작성한 후,<br/> 
              해당 셀들을 모두 드래그 복사(Ctrl+C)하여 아래 빈칸에 그대로 붙여넣기(Ctrl+V) 하세요.
              <br/><span className="text-red-500 font-semibold">* 변환 시 기존에 작성 중이던 문제 목록을 덮어씁니다.</span>
            </p>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-green-500 min-h-[150px] text-sm whitespace-pre font-mono"
              placeholder="예시:&#13;&#10;다음 중 과일이 아닌 것은?&#9;사과&#9;배&#9;오이&#9;포도&#9;3&#13;&#10;대한민국의 수도는?&#9;부산&#9;서울&#9;제주&#9;광주&#9;2"
              value={bulkData}
              onChange={(e) => setBulkData(e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <button 
                onClick={handleBulkUpload} 
                className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm"
              >
                문제 변환하기
              </button>
            </div>
          </div>
        )}

        {/* Questions */}
        {!showBulkUpload && newQuestions.map((q, qIndex) => (
          <div key={qIndex} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative group animate-fade-in-up">
            <button 
              onClick={() => removeQuestionField(qIndex)}
              className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 md:group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={20} />
            </button>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">문제 풀(Pool) {qIndex + 1}</label>
              <textarea 
                className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows="2"
                placeholder="문제를 입력하세요"
                value={q.text}
                onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {q.options.map((opt, optIndex) => (
                <div key={optIndex} className="flex items-center gap-3">
                  <span className="text-gray-400 font-medium w-4">{optIndex + 1}.</span>
                  <input 
                    type="text" 
                    className="flex-1 border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`보기 ${optIndex + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
              <label className="text-sm font-semibold text-blue-800">정답 선택:</label>
              <select 
                className="border-none bg-white rounded p-1 text-sm outline-none ring-1 ring-blue-200"
                value={q.answerIndex}
                onChange={(e) => updateQuestion(qIndex, 'answerIndex', e.target.value)}
              >
                {q.options.map((_, i) => (
                  <option key={i} value={i}>보기 {i + 1}</option>
                ))}
              </select>
            </div>
          </div>
        ))}

        {/* Actions */}
        {!showBulkUpload && (
          <div className="flex items-center gap-4 pt-4">
            <button 
              onClick={addQuestionField}
              className="flex-1 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 font-medium hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={20} /> 풀(Pool)에 문제 추가
            </button>
            <button 
              onClick={handleSaveExam}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-md transition-colors"
            >
              {editingExamId ? '변경사항 저장하기' : '시험 저장 및 발행'}
            </button>
          </div>
        )}
        
        {/* 엑셀 변환 완료 상태일 때 하단에 뜨는 저장 버튼 */}
        {showBulkUpload && newQuestions.length > 1 && (
          <div className="pt-4">
            <button 
              onClick={handleSaveExam}
              className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg transition-colors text-lg"
            >
              {editingExamId ? `변환된 ${newQuestions.length}개로 변경사항 저장` : `변환된 ${newQuestions.length}개 시험 저장 및 발행`}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderAdminResults = () => {
    const exam = exams.find(e => e.id === currentExamId);
    const examResults = results.filter(r => r.examId === currentExamId).sort((a, b) => b.score - a.score);

    if (!exam) return null;

    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setView('admin-dash')} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">결과 분석</h2>
            <p className="text-gray-500">{exam.title}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
            <div className="text-sm text-gray-500 mb-1">총 응시자</div>
            <div className="text-3xl font-bold text-blue-600">{examResults.length}명</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
            <div className="text-sm text-gray-500 mb-1">평균 점수</div>
            <div className="text-3xl font-bold text-green-600">
              {examResults.length > 0 
                ? Math.round(examResults.reduce((sum, r) => sum + r.score, 0) / examResults.length) 
                : 0}점
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
            <div className="text-sm text-gray-500 mb-1">최고 점수</div>
            <div className="text-3xl font-bold text-purple-600">
              {examResults.length > 0 ? Math.max(...examResults.map(r => r.score)) : 0}점
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b">
                  <th className="p-4 font-medium">순위</th>
                  <th className="p-4 font-medium">응시자 이름</th>
                  <th className="p-4 font-medium">점수</th>
                  <th className="p-4 font-medium">정답 수</th>
                  <th className="p-4 font-medium">응시일시</th>
                </tr>
              </thead>
              <tbody>
                {examResults.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500">아직 응시 기록이 없습니다.</td>
                  </tr>
                ) : (
                  examResults.map((res, index) => (
                    <tr key={res.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-500">
                        {index === 0 ? <Trophy size={18} className="text-yellow-500 inline mr-1" /> : null}
                        {index + 1}
                      </td>
                      <td className="p-4 font-bold text-gray-800">{res.studentName}</td>
                      <td className="p-4 font-bold text-blue-600">{res.score}점</td>
                      <td className="p-4 text-gray-600">{res.correctCount} / {res.totalCount}</td>
                      <td className="p-4 text-gray-500 text-sm">{new Date(res.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderStudentEntry = () => {
    if (isLoading) return <div className="text-center py-20 text-gray-500">시험 정보를 불러오는 중...</div>;
    
    if (!currentExamData) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
          <AlertCircle size={48} className="text-red-500" />
          <h2 className="text-2xl font-bold text-gray-800">유효하지 않은 시험입니다</h2>
          <p className="text-gray-500">시험 링크나 코드를 다시 확인해주세요.</p>
          <button onClick={() => setView('home')} className="mt-4 text-blue-600 hover:underline">홈으로 돌아가기</button>
        </div>
      );
    }

    const isRandom = currentExamData.displayCount < currentExamData.questions.length;

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
            <ClipboardList size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{currentExamData.title}</h2>
          <p className="text-gray-500 mb-8">
            {isRandom ? (
              <span className="flex items-center justify-center gap-1">
                <Shuffle size={14} className="text-blue-500" /> 무작위 <strong>{currentExamData.displayCount}문항</strong> 출제
              </span>
            ) : (
              `총 ${currentExamData.questions.length}문항`
            )} 
            <br />모든 문제에 답해야 제출 가능합니다.
          </p>
          
          <div className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">응시자 이름</label>
              <input 
                type="text" 
                className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
                placeholder="이름을 입력하세요 (예: 홍길동)"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startExam()}
              />
            </div>
            <button 
              onClick={startExam}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md"
            >
              시험 시작하기
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStudentTake = () => {
    if (!currentExamData || activeQuestions.length === 0) return null;

    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="bg-white sticky top-0 z-10 py-4 mb-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 truncate pr-4">{currentExamData.title}</h2>
          <div className="bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap">
            응시자: {studentName}
          </div>
        </div>

        <div className="space-y-8">
          {activeQuestions.map((q, qIndex) => (
            <div key={qIndex} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex gap-4 mb-6">
                <div className="text-xl font-bold text-blue-600 shrink-0">Q{qIndex + 1}.</div>
                <div className="text-lg text-gray-800 font-medium leading-relaxed">{q.text}</div>
              </div>

              <div className="space-y-3">
            {q.options.map((opt, optIndex) => {
              const isSelected = studentAnswers[q.originalIndex] === optIndex;
              return (
                <label 
                  key={optIndex} 
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                  }`}
                >
                  <input 
                    type="radio" 
                    name={`question-${q.originalIndex}`} 
                    className="hidden"
                    checked={isSelected}
                    onChange={() => setStudentAnswers({...studentAnswers, [q.originalIndex]: optIndex})}
                  />
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                        {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full" />}
                      </div>
                      <span className={`text-base ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                        {opt}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 mb-20 text-center">
          <button 
            onClick={submitExam}
            className="w-full sm:w-auto px-12 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg transition-transform hover:scale-105"
          >
            답안 제출하기
          </button>
        </div>
      </div>
    );
  };

  const renderStudentResult = () => (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-blue-600"></div>
        
        <div className="relative z-10">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg border-4 border-blue-50">
            <Trophy size={48} className="text-yellow-500" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-1">시험 종료!</h2>
          <p className="text-gray-500 mb-8">{studentName} 님의 응시 결과입니다.</p>
          
          <div className="bg-gray-50 rounded-2xl p-6 mb-8">
            <div className="text-sm text-gray-500 font-medium mb-2">최종 점수</div>
            <div className="text-6xl font-black text-blue-600 mb-4">{studentScore}<span className="text-2xl text-gray-400">점</span></div>
            
            <div className="flex justify-center gap-8 text-sm border-t pt-4">
              <div>
                <span className="block text-gray-400">출제 문항</span>
                <span className="font-bold text-gray-700">{activeQuestions.length}개</span>
              </div>
              <div>
                <span className="block text-gray-400">정답 수</span>
                <span className="font-bold text-green-600">{Math.round((studentScore / 100) * activeQuestions.length)}개</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setView('home')}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
          >
            메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-blue-200 selection:text-blue-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div 
          className="text-xl font-bold text-blue-600 flex items-center gap-2 cursor-pointer"
          onClick={() => setView('home')}
        >
          <ClipboardList size={24} />
          QuizMaster
        </div>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          {user ? (
            <><div className="w-2 h-2 rounded-full bg-green-500"></div> DB 연결됨</>
          ) : (
            <><div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse"></div> 연결 중...</>
          )}
        </div>
      </header>

      <main className="p-4 sm:p-6">
        {view === 'home' && renderHome()}
        {view === 'admin-login' && renderAdminLogin()}
        {view === 'admin-dash' && renderAdminDash()}
        {view === 'admin-create' && renderAdminCreate()}
        {view === 'admin-results' && renderAdminResults()}
        {view === 'student-entry' && renderStudentEntry()}
        {view === 'student-take' && renderStudentTake()}
        {view === 'student-result' && renderStudentResult()}
      </main>

      {renderToast()}
    </div>
  );
}