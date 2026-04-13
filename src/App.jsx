import { useState, useEffect } from "react";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const EPISODES = [
  {
    id: 1,
    title: "현수막의 거짓말",
    subtitle: "EPISODE 01 — THE BANNER LIE",
    briefing: "제9회 지방선거. 강동구 시장 후보 김모씨 캠프에서\n선거비용 보전청구서가 접수됐다.\n금액이 수상하다. 현수막 항목만 2,400만원.\n당신이 이 사건을 맡았다.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E01", type:"영수증", title:"현수막 재제작비 전액 청구",
        content:"예비후보 시절 제작한 현수막(200만원)을\n후보자 등록 후에도 계속 사용.\n전체 200만원을 선거비용으로 보전 청구함.",
        amount:"200만원", answer:"부분보전",
        explanation:"예비후보 때 제작한 현수막을 후보자 기간에도 계속 사용한 경우, 전체 게시일수 중 선거운동기간 해당분만 일할 계산하여 보전합니다. 전액 청구는 과다청구입니다.",
        law:"공직선거법 제60조의3, 제61조"
      },
      {
        id:"E02", type:"거래명세서", title:"양면 현수막 2장 요금 청구",
        content:"거리게시용 현수막을 양면으로 제작(앞뒤 같은 내용).\n업체에 1장 제작비를 지불했으나\n'2면 사용'이라며 2장 분량의 요금을 청구함.",
        amount:"150만원 (실제: 75만원)", answer:"위법",
        explanation:"현수막이 양면이더라도 1장의 현수막이므로 보전기준은 단면으로 게시한 현수막과 동일합니다. 2장 분량 청구는 허위청구입니다.",
        law:"공직선거법 제67조"
      },
      {
        id:"E03", type:"사진+영수증", title:"강풍으로 인한 현수막 교체비",
        content:"선거운동기간 중 강풍으로 선거사무소 현수막 훼손.\n기존 현수막 80만원 + 재제작 현수막 80만원\n총 160만원을 선거비용으로 청구함.",
        amount:"160만원", answer:"보전",
        explanation:"강풍 등 자연재해로 현수막이 훼손되어 교체한 경우, 기존 현수막과 재제작 현수막 비용 모두 공직선거법상 선거비용에 해당하며 보전됩니다.",
        law:"공직선거법 제61조"
      },
      {
        id:"E04", type:"견적서", title:"현수막 조명시설 설치비 청구",
        content:"선거사무소 외벽 현수막을 야간에도 잘 보이도록\n별도 LED 조명시설 설치.\n조명 설치비 45만원을 선거비용으로 청구함.",
        amount:"45만원", answer:"위법",
        explanation:"간판·현판·현수막을 비추기 위해 별도 설치한 조명시설 설치비용은 선거비용외 정치자금으로 보전대상이 아닙니다.",
        law:"공직선거법 제61조"
      }
    ]
  },
  {
    id: 2,
    title: "소품 영수증 세탁",
    subtitle: "EPISODE 02 — THE COSTUME FRAUD",
    briefing: "1화 수사에서 박○○의 꼬리가 잡혔다.\n그런데 소품 항목 영수증이 더 수상하다.\n63,000원 윗옷, 50만원 캐릭터 의상...\n파고들수록 비리의 냄새가 짙어진다.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E05", type:"영수증", title:"63,000원 윗옷 전액 청구",
        content:"선거운동용 윗옷을 63,000원에 구입.\n기호 인쇄비 3,000원 별도 지출.\n윗옷 63,000원 + 인쇄비 3,000원 모두 청구.",
        amount:"66,000원", answer:"부분보전",
        explanation:"선거운동용 윗옷은 6만원 이내만 허용됩니다. 63,000원 윗옷은 위법비용으로 전액 미보전. 단, 기호 등 인쇄비 3,000원은 별개로 보전 가능합니다.",
        law:"공직선거법 제68조"
      },
      {
        id:"E06", type:"견적서+사진", title:"캐릭터 의상 구입비 청구",
        content:"후보자 홍보용 대형 캐릭터 의상 제작.\n제작비 50만원. 선거 후에도 보관 중.\n'선거소품 사용'이라며 전액 보전 청구.",
        amount:"50만원", answer:"위법",
        explanation:"소품은 선거운동기간에 일시적으로 사용·소비되어야 합니다. 선거 후에도 자산가치가 있다고 인정되는 고가 소품은 보전 대상이 아닙니다.",
        law:"공직선거법 제68조"
      },
      {
        id:"E07", type:"지급명세서", title:"자원봉사자 소품 제작비 청구",
        content:"선거사무원이 아닌 자원봉사자 20명에게\n홍보 조끼와 모자 제작·배포.\n제작비 80만원을 선거비용으로 청구함.",
        amount:"80만원", answer:"위법",
        explanation:"선거사무관계자가 아닌 자원봉사자에게 소품을 제작해 준 비용은 위법비용으로 선거비용에 합산하되, 보전되지 않습니다.",
        law:"공직선거법 제68조"
      },
      {
        id:"E08", type:"영수증", title:"방역 마스크 대량 구입비 청구",
        content:"선거사무관계자 코로나 예방 목적으로\n마스크 500개 구입. 기호 표시 없는 단순 방역용.\n구입비 25만원을 선거비용으로 청구.",
        amount:"25만원", answer:"위법",
        explanation:"단순 방역 목적의 마스크는 선거비용외 정치자금으로 보전되지 않습니다. 기호 등을 새겨 선거운동용 소품으로 사용한 경우에만 보전대상입니다.",
        law:"공직선거법 제68조"
      }
    ]
  },
  {
    id: 3,
    title: "차량 장부의 함정",
    subtitle: "EPISODE 03 — THE CAR TRAP",
    briefing: "비리의 규모가 커지고 있다.\n이번엔 공개장소 연설·대담 차량 항목.\n자기 차를 빌려준 척, 위약금도 청구하고...\n탁송비까지. 얼마나 더 나올지.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E09", type:"임차계약서", title:"자기소유 차량 임차비 청구",
        content:"후보자 본인 소유 SUV를\n공개장소 연설·대담 차량으로 사용.\n임차비 명목으로 300만원 청구.",
        amount:"300만원", answer:"위법",
        explanation:"후보자가 자신의 소유 차량을 연설·대담차량으로 사용한 경우, 선거비용으로 계상은 하지만 보전대상은 아닙니다.",
        law:"공직선거법 제79조"
      },
      {
        id:"E10", type:"영수증", title:"차량 계약 파기 위약금 청구",
        content:"연설차량 임차 계약 후 변심으로 파기.\n위약금 50만원 발생.\n'선거운동 준비비용'이라며 선거비용으로 청구.",
        amount:"50만원", answer:"위법",
        explanation:"계약 파기에 따른 위약금은 선거비용외 정치자금입니다. 선거운동에 실제 사용한 비용이 아니므로 보전되지 않습니다.",
        law:"공직선거법 제79조"
      },
      {
        id:"E11", type:"영수증", title:"고장차량 2대분 임차비 청구",
        content:"연설차량 고장으로 교체.\n고장차량 철거비용(2일) + 새 차량 임차비\n2대분 임차비 전액을 선거비용으로 청구.",
        amount:"120만원", answer:"부분보전",
        explanation:"교체 당일 2대 운행 시 둘 다 선거비용이나 1일 1대분만 보전됩니다. 고장차량의 연단 철거를 위한 추가 임차비(2일분)는 선거비용외 정치자금입니다.",
        law:"공직선거법 제79조"
      },
      {
        id:"E12", type:"영수증", title:"연설차량 탁송비·회수비 청구",
        content:"연설차량 인도를 위한 탁송비 10만원,\n선거 후 차량 반납 회수비 10만원.\n총 20만원을 선거비용으로 청구.",
        amount:"20만원", answer:"위법",
        explanation:"연설·대담차량 인도에 소요되는 탁송비는 선거비용외 정치자금에 해당합니다. 차량 기사가 직접 받으러 가는 비용도 마찬가지입니다.",
        law:"공직선거법 제79조"
      }
    ]
  }
];

