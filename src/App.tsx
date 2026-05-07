// ... (기존 상단 코드 생략)

{adminTab === 'bank' && (
  <div className="space-y-8 animate-fade-in">
    {/* 헤더 영역: 제목 및 CSV 업로드 */}
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h3 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
        <span className="p-2 bg-blue-100 rounded-lg text-lg">🗃️</span> 중앙 문제 창고
      </h3>
      <label className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold cursor-pointer hover:bg-green-700 transition-all text-sm shadow-md whitespace-nowrap">
        <span>📊</span> CSV 문제 대량 등록
        <input type="file" accept=".csv" className="hidden" onChange={handleBankFileUpload} />
      </label>
    </div>

    {/* 문제 단건 등록 섹션 (기존 유지) */}
    <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-blue-100 shadow-sm space-y-4">
      <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full"></span> 새로운 문제 등록
      </h4>
      <input 
        value={newBankQuestion.category} 
        onChange={e => setNewBankQuestion({...newBankQuestion, category: e.target.value})} 
        className="w-full mb-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all" 
        placeholder="카테고리 (예: 케미컬, 엔진오일, 수공구)"
      />
      <textarea value={newBankQuestion.text} onChange={e => setNewBankQuestion({...newBankQuestion, text: e.target.value})} className="w-full text-lg font-bold outline-none resize-none bg-slate-50 p-4 rounded-xl border border-slate-200 focus:border-blue-500 transition-all" placeholder="문제를 입력하세요" rows={2}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {newBankQuestion.options.map((opt, oi) => (
          <div key={oi} className="relative">
            <input value={opt} onChange={e => setNewBankQuestion({...newBankQuestion, options: newBankQuestion.options.map((o, oIdx) => oIdx === oi ? e.target.value : o)})} className={`w-full p-3 pl-12 rounded-xl border-2 outline-none text-sm transition-colors ${newBankQuestion.answerIndex === oi ? 'border-blue-500 bg-blue-50' : 'border-slate-100'}`} placeholder={`보기 ${oi+1}`}/>
            <button onClick={() => setNewBankQuestion({...newBankQuestion, answerIndex: oi})} className={`absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 font-black text-[10px] flex items-center justify-center ${newBankQuestion.answerIndex === oi ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-300'}`}>{oi+1}</button>
          </div>
        ))}
      </div>
      <textarea value={newBankQuestion.explanation} onChange={e => setNewBankQuestion({...newBankQuestion, explanation: e.target.value})} className="w-full mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:border-blue-500" placeholder="해설 (선택사항)" rows={2}/>
      <button onClick={handleSaveBankQuestion} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md">창고에 저장하기</button>
    </div>

    {/* 🛠️ 관리 도구 영역: 필터링 및 일괄 삭제 */}
    <div className="bg-slate-100 p-4 rounded-3xl flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select 
          value={bankCategoryFilter}
          onChange={(e) => setBankCategoryFilter(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl outline-none font-bold p-2.5 shadow-sm min-w-[150px]"
        >
          <option value="all">전체 카테고리</option>
          {Array.from(new Set(questionBank.map(q => q.category || '미분류'))).map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        
        {/* 선택된 항목 일괄 삭제 */}
        <button 
          disabled={selectedBankQuestions.size === 0}
          onClick={async () => {
            if(window.confirm(`선택한 ${selectedBankQuestions.size}개의 문제를 영구 삭제하시겠습니까?`)) {
              const batch = writeBatch(db);
              selectedBankQuestions.forEach(id => batch.delete(doc(db, 'questionBank', id)));
              await batch.commit();
              setSelectedBankQuestions(new Set());
              showToast('선택한 문제가 삭제되었습니다.');
            }
          }}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${selectedBankQuestions.size > 0 ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
        >
          🗑️ 선택 삭제 ({selectedBankQuestions.size})
        </button>
      </div>

      <div className="flex gap-2">
        {/* 현재 필터링된 카테고리 전체 삭제 */}
        {bankCategoryFilter !== 'all' && (
          <button 
            onClick={async () => {
              const targets = questionBank.filter(q => (q.category || '미분류') === bankCategoryFilter);
              if(window.confirm(`[${bankCategoryFilter}] 카테고리의 모든 문제(${targets.length}개)를 삭제하시겠습니까?`)) {
                const batch = writeBatch(db);
                targets.forEach(q => batch.delete(doc(db, 'questionBank', q.id)));
                await batch.commit();
                setBankCategoryFilter('all');
                showToast(`${bankCategoryFilter} 카테고리가 삭제되었습니다.`);
              }
            }}
            className="px-4 py-2.5 bg-orange-100 text-orange-600 hover:bg-orange-200 rounded-xl font-bold text-xs transition-all"
          >
            🔥 "{bankCategoryFilter}" 일괄 삭제
          </button>
        )}

        {/* 창고 전체 비우기 */}
        <button 
          onClick={async () => {
            if(window.confirm('🚨 주의: 창고의 모든 문제가 삭제됩니다. 정말로 초기화하시겠습니까?')) {
              const batch = writeBatch(db);
              questionBank.forEach(q => batch.delete(doc(db, 'questionBank', q.id)));
              await batch.commit();
              showToast('문제 창고가 완전히 비워졌습니다.');
            }
          }}
          className="px-4 py-2.5 bg-slate-800 text-white hover:bg-black rounded-xl font-bold text-xs transition-all"
        >
          💀 전체 초기화
        </button>
      </div>
    </div>

    {/* 보관된 문제 목록 리스트 */}
    <div className="space-y-4">
      {questionBank
        .filter(q => bankCategoryFilter === 'all' || (q.category || '미분류') === bankCategoryFilter)
        .map((q) => {
          const isSelected = selectedBankQuestions.has(q.id);
          return (
            <div key={q.id} className={`bg-white p-5 rounded-2xl border flex flex-col sm:flex-row justify-between gap-4 group transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-50' : 'hover:border-slate-300'}`}>
              <div className="flex gap-4 flex-1">
                {/* 체크박스 */}
                <input 
                  type="checkbox" 
                  checked={isSelected}
                  onChange={(e) => {
                    const newSet = new Set(selectedBankQuestions);
                    if (e.target.checked) newSet.add(q.id);
                    else newSet.delete(q.id);
                    setSelectedBankQuestions(newSet);
                  }}
                  className="w-5 h-5 mt-1 cursor-pointer accent-blue-600 shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-md font-black uppercase tracking-tight">
                      {q.category || '미분류'}
                    </span>
                  </div>
                  <p className="font-bold text-slate-800 leading-snug">
                    <span className="text-blue-500 mr-2">Q.</span>{q.text}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-bold border border-emerald-100">
                      정답: {q.options[q.answerIndex]}
                    </span>
                    {q.explanation && (
                      <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 italic">
                        💡 {q.explanation}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={async () => { if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'questionBank', q.id)) }} 
                className="text-slate-300 hover:text-red-500 p-2 rounded-lg transition-colors self-end sm:self-center shrink-0"
              >
                🗑️
              </button>
            </div>
          );
        })}
      
      {/* 검색 결과가 없을 때 */}
      {questionBank.filter(q => bankCategoryFilter === 'all' || (q.category || '미분류') === bankCategoryFilter).length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <p className="text-slate-400 font-bold text-lg">표시할 문제가 없습니다.</p>
          <p className="text-slate-300 text-sm mt-1">카테고리를 변경하거나 새로운 문제를 등록해 주세요.</p>
        </div>
      )}
    </div>
  </div>
)}

// ... (기존 하단 코드 생략)