// ─── TYPEWRITER ───────────────────────────────────────────────────────────────
function useTypewriter(text, speed = 30, active = true) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) { setDisplayed(text); setDone(true); return; }
    setDisplayed(""); setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) { clearInterval(timer); setDone(true); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, active]);
  return { displayed, done };
}

// ─── CINEMATIC INTRO ──────────────────────────────────────────────────────────
function CinematicIntro({ episode, onStart }) {
  const [phase, setPhase] = useState(0);
  const { displayed: brief, done: briefDone } = useTypewriter(episode.briefing, 25, phase >= 1);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (briefDone) {
      const t = setTimeout(() => setPhase(2), 600);
      return () => clearTimeout(t);
    }
  }, [briefDone]);

  return (
    <div style={{
      minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'Courier New', monospace", position:"relative", overflow:"hidden"
    }}>
      {/* Scanlines */}
      <div style={{
        position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px)",
        pointerEvents:"none", zIndex:1
      }}/>
      {/* Red glow top */}
      <div style={{
        position:"absolute", top:0, left:"50%", transform:"translateX(-50%)",
        width:"600px", height:"200px",
        background:"radial-gradient(ellipse at top, rgba(180,20,20,0.15) 0%, transparent 70%)",
        pointerEvents:"none"
      }}/>

      <div style={{ position:"relative", zIndex:2, maxWidth:"680px", width:"100%", textAlign:"center" }}>
        {/* Episode badge */}
        <div style={{
          display:"inline-block", border:"1px solid #e6c619", color:"#e6c619",
          fontSize:"11px", letterSpacing:"4px", padding:"6px 20px", marginBottom:"32px",
          opacity: phase >= 1 ? 1 : 0, transition:"opacity 0.8s"
        }}>
          {episode.subtitle}
        </div>

        {/* Title */}
        <div style={{
          fontSize: window.innerWidth < 480 ? "36px" : "56px",
          fontWeight:"900", color:"#f5f2ea",
          letterSpacing:"-1px", lineHeight:1.1, marginBottom:"12px",
          fontFamily:"Georgia, serif", fontWeight:"900",
          opacity: phase >= 1 ? 1 : 0, transition:"opacity 0.8s 0.3s",
          textShadow:"0 0 60px rgba(180,20,20,0.4)"
        }}>
          {episode.title}
        </div>

        {/* Divider */}
        <div style={{
          width:"60px", height:"2px", background:"#e6c619",
          margin:"24px auto", opacity: phase >= 1 ? 1 : 0, transition:"opacity 0.8s 0.6s"
        }}/>

        {/* Briefing */}
        <div style={{
          fontSize:"15px", fontWeight:"800", color:"#d4cfbf", lineHeight:2, fontWeight:"700",
          whiteSpace:"pre-line", minHeight:"120px", marginBottom:"32px",
          opacity: phase >= 1 ? 1 : 0, transition:"opacity 0.8s 0.8s"
        }}>
          {brief}
          {phase >= 1 && !briefDone && <span style={{
            display:"inline-block", width:"2px", height:"16px",
            background:"#e6c619", marginLeft:"3px", verticalAlign:"middle",
            animation:"blink 0.7s step-end infinite"
          }}/>}
        </div>

        {/* Suspect file */}
        {phase >= 2 && (
          <div style={{
            border:"1px solid rgba(180,20,20,0.4)", background:"rgba(180,20,20,0.06)",
            padding:"16px 24px", marginBottom:"40px", textAlign:"left",
            animation:"fadeIn 0.5s ease"
          }}>
            <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"3px", marginBottom:"8px" }}>
              수사대상
            </div>
            <div style={{ fontSize:"14px", color:"#f5f2ea", letterSpacing:"1px" }}>
              {episode.suspect}
            </div>
          </div>
        )}

        {/* Start button */}
        {phase >= 2 && (
          <button onClick={onStart} style={{
            background:"transparent", border:"1px solid #e6c619",
            color:"#e6c619", fontSize:"13px", letterSpacing:"4px",
            padding:"14px 48px", cursor:"pointer", fontFamily:"'Courier New', monospace",
            transition:"all 0.3s", animation:"fadeIn 0.5s ease 0.3s both"
          }}
          onMouseEnter={e => { e.target.style.background="#e6c619"; e.target.style.color="#060609"; }}
          onMouseLeave={e => { e.target.style.background="transparent"; e.target.style.color="#e6c619"; }}>
            수사 시작
          </button>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ─── EVIDENCE CARD ────────────────────────────────────────────────────────────
function EvidenceCard({ ev, index, onJudge, judgment, revealed, onReveal }) {
  const answerMap = { "보전":"✓ 보전", "위법":"✗ 위법·미보전", "부분보전":"△ 부분보전" };
  const colorMap = { "보전":"#2a9d5c", "위법":"#e6c619", "부분보전":"#d4820a" };
  const isJudged = judgment !== undefined;

  return (
    <div style={{
      background:"#0f0f1a", border:`1px solid ${isJudged ? colorMap[ev.answer] : "rgba(255,255,255,0.1)"}`,
      marginBottom:"20px", transition:"border-color 0.4s",
      animation:`slideIn 0.4s ease ${index * 0.1}s both`
    }}>
      {/* Card header */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)"
      }}>
        <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
          <span style={{
            fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"3px", border:"1px solid rgba(196,30,58,0.4)",
            padding:"3px 8px", letterSpacing:"1px"
          }}>{ev.id}</span>
          <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"2px", fontWeight:"700" }}>{ev.type.toUpperCase()}</span>
        </div>
        {isJudged && (
          <span style={{ fontSize:"12px", color: colorMap[ev.answer], letterSpacing:"2px", fontWeight:"900" }}>
            {answerMap[ev.answer]}
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding:"20px" }}>
        <div style={{ fontSize:"17px", fontWeight:"800", color:"#f5f2ea", marginBottom:"12px", fontFamily:"Georgia,serif", fontWeight:"900" }}>
          {ev.title}
        </div>
        <div style={{ fontSize:"14px", fontWeight:"800", color:"#c0c0d0", lineHeight:1.8, fontWeight:"700", whiteSpace:"pre-line", marginBottom:"16px", fontFamily:"'Noto Sans KR', sans-serif" }}>
          {ev.content}
        </div>
        <div style={{
          display:"inline-block", fontSize:"13px", color:"#f0a030", fontWeight:"800",
          border:"1px solid rgba(212,130,10,0.3)", padding:"4px 12px"
        }}>
          청구금액: {ev.amount}
        </div>

        {/* Judge buttons */}
        {!isJudged && (
          <div style={{ display:"flex", gap:"10px", marginTop:"20px", flexWrap:"wrap" }}>
            {["보전", "부분보전", "위법"].map(opt => (
              <button key={opt} onClick={() => onJudge(ev.id, opt)} style={{
                background:"transparent",
                border:`1px solid ${opt==="보전"?"#2a9d5c":opt==="위법"?"#e6c619":"#d4820a"}`,
                color: opt==="보전"?"#2a9d5c":opt==="위법"?"#e6c619":"#d4820a",
                fontSize:"12px", letterSpacing:"2px", padding:"10px 20px",
                cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace", transition:"all 0.2s"
              }}
              onMouseEnter={e => {
                const c = opt==="보전"?"#2a9d5c":opt==="위법"?"#e6c619":"#d4820a";
                e.target.style.background=c; e.target.style.color="#060609";
              }}
              onMouseLeave={e => {
                const c = opt==="보전"?"#2a9d5c":opt==="위법"?"#e6c619":"#d4820a";
                e.target.style.background="transparent"; e.target.style.color=c;
              }}>
                {opt==="보전"?"✓ 보전":opt==="위법"?"✗ 위법·미보전":"△ 부분보전"}
              </button>
            ))}
          </div>
        )}

        {/* Result reveal */}
        {isJudged && !revealed && (
          <button onClick={() => onReveal(ev.id)} style={{
            marginTop:"16px", background:"transparent",
            border:"1px solid rgba(255,255,255,0.2)", color:"#d4cfbf",
            fontSize:"11px", letterSpacing:"3px", padding:"10px 24px",
            cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace"
          }}>
            판결 확인
          </button>
        )}

        {isJudged && revealed && (
          <div style={{
            marginTop:"16px", padding:"16px",
            background:`rgba(${ev.answer==="보전"?"42,157,92":ev.answer==="위법"?"196,30,58":"212,130,10"},0.08)`,
            border:`1px solid ${colorMap[ev.answer]}22`,
            animation:"fadeIn 0.4s ease"
          }}>
            {judgment !== ev.answer && (
              <div style={{ fontSize:"12px", fontWeight:"800", color:"#e6c619", marginBottom:"8px", letterSpacing:"2px" }}>
                ⚠ 오답 — 정답: {answerMap[ev.answer]}
              </div>
            )}
            {judgment === ev.answer && (
              <div style={{ fontSize:"13px", fontWeight:"800", color:"#3abf70", marginBottom:"10px", letterSpacing:"2px" }}>
                ✓ 정답
              </div>
            )}
            <div style={{ fontSize:"14px", fontWeight:"800", color:"#dedad2", lineHeight:1.8, fontWeight:"800" }}>
              {ev.explanation}
            </div>
            <div style={{ marginTop:"10px", fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"1px", fontWeight:"700" }}>
              📋 {ev.law}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI HINT ──────────────────────────────────────────────────────────────────
function AIHint({ ev, onClose }) {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            model:"claude-sonnet-4-20250514",
            max_tokens:300,
            messages:[{
              role:"user",
              content:`선거비용 보전 전문가로서 아래 케이스에 대해 핵심만 2-3문장으로 설명해줘. 전문 용어 쓰되 실무자가 이해하기 쉽게. 한국어로.

케이스: ${ev.title}
내용: ${ev.content}
관련법: ${ev.law}`
            }]
          })
        });
        const d = await res.json();
        setAnswer(d.content?.[0]?.text || "설명을 불러올 수 없습니다.");
      } catch {
        setAnswer("AI 연결 오류. 직접 관련 법령을 확인하세요.");
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(6,6,9,0.9)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:100, padding:"20px"
    }}>
      <div style={{
        background:"#0f0f1a", border:"1px solid rgba(196,30,58,0.4)",
        maxWidth:"520px", width:"100%", padding:"32px",
        animation:"fadeIn 0.3s ease"
      }}>
        <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"3px", marginBottom:"16px" }}>
          AI 법령 분석
        </div>
        <div style={{ fontSize:"16px", fontWeight:"800", color:"#f5f2ea", marginBottom:"20px", fontFamily:"Georgia,serif", fontWeight:"900" }}>
          {ev.title}
        </div>
        <div style={{ fontSize:"13px", color:"#d4cfbf", lineHeight:1.9, minHeight:"80px" }}>
          {loading ? (
            <span style={{ animation:"blink 0.7s step-end infinite", color:"#e6c619" }}>분석 중...</span>
          ) : answer}
        </div>
        <button onClick={onClose} style={{
          marginTop:"24px", background:"transparent",
          border:"1px solid rgba(255,255,255,0.15)", color:"#9a9aaa",
          fontSize:"11px", letterSpacing:"3px", padding:"10px 24px",
          cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace"
        }}>닫기</button>
      </div>
    </div>
  );
}

// ─── VERDICT SCREEN ───────────────────────────────────────────────────────────
function VerdictScreen({ episode, judgments, onNext, isLast }) {
  const total = episode.evidence.length;
  const correct = episode.evidence.filter(e => judgments[e.id] === e.answer).length;
  const pct = Math.round((correct / total) * 100);
  const grade = pct === 100 ? "완벽" : pct >= 75 ? "우수" : pct >= 50 ? "보통" : "재교육 필요";
  const gradeColor = pct === 100 ? "#f0d060" : pct >= 75 ? "#2a9d5c" : pct >= 50 ? "#d4820a" : "#e6c619";

  return (
    <div style={{
      minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace"
    }}>
      <div style={{ maxWidth:"560px", width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:"12px", fontWeight:"800", color:"#e6c619", letterSpacing:"4px", marginBottom:"24px", animation:"fadeIn 0.5s ease" }}>
          사건 종결
        </div>

        <div style={{
          fontSize:"72px", fontWeight:"900", color: gradeColor,
          marginBottom:"8px", fontFamily:"Georgia,serif",
          animation:"fadeIn 0.5s ease 0.3s both",
          textShadow:`0 0 40px ${gradeColor}66`
        }}>
          {correct}/{total}
        </div>

        <div style={{ fontSize:"14px", fontWeight:"800", color:"#9a9aaa", letterSpacing:"3px", fontWeight:"700", marginBottom:"32px", animation:"fadeIn 0.5s ease 0.5s both" }}>
          정답률 {pct}% — {grade}
        </div>

        <div style={{
          border:`1px solid ${gradeColor}44`, background:`${gradeColor}08`,
          padding:"24px", marginBottom:"40px", animation:"fadeIn 0.5s ease 0.7s both"
        }}>
          {episode.evidence.map(e => (
            <div key={e.id} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.05)",
              fontSize:"13px"
            }}>
              <span style={{ color:"#d4cfbf", textAlign:"left", fontWeight:"700" }}>{e.title}</span>
              <span style={{ color: judgments[e.id] === e.answer ? "#2a9d5c" : "#e6c619", marginLeft:"16px", whiteSpace:"nowrap" }}>
                {judgments[e.id] === e.answer ? "✓" : "✗"}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:"16px", justifyContent:"center", flexWrap:"wrap", animation:"fadeIn 0.5s ease 0.9s both" }}>
          {!isLast && (
            <button onClick={onNext} style={{
              background:"transparent", border:"1px solid #e6c619",
              color:"#e6c619", fontSize:"13px", letterSpacing:"3px",
              padding:"14px 40px", cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace",
              transition:"all 0.3s"
            }}
            onMouseEnter={e => { e.target.style.background="#e6c619"; e.target.style.color="#060609"; }}
            onMouseLeave={e => { e.target.style.background="transparent"; e.target.style.color="#e6c619"; }}>
              다음 사건 →
            </button>
          )}
          {isLast && (
            <div style={{ fontSize:"13px", color:"#f0d060", letterSpacing:"2px", padding:"14px" }}>
              🏆 모든 사건 해결 완료
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ─── INVESTIGATION SCREEN ─────────────────────────────────────────────────────
function InvestigationScreen({ episode, onComplete }) {
  const [judgments, setJudgments] = useState({});
  const [revealed, setRevealed] = useState({});
  const [hintEv, setHintEv] = useState(null);
  const allJudged = episode.evidence.every(e => judgments[e.id] !== undefined);
  const allRevealed = episode.evidence.every(e => revealed[e.id]);

  return (
    <div style={{
      minHeight:"100vh", background:"#080810",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace", position:"relative"
    }}>
      {/* Scanlines */}
      <div style={{
        position:"fixed", inset:0,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 4px)",
        pointerEvents:"none", zIndex:0
      }}/>

      <div style={{ position:"relative", zIndex:1, maxWidth:"720px", margin:"0 auto", padding:"40px 20px" }}>
        {/* Header */}
        <div style={{ borderBottom:"1px solid rgba(196,30,58,0.3)", paddingBottom:"20px", marginBottom:"32px" }}>
          <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"4px", marginBottom:"8px" }}>
            {episode.subtitle}
          </div>
          <div style={{ fontSize:"30px", fontWeight:"800", color:"#f5f2ea", fontFamily:"Georgia,serif", fontWeight:"900" }}>
            {episode.title}
          </div>
          <div style={{ marginTop:"12px", fontSize:"13px", fontWeight:"800", color:"#b0b0c0" }}>
            증거 파일 {episode.evidence.length}건 — 각 항목의 보전 여부를 판단하라
          </div>
        </div>

        {/* Progress */}
        <div style={{
          display:"flex", gap:"8px", marginBottom:"32px", alignItems:"center"
        }}>
          <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"2px", fontWeight:"700" }}>진행</span>
          {episode.evidence.map(e => (
            <div key={e.id} style={{
              width:"32px", height:"4px",
              background: judgments[e.id] ? (judgments[e.id]===e.answer?"#2a9d5c":"#e6c619") : "rgba(255,255,255,0.1)",
              transition:"background 0.4s"
            }}/>
          ))}
          <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", marginLeft:"4px" }}>
            {Object.keys(judgments).length}/{episode.evidence.length}
          </span>
        </div>

        {/* Evidence cards */}
        {episode.evidence.map((ev, i) => (
          <div key={ev.id}>
            <EvidenceCard
              ev={ev} index={i}
              judgment={judgments[ev.id]}
              revealed={revealed[ev.id]}
              onJudge={(id, val) => setJudgments(p => ({ ...p, [id]: val }))}
              onReveal={(id) => setRevealed(p => ({ ...p, [id]: true }))}
            />
            {judgments[ev.id] && !revealed[ev.id] && (
              <button onClick={() => setHintEv(ev)} style={{
                display:"block", margin:"-10px 0 20px auto",
                background:"transparent", border:"none",
                color:"rgba(196,30,58,0.5)", fontSize:"11px", letterSpacing:"2px",
                cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace"
              }}>
                AI 법령 분석 →
              </button>
            )}
          </div>
        ))}

        {/* Complete button */}
        {allJudged && allRevealed && (
          <div style={{ textAlign:"center", marginTop:"32px" }}>
            <button onClick={onComplete} style={{
              background:"#e6c619", border:"none",
              color:"#f5f2ea", fontSize:"13px", letterSpacing:"4px",
              padding:"16px 56px", cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace",
              transition:"all 0.3s",
              animation:"fadeIn 0.5s ease"
            }}>
              사건 종결 →
            </button>
          </div>
        )}
      </div>

      {hintEv && <AIHint ev={hintEv} onClose={() => setHintEv(null)} />}

      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap"); @keyframes slideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("intro"); // intro | investigation | verdict | (next episode)
  const [epIdx, setEpIdx] = useState(0);
  const [allJudgments, setAllJudgments] = useState({});

  const episode = EPISODES[epIdx];

  const handleEpComplete = (judgments) => {
    setAllJudgments(p => ({ ...p, ...judgments }));
    setScreen("verdict");
  };

  const handleNext = () => {
    if (epIdx + 1 < EPISODES.length) {
      setEpIdx(i => i + 1);
      setScreen("intro");
    }
  };

  // Investigation screen needs its own state management
  const [epJudgments, setEpJudgments] = useState({});
  const [epRevealed, setEpRevealed] = useState({});
  const [hintEv, setHintEv] = useState(null);

  useEffect(() => {
    setEpJudgments({});
    setEpRevealed({});
    setHintEv(null);
  }, [epIdx]);

  const allJudged = episode.evidence.every(e => epJudgments[e.id] !== undefined);
  const allRevealedLocal = episode.evidence.every(e => epRevealed[e.id]);

  if (screen === "intro") {
    return <CinematicIntro episode={episode} onStart={() => setScreen("investigation")} />;
  }

  if (screen === "verdict") {
    return (
      <VerdictScreen
        episode={episode}
        judgments={epJudgments}
        isLast={epIdx === EPISODES.length - 1}
        onNext={handleNext}
      />
    );
  }

  // investigation
  return (
    <div style={{
      minHeight:"100vh", background:"#080810",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace", position:"relative"
    }}>
      <div style={{
        position:"fixed", inset:0,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 4px)",
        pointerEvents:"none", zIndex:0
      }}/>

      <div style={{ position:"relative", zIndex:1, maxWidth:"720px", margin:"0 auto", padding:"40px 20px" }}>
        {/* Header */}
        <div style={{ borderBottom:"1px solid rgba(196,30,58,0.3)", paddingBottom:"20px", marginBottom:"32px" }}>
          <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"4px", marginBottom:"8px" }}>{episode.subtitle}</div>
          <div style={{ fontSize:"30px", fontWeight:"800", color:"#f5f2ea", fontFamily:"Georgia,serif", fontWeight:"900" }}>{episode.title}</div>
          <div style={{ marginTop:"12px", fontSize:"13px", fontWeight:"800", color:"#b0b0c0" }}>
            증거 파일 {episode.evidence.length}건 — 각 항목의 보전 여부를 판단하라
          </div>
        </div>

        {/* Progress */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"32px", alignItems:"center" }}>
          <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"2px", fontWeight:"700" }}>진행</span>
          {episode.evidence.map(e => (
            <div key={e.id} style={{
              width:"32px", height:"4px",
              background: epJudgments[e.id]
                ? (epJudgments[e.id]===e.answer?"#2a9d5c":"#e6c619")
                : "rgba(255,255,255,0.1)",
              transition:"background 0.4s"
            }}/>
          ))}
          <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", marginLeft:"4px" }}>
            {Object.keys(epJudgments).length}/{episode.evidence.length}
          </span>
        </div>

        {/* Cards */}
        {episode.evidence.map((ev, i) => {
          const userChoice = epJudgments[ev.id]; // 유저가 선택한 값
          const isJudged = userChoice !== undefined;
          const isRevealed = epRevealed[ev.id];
          const isCorrect = userChoice === ev.answer; // 정답 여부

          // 유저 선택 표시용
          const choiceLabel = {"보전":"✓ 보전","위법":"✗ 위법·미보전","부분보전":"△ 부분보전"};
          const choiceColor = {"보전":"#2a9d5c","위법":"#e6c619","부분보전":"#f0a030"};

          // 테두리: 미판단=흐림 / 판단전=유저선택색 / 공개후=정답여부색
          const borderColor = !isJudged
            ? "rgba(255,255,255,0.1)"
            : !isRevealed
            ? choiceColor[userChoice]
            : isCorrect ? "#2a9d5c" : "#e6c619";

          return (
            <div key={ev.id} style={{
              background:"#0f0f1a",
              border:`1px solid ${borderColor}`,
              marginBottom:"20px", transition:"border-color 0.4s",
              animation:`slideIn 0.4s ease ${i*0.1}s both`
            }}>
              <div style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)"
              }}>
                <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
                  <span style={{
                    fontSize:"11px", fontWeight:"800", color:"#e6c619",
                    border:"1px solid rgba(230,198,25,0.4)", padding:"3px 8px", letterSpacing:"1px"
                  }}>{ev.id}</span>
                  <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"2px", fontWeight:"700" }}>{ev.type.toUpperCase()}</span>
                </div>
                {/* 헤더엔 유저 선택값만 표시 — 정답은 절대 미리 노출 안 함 */}
                {isJudged && (
                  <span style={{ fontSize:"12px", color: choiceColor[userChoice], letterSpacing:"2px", fontWeight:"900" }}>
                    내 판단: {choiceLabel[userChoice]}
                  </span>
                )}
              </div>

              <div style={{ padding:"20px" }}>
                <div style={{ fontSize:"17px", fontWeight:"800", color:"#f5f2ea", marginBottom:"12px", fontFamily:"Georgia,serif", fontWeight:"900" }}>
                  {ev.title}
                </div>
                <div style={{ fontSize:"14px", fontWeight:"800", color:"#c0c0d0", lineHeight:1.8, fontWeight:"700", whiteSpace:"pre-line", marginBottom:"16px", fontFamily:"'Noto Sans KR', sans-serif" }}>
                  {ev.content}
                </div>
                <div style={{
                  display:"inline-block", fontSize:"13px", color:"#f0a030", fontWeight:"800",
                  border:"1px solid rgba(212,130,10,0.3)", padding:"4px 12px"
                }}>
                  청구금액: {ev.amount}
                </div>

                {!isJudged && (
                  <div style={{ display:"flex", gap:"10px", marginTop:"20px", flexWrap:"wrap" }}>
                    {["보전","부분보전","위법"].map(opt => {
                      const c = opt==="보전"?"#2a9d5c":opt==="위법"?"#e6c619":"#d4820a";
                      return (
                        <button key={opt}
                          onClick={() => setEpJudgments(p => ({...p, [ev.id]:opt}))}
                          style={{
                            background:"transparent", border:`1px solid ${c}`, color:c,
                            fontSize:"12px", letterSpacing:"2px", padding:"10px 20px",
                            cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace", transition:"all 0.2s"
                          }}
                          onMouseEnter={e => { e.target.style.background=c; e.target.style.color="#060609"; }}
                          onMouseLeave={e => { e.target.style.background="transparent"; e.target.style.color=c; }}
                        >
                          {opt==="보전"?"✓ 보전":opt==="위법"?"✗ 위법·미보전":"△ 부분보전"}
                        </button>
                      );
                    })}
                  </div>
                )}

                {isJudged && !isRevealed && (
                  <div style={{ display:"flex", gap:"12px", marginTop:"16px", flexWrap:"wrap" }}>
                    <button onClick={() => setEpRevealed(p => ({...p, [ev.id]:true}))} style={{
                      background:"transparent", border:"1px solid rgba(255,255,255,0.2)",
                      color:"#d4cfbf", fontSize:"11px", letterSpacing:"3px",
                      padding:"10px 24px", cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace"
                    }}>판결 확인</button>
                    <button onClick={() => setHintEv(ev)} style={{
                      background:"transparent", border:"1px solid rgba(196,30,58,0.3)",
                      color:"rgba(196,30,58,0.7)", fontSize:"11px", letterSpacing:"2px",
                      padding:"10px 20px", cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace"
                    }}>AI 법령 분석</button>
                  </div>
                )}

                {isJudged && isRevealed && (
                  <div style={{
                    marginTop:"16px", padding:"16px",
                    background: isCorrect ? "rgba(42,157,92,0.08)" : "rgba(230,198,25,0.06)",
                    border:`1px solid ${isCorrect ? "#2a9d5c" : "#e6c619"}33`,
                    animation:"fadeIn 0.4s ease"
                  }}>
                    {isCorrect ? (
                      <div style={{ fontSize:"15px", fontWeight:"800", color:"#3abf70", marginBottom:"10px", letterSpacing:"2px" }}>
                        ✓ 정답
                      </div>
                    ) : (
                      <div style={{ fontSize:"14px", fontWeight:"800", color:"#e6c619", marginBottom:"10px", letterSpacing:"1px" }}>
                        ⚠ 오답 — 정답: {choiceLabel[ev.answer]}
                      </div>
                    )}
                    <div style={{ fontSize:"14px", fontWeight:"800", color:"#dedad2", lineHeight:1.8, fontWeight:"800" }}>{ev.explanation}</div>
                    <div style={{ marginTop:"10px", fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"1px", fontWeight:"700" }}>
                      📋 {ev.law}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Complete */}
        {allJudged && allRevealedLocal && (
          <div style={{ textAlign:"center", marginTop:"32px", animation:"fadeIn 0.5s ease" }}>
            <button onClick={() => setScreen("verdict")} style={{
              background:"#e6c619", border:"none", color:"#0a0a12",
              fontSize:"13px", letterSpacing:"4px", padding:"16px 56px",
              cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace"
            }}>
              사건 종결 →
            </button>
          </div>
        )}
      </div>

      {hintEv && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(6,6,9,0.9)",
          display:"flex", alignItems:"center", justifyContent:"center",
          zIndex:100, padding:"20px"
        }}>
          <AIHint ev={hintEv} onClose={() => setHintEv(null)} />
        </div>
      )}

      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap"); @keyframes slideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
