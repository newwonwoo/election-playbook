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
  },
  {
    id: 4,
    title: "수당 장부 조작",
    subtitle: "EPISODE 04 — THE PAYROLL FRAUD",
    briefing: "현수막, 소품, 차량까지 털렸는데\n박○○은 포기하지 않았다.\n이번엔 선거사무원 수당 장부를 건드렸다.\n서명 하나가 수백만원을 가른다.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E13", type:"수당지급명세서", title:"계좌이체 후 서명 생략",
        content:"선거사무원 15명에게 수당을 계좌이체로 지급.\n'계좌이체했으니 서명 불필요'라며\n수당·실비 지급명세서에 수령인 서명·날인 미징구.\n총 지급액 750만원 보전 청구.",
        amount:"750만원", answer:"위법",
        explanation:"계좌이체를 하였더라도 선거사무관계자 수당·실비 지급명세서에 수령인의 서명·날인을 반드시 받아야 합니다. 서명 없는 명세서는 증빙 불충분으로 미보전 처리됩니다.",
        law:"공직선거관리규칙 제59조"
      },
      {
        id:"E14", type:"영수증", title:"연설차량 기사 숙박비 별도 지급",
        content:"공개장소 연설·대담차량 기사에게\n수당 외 숙박비 1박 8만원씩 10박분\n총 80만원을 별도 지급 후 선거비용으로 청구.",
        amount:"80만원", answer:"위법",
        explanation:"공개장소 연설·대담차량 기사인부임 외에 별도의 숙박비와 식대는 지급할 수 없으며, 지급한 숙박비는 위법비용에 해당하여 보전되지 않습니다.",
        law:"공직선거법 제62조, 제135조"
      },
      {
        id:"E15", type:"계약서", title:"국회의원 보좌관 선거사무장 수당 청구",
        content:"국회의원 보좌관을 선거사무장으로 선임.\n일반 선거사무장과 동일한 수당 전액을\n선거비용으로 청구함.",
        amount:"190만원", answer:"위법",
        explanation:"국회의원 보좌관이 선거사무관계자로 선임된 경우 공직선거법 제135조 단서에 따라 실비만 지급할 수 있습니다. 수당은 지급 불가로 위법비용입니다.",
        law:"공직선거법 제135조 제1항"
      },
      {
        id:"E16", type:"영수증", title:"율동 강사 인건비 선거비용 처리",
        content:"선거사무원 율동 강습을 위해\n외부 강사를 3일간 고용.\n강사비 45만원을 선거비용으로 청구.",
        amount:"45만원", answer:"위법",
        explanation:"선거운동 율동을 강습하는 강사에게 지급하는 인건비는 선거운동 준비행위에 소요된 경비로 선거비용외 정치자금에 해당하여 보전되지 않습니다.",
        law:"공직선거법 제62조"
      }
    ]
  },
  {
    id: 5,
    title: "디지털 광고 이중청구",
    subtitle: "EPISODE 05 — THE DIGITAL DOUBLE BILL",
    briefing: "박○○의 비리는 온라인으로 번졌다.\n유튜브, 인터넷 광고, 문자메시지...\n디지털 흔적은 지울 수 없다.\n영수증 하나하나가 증거다.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E17", type:"영수증", title:"유튜브 영상 제작비 보전 청구",
        content:"유튜브 채널 홍보 영상 3편 제작.\n제작비 총 180만원을 선거비용으로 청구.\n'인터넷 광고'라고 항목 기재.",
        amount:"180만원", answer:"위법",
        explanation:"유튜브는 인터넷 홈페이지로 분류되며 미보전대상 선거비용에 해당합니다. 정치자금 회계관리 프로그램에서도 '그밖의 선거운동-인터넷홈페이지·모바일앱'으로 분류되어 보전되지 않습니다.",
        law:"공직선거법 제59조, 제82조의7"
      },
      {
        id:"E18", type:"청구서", title:"인터넷 광고 미사용 도안 3종 청구",
        content:"인터넷 광고 도안 5종 납품받고 전액 지급.\n실제 광고에 사용된 도안은 3종.\n미사용 도안 2종 제작비도 포함하여 청구.",
        amount:"243만원 (미사용분 97만원 포함)", answer:"부분보전",
        explanation:"선거운동에 실제 사용된 인터넷 광고 도안만 보전대상입니다. 미사용 도안 2종의 제작비는 보전되지 않으며, 실제 사용된 3종 분량만 보전됩니다.",
        law:"공직선거법 제82조의7"
      },
      {
        id:"E19", type:"영수증", title:"자동전화걸기 시스템 비용 청구",
        content:"전화번호 자동입력 후 자동으로 발신하는\n'오토다이얼' 시스템 이용.\n통화료 및 시스템 이용료 120만원 청구.",
        amount:"120만원", answer:"위법",
        explanation:"자동걸기시스템(Auto Dial)을 설치한 전화는 컴퓨터를 이용한 자동 송신장치에 해당하여 위법비용입니다. 공직선거법 제59조에서 제외하는 방법으로 보전되지 않습니다.",
        law:"공직선거법 제59조 제4호"
      },
      {
        id:"E20", type:"영수증", title:"개인통장 문자발송비 정치자금통장 보전",
        content:"후보자가 개인통장에서 문자발송비 50만원 지출.\n회계책임자가 즉시 정치자금 통장에서\n동일금액을 후보자에게 입금 후 보전 청구.",
        amount:"50만원", answer:"위법",
        explanation:"신고된 정치자금 예금계좌 외에서 지출한 비용은 보전되지 않습니다. 개인통장을 통한 선거비용 지출은 정치자금법 위반에 해당합니다.",
        law:"정치자금법 제40조"
      }
    ]
  },
  {
    id: 6,
    title: "개소식 비용 세탁",
    subtitle: "EPISODE 06 — THE KICKOFF WASH",
    briefing: "선거사무소 개소식.\n축하객, 앰프, 다과, 백드롭...\n그 모든 비용이 영수증에 남았다.\n어디까지가 선거비용인가.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E21", type:"영수증", title:"개소식 앰프 임차비 선거비용 청구",
        content:"선거사무소 개소식 행사에 사용할\n앰프·스피커 임차비 35만원을\n선거비용으로 청구함.",
        amount:"35만원", answer:"위법",
        explanation:"개소식에 사용한 앰프 임차비는 선거운동을 위해 지출한 비용이 아니므로 선거비용외 정치자금에 해당합니다. 개소식 자체는 선거운동이 아닙니다.",
        law:"공직선거법 제61조"
      },
      {
        id:"E22", type:"영수증", title:"공약발표 기자회견 백드롭 제작비 청구",
        content:"예비후보자 공약발표 기자회견 배경용\n백드롭(현수막) 제작비 28만원을\n선거비용으로 청구함.",
        amount:"28만원", answer:"위법",
        explanation:"기자회견에서 사용하는 백드롭은 선거비용외 정치자금에 해당하여 보전대상이 아닙니다. 예비후보자의 공약발표 기자회견은 선거운동 방법에 해당하지 않습니다.",
        law:"공직선거법 제60조의3"
      },
      {
        id:"E23", type:"영수증", title:"선거사무소 내부 현수막 제작비 청구",
        content:"선거사무소 실내 벽면에 걸 내부 현수막\n3장 제작비 45만원을\n선거비용(현수막 항목)으로 청구.",
        amount:"45만원", answer:"위법",
        explanation:"선거사무소 내부현수막은 선거비용외 정치자금에 해당하여 보전대상이 아닙니다. 외벽·외부 현수막만 보전대상 선거비용입니다.",
        law:"공직선거법 제61조"
      },
      {
        id:"E24", type:"영수증", title:"선거사무소 조명 손해배상 비용 청구",
        content:"선거사무소 현수막 게시로 인해\n인접 상가 영업 방해 발생.\n통상 손해배상금 20만원을 선거비용으로 청구.",
        amount:"20만원", answer:"위법",
        explanation:"선거사무소 현수막 게시로 인한 통상의 손해배상 비용은 선거비용외 정치자금으로 보전대상이 아닙니다.",
        law:"공직선거법 제61조"
      }
    ]
  },
  {
    id: 7,
    title: "최후의 증거",
    subtitle: "EPISODE 07 — THE FINAL EVIDENCE",
    briefing: "수사 마지막 단계.\n박○○은 증빙서류까지 조작하려 했다.\n하지만 디테일이 그를 배신한다.\n이것이 마지막 사건이다.",
    suspect: "김○○ 후보 캠프 — 회계책임자 박○○",
    evidence: [
      {
        id:"E25", type:"영수증+사진", title:"선거운동 현장 사진 미첨부 청구",
        content:"현수막·소품 등 다수 항목 보전 청구.\n사진 증빙자료 미제출.\n'분실했다'는 이유로 영수증만 첨부하여 제출.",
        amount:"320만원", answer:"위법",
        explanation:"보전청구 시 선거운동에 실제 사용되었음을 증명하는 사진 등 증빙자료를 제출해야 합니다. 정당한 사유 없이 증빙서류를 미제출하면 해당 항목은 미보전 처리됩니다.",
        law:"공직선거관리규칙 제51조의3"
      },
      {
        id:"E26", type:"세금계산서", title:"메이크업 비용 선거비용 처리",
        content:"선거운동기간 매일 아침\n전문 미용사에게 메이크업을 받음.\n총 13일분 메이크업 비용 65만원을 청구.",
        amount:"65만원", answer:"위법",
        explanation:"선거운동기간 중 미용전문가에게 메이크업을 받은 비용은 선거비용외 정치자금에 해당합니다. 단, 방송연설을 위한 전문 분장비는 보전대상입니다.",
        law:"공직선거법 제79조"
      },
      {
        id:"E27", type:"영수증", title:"선거사무소 관리비 전액 선거비용 청구",
        content:"후보자 개인 사무실에 선거사무소 설치.\n선거 전부터 납부해온 관리비(월 15만원)를\n전액 선거비용으로 청구.",
        amount:"45만원(3개월)", answer:"부분보전",
        explanation:"선거사무소 관리비는 선거비용외 정치자금입니다. 단, 선거사무소 설치 전부터 통상 지출해온 금액을 초과하는 부분만 선거비용으로 인정됩니다. 기존에 내던 금액과 동일하다면 전액 미보전입니다.",
        law:"공직선거법 제61조"
      },
      {
        id:"E28", type:"영수증", title:"로고송 예비후보자 시절 선금 지급",
        content:"예비후보자 시절 선거운동용 로고송 제작\n선금 100만원을 지급.\n이를 선거비용으로 보전 청구.",
        amount:"100만원", answer:"보전",
        explanation:"후보자의 선거운동을 위한 로고송 제작비를 예비후보자 때 지출하더라도 보전대상에 해당합니다. 지출 시기가 예비후보자 시절이어도 선거운동용이라면 정상 보전됩니다.",
        law:"공직선거법 제79조"
      }
    ]
  },
];

// ─── FINAL EPISODE DATA ───────────────────────────────────────────────────────
const FINAL_EPISODE = {
  id: 8,
  title: "아직 끝나지 않았다",
  subtitle: "FINAL CHAPTER — IT'S NOT OVER",
  briefing: "박○○은 교묘했다.\n모든 혐의를 선거사무장 이○○에게 뒤집어씌우고\n증거를 인멸한 채 사라졌다.\n\n6개월 후 — 마포구 국회의원 캠프 회계담당.\n이번엔 더 정교하게, 더 대담하게.\n10개의 덫을 동시에 놓았다.\n\n당신만이 막을 수 있다.",
  suspect: "마포구 국회의원 캠프 — 회계담당 박○○ (재범)",
  evidence: [
    {
      id:"F01", type:"복합영수증", title:"예비후보·후보자 혼합 현수막 전액 청구",
      content:"예비후보 40일 + 후보자 13일 사용한 현수막.\n전체 제작비 300만원을 후보자 기간 선거비용으로\n전액 청구. 일할계산 없이 보전 요구.",
      amount:"300만원", answer:"부분보전",
      explanation:"현수막을 예비후보 때 제작해 후보자 기간까지 사용한 경우 전체 게시일수(53일) 중 선거운동기간(13일)에 해당하는 금액만 일할 계산하여 보전합니다. 전액 청구는 과다청구입니다.",
      law:"공직선거법 제60조의3, 제61조"
    },
    {
      id:"F02", type:"계약서", title:"법인 소유 차량 무상 대여 후 임차비 청구",
      content:"후보자가 대표인 법인 소유 차량을\n무상으로 연설·대담차량으로 사용.\n통상 임차비 250만원을 선거비용으로 청구.",
      amount:"250만원", answer:"위법",
      explanation:"법인 소유 차량을 통상 가격으로 임차하는 경우는 보전 가능하지만, 무상으로 대여받아 사용하면서 임차비를 청구하는 것은 허위청구에 해당하여 미보전 처리됩니다.",
      law:"공직선거법 제79조, 정치자금법"
    },
    {
      id:"F03", type:"영수증", title:"확성장치 2세트 동시 운용 임차비 청구",
      content:"연설차량에 확성장치(앰프+스피커) 2세트를\n동시에 설치·운용.\n2세트 임차비 전액 160만원을 청구.",
      amount:"160만원", answer:"부분보전",
      explanation:"확성장치를 2세트 동시에 사용한 경우 위법한 선거운동으로 모두 미보전이 원칙입니다. 단, 1세트를 단순 예비용으로만 보유한 경우에는 실제 사용 1세트분만 보전됩니다. 동시 운용이므로 1세트분만 부분보전 처리됩니다.",
      law:"공직선거법 제79조"
    },
    {
      id:"F04", type:"지급명세서", title:"선거사무원·운전기사 겸임 높은 금액 지급",
      content:"선거사무원이 연설차량 기사를 겸임.\n선거사무원 수당 8만원/일,\n운전기사 인부임 12만원/일.\n12만원 기준으로 13일 지급 후 보전 청구.",
      amount:"156만원", answer:"보전",
      explanation:"선거사무관계자가 연설·대담차량 기사를 겸하는 경우, 기사 인부임과 선거사무관계자 수당·실비 중 큰 금액을 지급할 수 있습니다. 12만원(기사 인부임)이 더 크므로 적법하게 보전됩니다.",
      law:"공직선거법 제62조, 제79조"
    },
    {
      id:"F05", type:"영수증", title:"카카오톡 채널 유료서비스 이용료 청구",
      content:"카카오톡 채널 유료서비스로\n선거운동 정보를 유권자에게 전송.\n선거운동기간 중 이용료 45만원을 청구.",
      amount:"45만원", answer:"보전",
      explanation:"카카오톡 채널 유료서비스를 이용하여 선거운동정보를 전송하는 경우, 전자우편 전송대행업체 위탁에 해당합니다. 선거운동기간 중 이용한 비용은 보전대상입니다.",
      law:"공직선거법 제59조"
    },
    {
      id:"F06", type:"세금계산서", title:"로고송 저작권 대행 수수료·부가세 포함 청구",
      content:"로고송 제작업체가 저작재산권·저작인격권 대행 +\n부가가치세 포함 총괄 세금계산서로 청구.\n총액 220만원 선거비용으로 보전 요구.",
      amount:"220만원", answer:"보전",
      explanation:"로고송 제작업체가 저작권 납부를 대행하고 부가가치세를 포함하여 총괄 세금계산서로 청구한 경우, 대행 수수료와 부가가치세 포함 전액이 보전대상입니다.",
      law:"공직선거법 제79조"
    },
    {
      id:"F07", type:"계약서+영수증", title:"선거 컨설팅비와 인쇄물 도안비 혼재 청구",
      content:"기획사에서 정책·공약개발 컨설팅 80만원 +\n선거공보 기획·도안료 120만원을\n하나의 세금계산서 200만원으로 청구.",
      amount:"200만원", answer:"부분보전",
      explanation:"정책·공약개발 컨설팅 비용은 선거비용외 정치자금입니다. 그러나 선거공보 기획·도안 비용은 보전대상 선거비용입니다. 컨설팅 80만원은 미보전, 도안료 120만원만 보전됩니다.",
      law:"공직선거법 제64조, 제65조"
    },
    {
      id:"F08", type:"영수증", title:"선거운동기간 전 차량 임차분 일할계산 미적용",
      content:"선거운동기간 3일 전부터 연설차량 임차.\n총 임차비 16일분 480만원 전액을\n선거비용으로 청구. 일할계산 적용 안 함.",
      amount:"480만원", answer:"부분보전",
      explanation:"선거운동기간 개시일 전에 임차한 비용은 보전되지 않습니다. 선거운동기간(13일)에 해당하는 금액만 일할 계산하여 보전됩니다. 나머지 3일분은 미보전입니다.",
      law:"공직선거법 제79조"
    },
    {
      id:"F09", type:"영수증", title:"AI 딥페이크 합성 영상 제작비 보전 청구",
      content:"AI 기술로 후보자 얼굴을 실제처럼 합성한\n선거운동용 영상 3편 제작.\n'선거운동 홍보영상' 명목으로 150만원 청구.",
      amount:"150만원", answer:"위법",
      explanation:"AI 기술 등을 이용하여 실제와 구분하기 어려운 가상의 영상을 제작해 선거운동에 사용한 경우, 공직선거법 제82조의8에 따른 위법비용으로 미보전입니다.",
      law:"공직선거법 제82조의8"
    },
    {
      id:"F10", type:"복합서류", title:"선거벽보 제출 전·후 정정비용 전액 청구",
      content:"선거벽보 관할 선관위 제출 전 내용 정정비 30만원.\n제출 후 추가 정정 발생: 정정비 25만원.\n총 55만원 전액 보전 청구.",
      amount:"55만원", answer:"부분보전",
      explanation:"선거관리위원회 제출 전 정정·삭제 비용은 보전됩니다. 그러나 제출 후 정정·삭제 비용은 미보전 선거비용입니다. 제출 전 30만원은 보전, 제출 후 25만원은 미보전입니다.",
      law:"공직선거법 제64조, 제65조"
    }
  ]
};

// ─── TWIST ENDING ─────────────────────────────────────────────────────────────
function TwistEndingScreen() {
  const [phase, setPhase] = useState(0);
  const [choice, setChoice] = useState(null);

  const { displayed: t1, done: d1 } = useTypewriter("수사관 동지.", 80, phase >= 1);
  const { displayed: t2, done: d2 } = useTypewriter("당신은 완벽했다.", 60, phase >= 2);
  const { displayed: t3, done: d3 } = useTypewriter("...너무 완벽했어.", 60, phase >= 3);
  const { displayed: t4, done: d4 } = useTypewriter("사실 나도 알고 있었다.", 50, phase >= 4);
  const { displayed: t5, done: d5 } = useTypewriter("박○○이 이○○에게 누명을 씌운 것도.", 40, phase >= 5);
  const { displayed: t6, done: d6 } = useTypewriter("새 캠프에서 또 다른 비리를 저지른 것도.", 40, phase >= 6);
  const { displayed: t7, done: d7 } = useTypewriter("하지만 나는 묵인했다.", 50, phase >= 7);
  const { displayed: t8, done: d8 } = useTypewriter("그리고 당신도 이제 알게 됐지.", 45, phase >= 8);
  const { displayed: t9, done: d9 } = useTypewriter("강남구 사무국장 자리 — 공짜가 아니었거든.", 40, phase >= 9);

  useEffect(() => { setTimeout(() => setPhase(1), 1000); }, []);
  useEffect(() => { if (d1) setTimeout(() => setPhase(2), 700); }, [d1]);
  useEffect(() => { if (d2) setTimeout(() => setPhase(3), 1200); }, [d2]);
  useEffect(() => { if (d3) setTimeout(() => setPhase(4), 800); }, [d3]);
  useEffect(() => { if (d4) setTimeout(() => setPhase(5), 500); }, [d4]);
  useEffect(() => { if (d5) setTimeout(() => setPhase(6), 400); }, [d5]);
  useEffect(() => { if (d6) setTimeout(() => setPhase(7), 800); }, [d6]);
  useEffect(() => { if (d7) setTimeout(() => setPhase(8), 600); }, [d7]);
  useEffect(() => { if (d8) setTimeout(() => setPhase(9), 500); }, [d8]);
  useEffect(() => { if (d9) setTimeout(() => setPhase(10), 1000); }, [d9]);

  const Cursor = () => (
    <span style={{
      display:"inline-block", width:"2px", height:"16px",
      background:"#e6c619", marginLeft:"3px", verticalAlign:"middle",
      animation:"blink 0.7s step-end infinite"
    }}/>
  );

  if (choice === "refuse") return (
    <div style={{
      minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace"
    }}>
      <div style={{ maxWidth:"600px", width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:"11px", fontWeight:"800", color:"#3abf70", letterSpacing:"5px", marginBottom:"40px", animation:"fadeInUp 0.6s ease" }}>
          양심을 선택하다
        </div>
        <div style={{
          border:"1px solid rgba(58,191,112,0.4)", background:"rgba(58,191,112,0.04)",
          padding:"40px 32px", marginBottom:"40px", animation:"fadeInUp 0.6s ease 0.2s both"
        }}>
          <div style={{ fontSize:"20px", fontWeight:"900", color:"#f5f2ea", lineHeight:2, fontFamily:"Georgia, serif", marginBottom:"24px" }}>
            "그래."
          </div>
          <div style={{ fontSize:"15px", fontWeight:"700", color:"#9a9aaa", lineHeight:2.2 }}>
            양심은 지켰다.<br/>
            하지만 넌 이 도시에서<br/>
            살아남지 못할 거야.
          </div>
        </div>
        <div style={{ fontSize:"13px", fontWeight:"800", color:"#6a6a7a", letterSpacing:"2px", marginBottom:"32px", animation:"fadeInUp 0.6s ease 0.5s both" }}>
          — 진정한 수사관은 결과보다 원칙을 선택한다
        </div>
        <button onClick={() => window.location.reload()} style={{
          background:"transparent", border:"1px solid #3abf70", color:"#3abf70",
          fontSize:"13px", letterSpacing:"4px", padding:"14px 48px", cursor:"pointer",
          fontFamily:"'Noto Sans KR', 'Courier New', monospace", fontWeight:"800", transition:"all 0.3s"
        }}
        onMouseEnter={e => { e.target.style.background="#3abf70"; e.target.style.color="#080810"; }}
        onMouseLeave={e => { e.target.style.background="transparent"; e.target.style.color="#3abf70"; }}>
          처음부터 다시
        </button>
      </div>
      <style>{`@keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );

  if (choice === "join") return (
    <div style={{
      minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace", position:"relative", overflow:"hidden"
    }}>
      <div style={{
        position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        width:"800px", height:"800px",
        background:"radial-gradient(ellipse, rgba(180,20,20,0.12) 0%, transparent 65%)",
        pointerEvents:"none", animation:"pulseGlow 3s ease-in-out infinite"
      }}/>
      <div style={{ position:"relative", maxWidth:"620px", width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"5px", marginBottom:"40px", animation:"fadeInUp 0.6s ease" }}>
          공범이 되다
        </div>
        <div style={{
          border:"1px solid rgba(180,20,20,0.6)", background:"rgba(180,20,20,0.06)",
          padding:"40px 32px", marginBottom:"40px", animation:"fadeInUp 0.6s ease 0.2s both", position:"relative"
        }}>
          <div style={{ position:"absolute", top:"16px", right:"16px", fontSize:"10px", fontWeight:"800", color:"rgba(180,20,20,0.5)", letterSpacing:"3px" }}>기밀문서</div>
          <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"5px", marginBottom:"20px" }}>공 범 각 서</div>
          <div style={{ width:"40px", height:"1px", background:"rgba(180,20,20,0.4)", margin:"0 auto 24px" }}/>
          <div style={{ fontSize:"20px", fontWeight:"900", color:"#f5f2ea", lineHeight:2, fontFamily:"Georgia, serif", marginBottom:"24px" }}>
            "현명한 선택이야.<br/>환영한다, 동료."
          </div>
          <div style={{ fontSize:"15px", fontWeight:"700", color:"#9a9aaa", lineHeight:2.2 }}>
            다음 선거는 마포구.<br/>이번엔 더 크게 한다.<br/>준비됐나?
          </div>
        </div>
        <div style={{ fontSize:"32px", fontWeight:"900", color:"rgba(180,20,20,0.8)", letterSpacing:"4px", marginBottom:"12px", animation:"fadeInUp 0.6s ease 0.5s both", fontFamily:"Georgia, serif" }}>
          TO BE CONTINUED...
        </div>
        <div style={{ fontSize:"12px", fontWeight:"700", color:"#6a6a7a", letterSpacing:"2px", marginBottom:"40px", animation:"fadeInUp 0.6s ease 0.6s both" }}>
          시즌 2에서 계속
        </div>
        <button onClick={() => window.location.reload()} style={{
          background:"transparent", border:"1px solid rgba(180,20,20,0.6)", color:"rgba(220,80,80,0.9)",
          fontSize:"13px", letterSpacing:"4px", padding:"14px 48px", cursor:"pointer",
          fontFamily:"'Noto Sans KR', 'Courier New', monospace", fontWeight:"800", transition:"all 0.3s"
        }}
        onMouseEnter={e => { e.currentTarget.style.background="rgba(180,20,20,0.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.background="transparent"; }}>
          처음부터 다시
        </button>
      </div>
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseGlow { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>
    </div>
  );

  return (
    <div style={{
      minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace", position:"relative"
    }}>
      <div style={{
        position:"fixed", inset:0,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)",
        pointerEvents:"none"
      }}/>
      <div style={{ position:"relative", maxWidth:"640px", width:"100%", textAlign:"left" }}>
        <div style={{ minHeight:"380px", marginBottom:"40px" }}>
          {phase>=1&&<div style={{fontSize:"20px",fontWeight:"900",color:"#f5f2ea",lineHeight:2.4}}>{t1}{phase===1&&!d1&&<Cursor/>}</div>}
          {phase>=2&&<div style={{fontSize:"20px",fontWeight:"900",color:"#f5f2ea",lineHeight:2.4}}>{t2}{phase===2&&!d2&&<Cursor/>}</div>}
          {phase>=3&&<div style={{fontSize:"20px",fontWeight:"900",color:"#e6c619",lineHeight:2.4}}>{t3}{phase===3&&!d3&&<Cursor/>}</div>}
          {phase>=4&&<div style={{fontSize:"15px",fontWeight:"700",color:"#9a9aaa",lineHeight:2.4,marginTop:"16px"}}>{t4}{phase===4&&!d4&&<Cursor/>}</div>}
          {phase>=5&&<div style={{fontSize:"15px",fontWeight:"700",color:"#9a9aaa",lineHeight:2.4}}>{t5}{phase===5&&!d5&&<Cursor/>}</div>}
          {phase>=6&&<div style={{fontSize:"15px",fontWeight:"700",color:"#9a9aaa",lineHeight:2.4}}>{t6}{phase===6&&!d6&&<Cursor/>}</div>}
          {phase>=7&&<div style={{fontSize:"17px",fontWeight:"800",color:"#c0c0d0",lineHeight:2.4,marginTop:"16px"}}>{t7}{phase===7&&!d7&&<Cursor/>}</div>}
          {phase>=8&&<div style={{fontSize:"17px",fontWeight:"800",color:"#c0c0d0",lineHeight:2.4}}>{t8}{phase===8&&!d8&&<Cursor/>}</div>}
          {phase>=9&&<div style={{fontSize:"17px",fontWeight:"900",color:"#e6c619",lineHeight:2.4}}>{t9}{phase===9&&!d9&&<Cursor/>}</div>}
        </div>
        {phase>=10&&(
          <div style={{animation:"fadeInUp 0.8s ease"}}>
            <div style={{fontSize:"13px",fontWeight:"800",color:"#6a6a7a",letterSpacing:"3px",marginBottom:"24px",textAlign:"center"}}>
              — 선택하라 —
            </div>
            <div style={{display:"flex",gap:"16px",flexWrap:"wrap"}}>
              <button onClick={()=>setChoice("refuse")} style={{
                flex:1,minWidth:"200px",background:"transparent",
                border:"1px solid #3abf70",color:"#3abf70",
                fontSize:"14px",letterSpacing:"2px",padding:"20px 24px",cursor:"pointer",
                fontFamily:"'Noto Sans KR','Courier New',monospace",fontWeight:"800",
                transition:"all 0.3s",lineHeight:1.8,textAlign:"center"
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(58,191,112,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                거절한다<br/>
                <span style={{fontSize:"11px",color:"rgba(58,191,112,0.6)",fontWeight:"700"}}>양심을 지킨다</span>
              </button>
              <button onClick={()=>setChoice("join")} style={{
                flex:1,minWidth:"200px",background:"transparent",
                border:"1px solid rgba(180,20,20,0.7)",color:"rgba(220,80,80,0.9)",
                fontSize:"14px",letterSpacing:"2px",padding:"20px 24px",cursor:"pointer",
                fontFamily:"'Noto Sans KR','Courier New',monospace",fontWeight:"800",
                transition:"all 0.3s",lineHeight:1.8,textAlign:"center"
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(180,20,20,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                함께한다<br/>
                <span style={{fontSize:"11px",color:"rgba(220,80,80,0.5)",fontWeight:"700"}}>새로운 게임의 시작</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

// ─── HANDOUT DATA ─────────────────────────────────────────────────────────────
// 버전1: 에피소드별 판단기준
const HANDOUTS = [
  {
    ep:1, title:"현수막", theme:"현수막 제작·설치·게시 관련 보전기준",
    keyRules:[
      {judge:"부분보전", rule:"예비후보→후보자 계속 사용", memo:"전체 게시일 중 선거운동기간만 일할 계산"},
      {judge:"단면기준", rule:"양면 현수막 2장 청구", memo:"2면이어도 1장으로 보아 단면 통상가격 적용"},
      {judge:"보전",    rule:"자연재해로 인한 현수막 교체", memo:"기존+재제작 비용 모두 선거비용"},
      {judge:"위법",   rule:"현수막 조명시설 설치비", memo:"선거비용외 정치자금, 미보전"},
      {judge:"위법",   rule:"선거사무소 내부 현수막", memo:"외부만 보전, 내부는 미보전"},
      {judge:"위법",   rule:"개소식 백드롭·기자회견 현수막", memo:"선거비용외 정치자금"},
    ],
    point:"현수막은 '외부 게시 · 선거운동기간 · 실제 사용' 세 가지 조건 모두 충족해야 보전",
    law:"공직선거법 제61조, 제67조"
  },
  {
    ep:2, title:"소품", theme:"선거운동용 윗옷·소품 보전기준",
    keyRules:[
      {judge:"위법",     rule:"윗옷 6만원 초과 구입", memo:"위법비용 전액 미보전 / 기호 인쇄비만 별도 보전 가능"},
      {judge:"위법",     rule:"선거 후 자산가치 있는 고가 소품", memo:"일시적 사용·소비 목적만 보전"},
      {judge:"위법",     rule:"자원봉사자 소품 제작·배포", memo:"선거사무관계자 외 제공 시 위법비용"},
      {judge:"위법",     rule:"기호 없는 단순 방역 마스크", memo:"기호 등 새겨 소품으로 사용한 경우만 보전"},
      {judge:"보전",     rule:"형광·특수재질 소품", memo:"특수재질 입증 시 통상거래가격 범위 내 별도 보전"},
      {judge:"부분보전", rule:"63,000원 윗옷 + 기호 인쇄비", memo:"윗옷 전액 미보전, 인쇄비 3,000원만 보전"},
    ],
    point:"소품 3원칙 — ① 6만원 이하  ② 선거사무관계자 대상  ③ 선거 후 자산가치 없을 것",
    law:"공직선거법 제68조"
  },
  {
    ep:3, title:"차량", theme:"공개장소 연설·대담차량 보전기준",
    keyRules:[
      {judge:"위법",     rule:"자기소유 차량 임차비 청구", memo:"선거비용 계상은 가능하나 보전대상 아님"},
      {judge:"위법",     rule:"계약 파기 위약금", memo:"선거비용외 정치자금"},
      {judge:"부분보전", rule:"고장 후 대체 — 1일 2대 임차", memo:"1일 1대분만 보전 / 철거 추가 임차는 미보전"},
      {judge:"위법",     rule:"탁송비·회수비", memo:"선거비용외 정치자금"},
      {judge:"부분보전", rule:"선거운동기간 전 임차 기간 포함", memo:"선거운동기간 해당분만 일할 계산"},
      {judge:"위법",     rule:"기사 숙박비·식대 별도 지급", memo:"인부임 외 별도 지급 불가, 위법비용"},
    ],
    point:"차량은 선거운동기간 중 실제 운행한 1대분의 임차비만 보전",
    law:"공직선거법 제79조"
  },
  {
    ep:4, title:"수당", theme:"선거사무관계자 수당·실비 보전기준",
    keyRules:[
      {judge:"위법",   rule:"계좌이체 후 서명 생략", memo:"계좌이체해도 반드시 서명·날인 징구 필수"},
      {judge:"위법",   rule:"차량기사 숙박비 별도 지급", memo:"인부임 외 숙박비·식대 지급 불가"},
      {judge:"위법",   rule:"국회의원 보좌관에게 수당 지급", memo:"보좌관은 실비만 가능, 수당 지급 불가"},
      {judge:"위법",   rule:"율동 강사 인건비", memo:"선거운동 준비행위 비용 = 선거비용외 정치자금"},
      {judge:"보전",   rule:"선거사무원·기사 겸임", memo:"수당·인부임 중 큰 금액으로 지급 가능"},
    ],
    point:"수당은 법정 한도 내 + 지급명세서 서명 필수 + 위법 신분에게 지급 금지",
    law:"공직선거법 제62조, 제135조"
  },
  {
    ep:5, title:"디지털광고", theme:"전화·문자·인터넷 광고 보전기준",
    keyRules:[
      {judge:"위법",   rule:"유튜브 영상 제작비", memo:"인터넷홈페이지 = 미보전대상 선거비용"},
      {judge:"위법",   rule:"미사용 인터넷 광고 도안", memo:"실제 사용된 도안만 보전"},
      {judge:"위법",   rule:"자동걸기(오토다이얼) 이용", memo:"컴퓨터 이용 자동 송신장치 = 위법"},
      {judge:"위법",   rule:"개인통장 문자발송비", memo:"신고 예금계좌 외 지출 불가"},
      {judge:"보전",   rule:"카카오톡 채널 유료서비스", memo:"전자우편 전송대행 해당, 선거운동기간 분 보전"},
    ],
    point:"인터넷홈페이지·유튜브·블로그 게시 목적 비용은 전면 미보전",
    law:"공직선거법 제59조, 제82조의7"
  },
  {
    ep:6, title:"개소식·사무소", theme:"선거사무소 개소식·운영비 보전기준",
    keyRules:[
      {judge:"위법",     rule:"개소식 앰프·다과·비품 구입", memo:"개소식 비용 전체 선거비용외 정치자금"},
      {judge:"위법",     rule:"기자회견 백드롭", memo:"선거운동 방법 아님 = 미보전"},
      {judge:"위법",     rule:"사무소 내부 현수막", memo:"외벽·외부만 보전"},
      {judge:"위법",     rule:"현수막 게시로 인한 손해배상", memo:"통상 손해배상 = 선거비용외 정치자금"},
      {judge:"부분보전", rule:"사무소 관리비 초과분", memo:"기존 납부액 초과분만 선거비용"},
    ],
    point:"개소식·사무소 관련 비용은 대부분 선거비용外 — 현수막 외부게시만 예외",
    law:"공직선거법 제61조"
  },
  {
    ep:7, title:"증빙서류", theme:"증빙자료 제출 및 특수 항목 보전기준",
    keyRules:[
      {judge:"위법",     rule:"사진 증빙 미첨부", memo:"현장 사용 사진 미제출 시 해당 항목 전체 미보전"},
      {judge:"위법",     rule:"선거운동기간 메이크업비", memo:"방송연설 분장비만 예외 보전"},
      {judge:"보전",     rule:"예비후보 시절 로고송 선금", memo:"예비후보 때 지출해도 선거운동용이면 보전"},
      {judge:"위법",     rule:"인터넷홈페이지 동영상", memo:"홈페이지 게시용 = 미보전"},
      {judge:"부분보전", rule:"선거공보 제출 후 정정비", memo:"제출 전 정정은 보전, 제출 후는 미보전"},
    ],
    point:"증빙 = 사진+영수증+서명 3종 세트. 하나라도 빠지면 전액 미보전",
    law:"공직선거관리규칙 제51조의3"
  },
  {
    ep:8, title:"최종화 종합", theme:"혼합 케이스 핵심 판단기준 총정리",
    keyRules:[
      {judge:"위법",     rule:"AI 딥페이크 합성 영상", memo:"실제와 구분 어려운 가상 영상 = 명시적 금지"},
      {judge:"부분보전", rule:"컨설팅비+도안비 혼합 청구", memo:"선거운동 직접 관련분만 분리 보전"},
      {judge:"부분보전", rule:"선거운동기간 전 임차 일할계산", memo:"항상 기간 비례 계산"},
      {judge:"부분보전", rule:"선거공보 제출 전·후 정정", memo:"제출 전=보전, 제출 후=미보전"},
      {judge:"보전",     rule:"로고송 저작권 대행+부가세", memo:"총괄 세금계산서 전액 보전"},
      {judge:"위법",     rule:"무상 대여 차량 임차비 청구", memo:"실제 지출 없는 허위청구 = 미보전"},
    ],
    point:"복합 케이스는 항목별로 분리 → 각각 보전·미보전 판단 후 합산",
    law:"공직선거법 전반"
  },
];


  {
    id: "I",
    title: "선거비용 보전 및 부담비용 청구",
    color: "#2563eb",
    light: "#eff6ff",
    icon: "📋",
    summary: "선거 후 보전청구 절차와 제출 서류 안내",
    sections: [
      {
        title: "보전이란?",
        content: "헌법 제116조의 선거공영제에 따라, 후보자가 적법하게 지출한 선거비용을 지방자치단체가 선거일 후에 돌려주는 제도입니다.",
        highlight: null
      },
      {
        title: "보전 요건 — 얼마나 받나?",
        content: null,
        table: {
          headers: ["득표 결과", "보전 비율"],
          rows: [
            ["당선 또는 사망", "전액(100%)"],
            ["유효투표 15% 이상", "전액(100%)"],
            ["유효투표 10~15% 미만", "50%"],
            ["유효투표 10% 미만", "보전 없음"],
          ],
          colors: ["#16a34a","#16a34a","#d97706","#dc2626"]
        }
      },
      {
        title: "청구 기한 ⏰",
        content: "2026년 6월 15일(월)까지 관할 선거구선관위에 제출해야 합니다.\n누락 항목은 회계보고서 제출 시(2026. 7. 3.)까지 추가 청구 가능합니다.",
        highlight: "마감 2026.6.15"
      },
      {
        title: "제출 서류 체크리스트",
        content: null,
        checklist: [
          "선거비용 보전청구서 (서식 1, 2)",
          "정치자금 수입·지출부 사본 (계정별)",
          "영수증 등 증빙서류 사본",
          "사진 등 객관적 증빙자료",
          "정치자금 수입·지출 통장 사본 (수령계좌)",
          "선거연락소가 있는 경우 선거연락소 보전청구서 사본"
        ]
      },
      {
        title: "영수증 종류별 구비 기준",
        content: null,
        table: {
          headers: ["사업자 유형", "구비 서류"],
          rows: [
            ["일반과세자", "세금계산서 / 체크카드매출전표 / 현금영수증 중 1개"],
            ["간이과세자", "간이영수증 또는 위 중 1개"],
            ["발급불능자", "품명·가액·수량·일자·수령인 정보 기재 영수증"],
          ],
          colors: ["#2563eb","#7c3aed","#0891b2"]
        }
      },
      {
        title: "보전비용 지급 기한",
        content: "보전청구 심사 후 2026년 7월 31일(금)까지 신고 예금계좌로 입금됩니다.",
        highlight: "지급 예정 2026.7.31"
      }
    ]
  },
  {
    id: "II",
    title: "선거비용 보전제한·유예 및 보전비용 반환",
    color: "#dc2626",
    light: "#fef2f2",
    icon: "⚠️",
    summary: "위법 시 보전을 제한하거나 반환을 명령하는 제도",
    sections: [
      {
        title: "보전제한이란?",
        content: "보전비용 지급 전에 위법행위가 발견된 경우 전부 또는 일부를 보전하지 않는 것입니다.",
        highlight: null
      },
      {
        title: "보전제한 기준",
        content: null,
        table: {
          headers: ["위반 유형", "제한 금액"],
          rows: [
            ["회계보고서 미제출 (정당한 사유 없이)", "보전청구액 전액 미보전"],
            ["선거법·정치자금법 위반으로 유죄 확정 / 제한액 초과 지출", "위법비용의 2배 미보전"],
            ["기부행위로 과태료 부과", "기부행위 비용의 5배 미보전"],
          ],
          colors: ["#dc2626","#dc2626","#dc2626"]
        }
      },
      {
        title: "보전유예란?",
        content: "기소되거나 선관위에 의해 고발된 경우, 판결이 확정될 때까지 위법행위 비용의 2배를 유예(보관)합니다.\n불기소 또는 무죄 확정 시 후보자에게 지급됩니다.",
        highlight: null
      },
      {
        title: "보전비용 반환",
        content: "보전 후 미보전 사유 발견 시 선관위가 반환을 명령합니다.\n반환명령 후 30일 이내 반환하지 않으면 지방자치단체장에게 징수 위탁됩니다.",
        highlight: "반환기한: 명령 후 30일"
      },
      {
        title: "당선무효된 자의 반환",
        content: "당선무효에 해당하는 형이 확정된 경우, 반환받은 기탁금과 보전금액 전액을 반환해야 합니다.",
        highlight: null
      }
    ]
  },
  {
    id: "III",
    title: "선거비용과 선거비용외 정치자금",
    color: "#7c3aed",
    light: "#f5f3ff",
    icon: "💰",
    summary: "선거비용과 그 외 정치자금을 명확히 구분하는 기준",
    sections: [
      {
        title: "두 가지 정치자금",
        content: null,
        compare: {
          left: {
            label: "선거비용 ✅",
            color: "#16a34a",
            items: [
              "선거운동을 위해 지출한 비용",
              "선거비용제한액 적용",
              "보전 대상",
              "회계보고 필수"
            ]
          },
          right: {
            label: "선거비용외 정치자금 ❌",
            color: "#dc2626",
            items: [
              "선거운동 목적이 아닌 비용",
              "선거비용제한액 미적용",
              "보전 불가",
              "회계보고 필수"
            ]
          }
        }
      },
      {
        title: "선거비용 해당 항목",
        content: null,
        checklist: [
          "선거사무소·연락소 간판·현판·현수막 제작·설치·철거",
          "선거사무관계자 수당·실비 및 고용·산재보험료",
          "선거벽보·선거공보·선거공약서·후보자 사진 작성",
          "거리게시용 현수막 제작·설치·철거",
          "어깨띠, 소품 구입·제작",
          "신문·방송·인터넷광고 및 방송연설",
          "공개장소 연설·대담 비용",
          "선거운동용 전화 설치비·통화료",
          "명함(점자형 포함) 제작",
          "인터넷 홈페이지 이용 선거운동"
        ]
      },
      {
        title: "선거비용외 정치자금 대표 사례",
        content: null,
        checklist: [
          "개소식 다과·앰프 비용",
          "공약발표 기자회견 백드롭",
          "선거사무소 내부 현수막",
          "선거운동 목적이 아닌 메이크업비",
          "율동 강사 인건비",
          "차량 계약 파기 위약금",
          "탁송비·차량 회수비",
          "손해배상금"
        ]
      },
      {
        title: "선거비용 제한액이란?",
        content: "선거구마다 선관위가 공고한 최대 지출 한도입니다.\n선거비용만 제한액에 산입되며, 선거비용외 정치자금은 포함되지 않습니다.\n정확한 금액은 관할 선관위에 문의하세요.",
        highlight: null
      }
    ]
  },
  {
    id: "IV",
    title: "보전대상 vs 미보전대상 선거비용",
    color: "#059669",
    light: "#ecfdf5",
    icon: "⚖️",
    summary: "선거비용 중에서도 보전되는 것과 안 되는 것의 구분",
    sections: [
      {
        title: "보전대상 선거비용",
        content: null,
        checklist: [
          "공직선거법이 허용하는 방법으로 지출한 선거운동 비용",
          "선거비용제한액 범위 내 지출",
          "적법한 영수증이 첨부된 항목",
          "선거운동기간 중 실제 사용한 비용",
          "통상거래가격 범위 내 비용"
        ]
      },
      {
        title: "미보전대상 선거비용 (선거비용이지만 보전 안 됨)",
        content: null,
        checklist: [
          "예비후보자가 지출한 비용 (일부 제외)",
          "후보자가 자신의 소유 차량·장비 등을 사용한 경우",
          "실제 사용하지 않은 물품 제작비",
          "정당선거사무소가 당비로 처리해야 할 비용",
          "6만원 초과 선거운동용 윗옷",
          "선거 후에도 자산가치가 있는 고가 소품"
        ]
      },
      {
        title: "주의: 위법비용",
        content: "공직선거법에 위반된 방법으로 지출한 비용은 '위법비용'으로 선거비용에 합산되지만 보전되지 않습니다.\n자원봉사자 소품 제공, 법정 한도 초과 소품 등이 해당됩니다.",
        highlight: "위법비용 = 선거비용 합산 + 미보전"
      }
    ]
  },
  {
    id: "V",
    title: "주요항목 보전기준 및 산정방식",
    color: "#d97706",
    light: "#fffbeb",
    icon: "📐",
    summary: "항목별 보전 금액 산정 기준과 계산 방법",
    sections: [
      {
        title: "인쇄물 보전기준",
        content: null,
        table: {
          headers: ["항목", "기준"],
          rows: [
            ["선거벽보·선거공보", "통상거래가격 범위 내"],
            ["명함", "제작비 포함 (기획·도안료 별도 불가)"],
            ["점자형 명함", "보전대상 (점자형 선거공보와 별개)"],
          ],
          colors: ["#d97706","#d97706","#d97706"]
        }
      },
      {
        title: "현수막 보전기준",
        content: null,
        table: {
          headers: ["구분", "보전 기준"],
          rows: [
            ["예비후보 시절 제작 → 후보자 때도 사용", "선거운동기간 일할 계산"],
            ["양면 현수막", "단면 기준 1장으로 보전"],
            ["조명시설 별도 설치", "미보전 (선거비용외)"],
            ["강풍 등 자연재해로 훼손·교체", "기존+재제작 모두 보전"],
          ],
          colors: ["#d97706","#d97706","#d97706","#d97706"]
        }
      },
      {
        title: "공개장소 연설·대담 보전기준",
        content: null,
        table: {
          headers: ["항목", "기준"],
          rows: [
            ["차량 임차비", "선거운동기간분만 일할 계산"],
            ["자기소유 차량 사용", "계상은 하되 미보전"],
            ["기사 인부임 + 선거사무원 겸직", "둘 중 큰 금액 지급·보전"],
            ["확성장치 (시·도의원)", "3kW 이하만 보전"],
            ["로고송 예비후보 시절 선금", "보전 가능"],
          ],
          colors: ["#d97706","#d97706","#d97706","#d97706","#d97706"]
        }
      },
      {
        title: "전화·문자메시지 보전기준",
        content: null,
        table: {
          headers: ["대상", "보전 여부"],
          rows: [
            ["후보자·배우자·선거사무장·회계책임자 휴대전화", "보전"],
            ["선거사무원 휴대전화 통화료", "미보전"],
            ["자동걸기시스템(오토다이얼)", "위법·미보전"],
            ["인터넷전화 해지 위약금", "선거비용외·미보전"],
            ["전화기 구입비", "미보전"],
          ],
          colors: ["#16a34a","#dc2626","#dc2626","#dc2626","#dc2626"]
        }
      },
      {
        title: "선거사무관계자 수당 보전기준",
        content: null,
        table: {
          headers: ["구분", "기준"],
          rows: [
            ["수당·실비 지급", "지급명세서 수령인 서명·날인 필수 (계좌이체도 동일)"],
            ["국회의원 보좌관 선임 시", "실비만 지급 가능 (수당 불가)"],
            ["숙박비 별도 지급", "위법·미보전"],
            ["율동 강사비", "선거비용외·미보전"],
          ],
          colors: ["#d97706","#dc2626","#dc2626","#dc2626"]
        }
      }
    ]
  },
  {
    id: "VI",
    title: "문답으로 알아보는 선거비용 보전실무",
    color: "#0891b2",
    light: "#ecfeff",
    icon: "❓",
    summary: "실무에서 자주 묻는 질문과 명확한 답변 모음",
    sections: [
      {
        title: "현수막·간판 관련 FAQ",
        content: null,
        faq: [
          { q: "예비후보 때 현수막을 후보자 때도 쓰면?", a: "선거운동기간 비율로 일할 계산하여 보전" },
          { q: "양면 현수막을 2장으로 청구해도 되나?", a: "안 됨. 단면 1장 기준으로만 보전" },
          { q: "선거사무소 내부 현수막은?", a: "선거비용외 정치자금. 보전 불가" },
          { q: "현수막 조명시설 설치비는?", a: "선거비용외 정치자금. 보전 불가" },
          { q: "공약발표 기자회견 백드롭은?", a: "선거비용외 정치자금. 보전 불가" },
        ]
      },
      {
        title: "소품 관련 FAQ",
        content: null,
        faq: [
          { q: "선거운동용 윗옷 구입비 한도는?", a: "6만원 이내. 초과 시 위법비용으로 전액 미보전" },
          { q: "고가 캐릭터 의상은?", a: "선거 후 자산가치가 있으면 미보전" },
          { q: "자원봉사자에게 소품 제공 시?", a: "위법비용으로 미보전" },
          { q: "마스크 구입비는?", a: "기호 새겨 소품으로 써야만 보전. 방역용은 불가" },
          { q: "기호 새긴 장갑·토시는?", a: "보전 가능. 단순 방열용은 불가" },
        ]
      },
      {
        title: "차량 관련 FAQ",
        content: null,
        faq: [
          { q: "자기소유 차량 임차비를 청구할 수 있나?", a: "선거비용으로 계상은 하지만 보전은 불가" },
          { q: "차량 계약 파기 위약금은?", a: "선거비용외 정치자금. 미보전" },
          { q: "탁송비·회수비는?", a: "선거비용외 정치자금. 미보전" },
          { q: "기사 숙박비를 별도 지급하면?", a: "위법비용. 미보전" },
          { q: "연설차량 고장 시 2대 청구?", a: "1일 1대분만 보전. 철거비 추가분은 미보전" },
        ]
      },
      {
        title: "전화·인터넷 관련 FAQ",
        content: null,
        faq: [
          { q: "유튜브 영상 제작비는?", a: "인터넷 홈페이지로 분류. 미보전" },
          { q: "카카오톡 채널 유료서비스는?", a: "전자우편 전송대행에 해당. 선거운동기간분 보전" },
          { q: "자동걸기시스템 이용료는?", a: "위법비용. 미보전" },
          { q: "개인통장으로 문자비 지출 후 입금은?", a: "신고 계좌외 지출로 미보전" },
          { q: "AI 딥페이크 영상 제작비는?", a: "공직선거법 제82조의8 위반. 미보전" },
        ]
      },
      {
        title: "수당·실비 관련 FAQ",
        content: null,
        faq: [
          { q: "계좌이체 시 수당명세서 서명 생략 가능?", a: "불가. 계좌이체라도 서명·날인 필수" },
          { q: "국회의원 보좌관 선거사무장 수당?", a: "실비만 지급 가능. 수당 지급 불가" },
          { q: "율동 강사비는?", a: "선거운동 준비 행위. 선거비용외 정치자금" },
          { q: "보좌관 식사 제공 명단 미첨부 시?", a: "식사자 명단 제출 시에만 보전" },
        ]
      }
    ]
  },
  {
    id: "VII",
    title: "보전항목별 증빙자료 작성요령",
    color: "#be185d",
    light: "#fdf2f8",
    icon: "📄",
    summary: "항목별로 어떤 서류를 어떻게 첨부해야 하는지 안내",
    sections: [
      {
        title: "증빙자료 작성 3원칙",
        content: null,
        checklist: [
          "선거운동에 실제 사용됐음을 객관적으로 증명할 수 있어야 함",
          "사진은 선거운동 중인 현장 사진 (사용 물품이 사진에 보여야 함)",
          "선거기간 중 구비 (선거 후 소급 제작 불가)"
        ]
      },
      {
        title: "증빙자료 작성 유의사항",
        content: null,
        checklist: [
          "정당한 사유 없이 미제출·누락 시 해당 항목 미보전",
          "선관위 보완 요청에 불응 시 해당 항목 미보전",
          "사진·파일 멸실·훼손 시 정당한 불가 사유 입증 필요",
          "다른 방법으로 실제 사용을 증명하면 보전 가능"
        ]
      },
      {
        title: "항목별 주요 증빙 서류",
        content: null,
        table: {
          headers: ["항목", "필요 서류"],
          rows: [
            ["현수막·간판", "영수증 + 설치·사용 현장 사진"],
            ["소품 (윗옷·어깨띠)", "영수증 + 착용 현장 사진"],
            ["연설차량", "임차계약서 + 사용 현장 사진 + 유류비 영수증"],
            ["선거사무원 수당", "수당·실비 지급명세서 (서명·날인) + 계좌이체확인증"],
            ["전화요금", "전화요금 보전청구내역서 + 통신사 정산결과 통보서"],
            ["방송·신문광고", "계약서 + 광고 게재 확인서"],
            ["인쇄물", "납품확인서 + 사용 현장 사진"],
          ],
          colors: ["#be185d","#be185d","#be185d","#be185d","#be185d","#be185d","#be185d"]
        }
      }
    ]
  },
  {
    id: "VIII",
    title: "주요 일정 및 서식",
    color: "#475569",
    light: "#f8fafc",
    icon: "📅",
    summary: "9회 지방선거 주요 회계 일정 및 각종 서식 목록",
    sections: [
      {
        title: "주요 회계 일정",
        content: null,
        table: {
          headers: ["일정", "날짜", "담당"],
          rows: [
            ["선거비용제한액 공고", "2026.1.23 (기공고)", "관할 선관위"],
            ["선거일", "2026.6.3 (수)", "—"],
            ["선거운동기간", "2026.5.21~6.2 (13일간)", "—"],
            ["보전청구 마감", "2026.6.15 (월)", "후보자·정당"],
            ["회계 마감", "2026.6.23 (화)", "회계책임자"],
            ["기탁금 반환·공제명세서 송부", "2026.7.3 (금)까지", "관할 선관위"],
            ["보전비용 지급 예정", "2026.7.31 (금)", "관할 선관위"],
          ],
          colors: ["#475569","#475569","#475569","#dc2626","#475569","#475569","#16a34a"]
        }
      },
      {
        title: "각종 서식 목록",
        content: null,
        table: {
          headers: ["서식번호", "내용"],
          rows: [
            ["서식 1", "선거비용 보전청구서 (지역구·지방자치단체장용)"],
            ["서식 2", "선거비용 보전청구서 (비례대표용)"],
            ["서식 3", "선거운동용 전화요금 정산 청구서"],
            ["서식 4", "선거사무장 등 전화요금 정산 위임장"],
            ["서식 5", "전화요금 보전청구내역서"],
            ["서식 6", "선거사무관계자 수당·실비 지급명세서"],
            ["서식 7", "점자형 선거공보 등 부담비용 지급청구서"],
            ["서식 8", "후보자 반환기탁금 및 보전비용 인계·인수서"],
            ["서식 9", "반환기탁금 및 보전비용 정산서"],
          ],
          colors: ["#475569","#475569","#475569","#475569","#475569","#475569","#475569","#475569","#475569"]
        }
      },
      {
        title: "부록 자료",
        content: null,
        checklist: [
          "선거비용 및 보전항목 일람표 (p.154)",
          "통상거래가격 결정내역 (p.174)",
          "반환기탁금·보전비용 인계비용 계산프로그램 매뉴얼 (p.189)",
          "정치자금 회계관리 프로그램 수입·지출부 출력 방법 (p.195)",
          "선거사무관계자 고용·산재보험 가입 안내 (p.196)"
        ]
      }
    ]
  }
];

// 버전2: 안내서 챕터 기반
const CHAPTERS = [
  {
    id: "I",
    title: "선거비용 보전 및 부담비용 청구",
    color: "#2563eb",
    light: "#eff6ff",
    icon: "📋",
    summary: "선거 후 보전청구 절차와 제출 서류 안내",
    sections: [
      {
        title: "보전이란?",
        content: "헌법 제116조의 선거공영제에 따라, 후보자가 적법하게 지출한 선거비용을 지방자치단체가 선거일 후에 돌려주는 제도입니다.",
        highlight: null
      },
      {
        title: "보전 요건 — 얼마나 받나?",
        content: null,
        table: {
          headers: ["득표 결과", "보전 비율"],
          rows: [
            ["당선 또는 사망", "전액(100%)"],
            ["유효투표 15% 이상", "전액(100%)"],
            ["유효투표 10~15% 미만", "50%"],
            ["유효투표 10% 미만", "보전 없음"],
          ],
          colors: ["#16a34a","#16a34a","#d97706","#dc2626"]
        }
      },
      {
        title: "청구 기한 ⏰",
        content: "2026년 6월 15일(월)까지 관할 선거구선관위에 제출해야 합니다.\n누락 항목은 회계보고서 제출 시(2026. 7. 3.)까지 추가 청구 가능합니다.",
        highlight: "마감 2026.6.15"
      },
      {
        title: "제출 서류 체크리스트",
        content: null,
        checklist: [
          "선거비용 보전청구서 (서식 1, 2)",
          "정치자금 수입·지출부 사본 (계정별)",
          "영수증 등 증빙서류 사본",
          "사진 등 객관적 증빙자료",
          "정치자금 수입·지출 통장 사본 (수령계좌)",
          "선거연락소가 있는 경우 선거연락소 보전청구서 사본"
        ]
      },
      {
        title: "영수증 종류별 구비 기준",
        content: null,
        table: {
          headers: ["사업자 유형", "구비 서류"],
          rows: [
            ["일반과세자", "세금계산서 / 체크카드매출전표 / 현금영수증 중 1개"],
            ["간이과세자", "간이영수증 또는 위 중 1개"],
            ["발급불능자", "품명·가액·수량·일자·수령인 정보 기재 영수증"],
          ],
          colors: ["#2563eb","#7c3aed","#0891b2"]
        }
      },
      {
        title: "보전비용 지급 기한",
        content: "보전청구 심사 후 2026년 7월 31일(금)까지 신고 예금계좌로 입금됩니다.",
        highlight: "지급 예정 2026.7.31"
      }
    ]
  },
  {
    id: "II",
    title: "선거비용 보전제한·유예 및 보전비용 반환",
    color: "#dc2626",
    light: "#fef2f2",
    icon: "⚠️",
    summary: "위법 시 보전을 제한하거나 반환을 명령하는 제도",
    sections: [
      {
        title: "보전제한이란?",
        content: "보전비용 지급 전에 위법행위가 발견된 경우 전부 또는 일부를 보전하지 않는 것입니다.",
        highlight: null
      },
      {
        title: "보전제한 기준",
        content: null,
        table: {
          headers: ["위반 유형", "제한 금액"],
          rows: [
            ["회계보고서 미제출 (정당한 사유 없이)", "보전청구액 전액 미보전"],
            ["선거법·정치자금법 위반으로 유죄 확정 / 제한액 초과 지출", "위법비용의 2배 미보전"],
            ["기부행위로 과태료 부과", "기부행위 비용의 5배 미보전"],
          ],
          colors: ["#dc2626","#dc2626","#dc2626"]
        }
      },
      {
        title: "보전유예란?",
        content: "기소되거나 선관위에 의해 고발된 경우, 판결이 확정될 때까지 위법행위 비용의 2배를 유예(보관)합니다.\n불기소 또는 무죄 확정 시 후보자에게 지급됩니다.",
        highlight: null
      },
      {
        title: "보전비용 반환",
        content: "보전 후 미보전 사유 발견 시 선관위가 반환을 명령합니다.\n반환명령 후 30일 이내 반환하지 않으면 지방자치단체장에게 징수 위탁됩니다.",
        highlight: "반환기한: 명령 후 30일"
      },
      {
        title: "당선무효된 자의 반환",
        content: "당선무효에 해당하는 형이 확정된 경우, 반환받은 기탁금과 보전금액 전액을 반환해야 합니다.",
        highlight: null
      }
    ]
  },
  {
    id: "III",
    title: "선거비용과 선거비용외 정치자금",
    color: "#7c3aed",
    light: "#f5f3ff",
    icon: "💰",
    summary: "선거비용과 그 외 정치자금을 명확히 구분하는 기준",
    sections: [
      {
        title: "두 가지 정치자금",
        content: null,
        compare: {
          left: {
            label: "선거비용 ✅",
            color: "#16a34a",
            items: [
              "선거운동을 위해 지출한 비용",
              "선거비용제한액 적용",
              "보전 대상",
              "회계보고 필수"
            ]
          },
          right: {
            label: "선거비용외 정치자금 ❌",
            color: "#dc2626",
            items: [
              "선거운동 목적이 아닌 비용",
              "선거비용제한액 미적용",
              "보전 불가",
              "회계보고 필수"
            ]
          }
        }
      },
      {
        title: "선거비용 해당 항목",
        content: null,
        checklist: [
          "선거사무소·연락소 간판·현판·현수막 제작·설치·철거",
          "선거사무관계자 수당·실비 및 고용·산재보험료",
          "선거벽보·선거공보·선거공약서·후보자 사진 작성",
          "거리게시용 현수막 제작·설치·철거",
          "어깨띠, 소품 구입·제작",
          "신문·방송·인터넷광고 및 방송연설",
          "공개장소 연설·대담 비용",
          "선거운동용 전화 설치비·통화료",
          "명함(점자형 포함) 제작",
          "인터넷 홈페이지 이용 선거운동"
        ]
      },
      {
        title: "선거비용외 정치자금 대표 사례",
        content: null,
        checklist: [
          "개소식 다과·앰프 비용",
          "공약발표 기자회견 백드롭",
          "선거사무소 내부 현수막",
          "선거운동 목적이 아닌 메이크업비",
          "율동 강사 인건비",
          "차량 계약 파기 위약금",
          "탁송비·차량 회수비",
          "손해배상금"
        ]
      },
      {
        title: "선거비용 제한액이란?",
        content: "선거구마다 선관위가 공고한 최대 지출 한도입니다.\n선거비용만 제한액에 산입되며, 선거비용외 정치자금은 포함되지 않습니다.\n정확한 금액은 관할 선관위에 문의하세요.",
        highlight: null
      }
    ]
  },
  {
    id: "IV",
    title: "보전대상 vs 미보전대상 선거비용",
    color: "#059669",
    light: "#ecfdf5",
    icon: "⚖️",
    summary: "선거비용 중에서도 보전되는 것과 안 되는 것의 구분",
    sections: [
      {
        title: "보전대상 선거비용",
        content: null,
        checklist: [
          "공직선거법이 허용하는 방법으로 지출한 선거운동 비용",
          "선거비용제한액 범위 내 지출",
          "적법한 영수증이 첨부된 항목",
          "선거운동기간 중 실제 사용한 비용",
          "통상거래가격 범위 내 비용"
        ]
      },
      {
        title: "미보전대상 선거비용 (선거비용이지만 보전 안 됨)",
        content: null,
        checklist: [
          "예비후보자가 지출한 비용 (일부 제외)",
          "후보자가 자신의 소유 차량·장비 등을 사용한 경우",
          "실제 사용하지 않은 물품 제작비",
          "정당선거사무소가 당비로 처리해야 할 비용",
          "6만원 초과 선거운동용 윗옷",
          "선거 후에도 자산가치가 있는 고가 소품"
        ]
      },
      {
        title: "주의: 위법비용",
        content: "공직선거법에 위반된 방법으로 지출한 비용은 '위법비용'으로 선거비용에 합산되지만 보전되지 않습니다.\n자원봉사자 소품 제공, 법정 한도 초과 소품 등이 해당됩니다.",
        highlight: "위법비용 = 선거비용 합산 + 미보전"
      }
    ]
  },
  {
    id: "V",
    title: "주요항목 보전기준 및 산정방식",
    color: "#d97706",
    light: "#fffbeb",
    icon: "📐",
    summary: "항목별 보전 금액 산정 기준과 계산 방법",
    sections: [
      {
        title: "인쇄물 보전기준",
        content: null,
        table: {
          headers: ["항목", "기준"],
          rows: [
            ["선거벽보·선거공보", "통상거래가격 범위 내"],
            ["명함", "제작비 포함 (기획·도안료 별도 불가)"],
            ["점자형 명함", "보전대상 (점자형 선거공보와 별개)"],
          ],
          colors: ["#d97706","#d97706","#d97706"]
        }
      },
      {
        title: "현수막 보전기준",
        content: null,
        table: {
          headers: ["구분", "보전 기준"],
          rows: [
            ["예비후보 시절 제작 → 후보자 때도 사용", "선거운동기간 일할 계산"],
            ["양면 현수막", "단면 기준 1장으로 보전"],
            ["조명시설 별도 설치", "미보전 (선거비용외)"],
            ["강풍 등 자연재해로 훼손·교체", "기존+재제작 모두 보전"],
          ],
          colors: ["#d97706","#d97706","#d97706","#d97706"]
        }
      },
      {
        title: "공개장소 연설·대담 보전기준",
        content: null,
        table: {
          headers: ["항목", "기준"],
          rows: [
            ["차량 임차비", "선거운동기간분만 일할 계산"],
            ["자기소유 차량 사용", "계상은 하되 미보전"],
            ["기사 인부임 + 선거사무원 겸직", "둘 중 큰 금액 지급·보전"],
            ["확성장치 (시·도의원)", "3kW 이하만 보전"],
            ["로고송 예비후보 시절 선금", "보전 가능"],
          ],
          colors: ["#d97706","#d97706","#d97706","#d97706","#d97706"]
        }
      },
      {
        title: "전화·문자메시지 보전기준",
        content: null,
        table: {
          headers: ["대상", "보전 여부"],
          rows: [
            ["후보자·배우자·선거사무장·회계책임자 휴대전화", "보전"],
            ["선거사무원 휴대전화 통화료", "미보전"],
            ["자동걸기시스템(오토다이얼)", "위법·미보전"],
            ["인터넷전화 해지 위약금", "선거비용외·미보전"],
            ["전화기 구입비", "미보전"],
          ],
          colors: ["#16a34a","#dc2626","#dc2626","#dc2626","#dc2626"]
        }
      },
      {
        title: "선거사무관계자 수당 보전기준",
        content: null,
        table: {
          headers: ["구분", "기준"],
          rows: [
            ["수당·실비 지급", "지급명세서 수령인 서명·날인 필수 (계좌이체도 동일)"],
            ["국회의원 보좌관 선임 시", "실비만 지급 가능 (수당 불가)"],
            ["숙박비 별도 지급", "위법·미보전"],
            ["율동 강사비", "선거비용외·미보전"],
          ],
          colors: ["#d97706","#dc2626","#dc2626","#dc2626"]
        }
      }
    ]
  },
  {
    id: "VI",
    title: "문답으로 알아보는 선거비용 보전실무",
    color: "#0891b2",
    light: "#ecfeff",
    icon: "❓",
    summary: "실무에서 자주 묻는 질문과 명확한 답변 모음",
    sections: [
      {
        title: "현수막·간판 관련 FAQ",
        content: null,
        faq: [
          { q: "예비후보 때 현수막을 후보자 때도 쓰면?", a: "선거운동기간 비율로 일할 계산하여 보전" },
          { q: "양면 현수막을 2장으로 청구해도 되나?", a: "안 됨. 단면 1장 기준으로만 보전" },
          { q: "선거사무소 내부 현수막은?", a: "선거비용외 정치자금. 보전 불가" },
          { q: "현수막 조명시설 설치비는?", a: "선거비용외 정치자금. 보전 불가" },
          { q: "공약발표 기자회견 백드롭은?", a: "선거비용외 정치자금. 보전 불가" },
        ]
      },
      {
        title: "소품 관련 FAQ",
        content: null,
        faq: [
          { q: "선거운동용 윗옷 구입비 한도는?", a: "6만원 이내. 초과 시 위법비용으로 전액 미보전" },
          { q: "고가 캐릭터 의상은?", a: "선거 후 자산가치가 있으면 미보전" },
          { q: "자원봉사자에게 소품 제공 시?", a: "위법비용으로 미보전" },
          { q: "마스크 구입비는?", a: "기호 새겨 소품으로 써야만 보전. 방역용은 불가" },
          { q: "기호 새긴 장갑·토시는?", a: "보전 가능. 단순 방열용은 불가" },
        ]
      },
      {
        title: "차량 관련 FAQ",
        content: null,
        faq: [
          { q: "자기소유 차량 임차비를 청구할 수 있나?", a: "선거비용으로 계상은 하지만 보전은 불가" },
          { q: "차량 계약 파기 위약금은?", a: "선거비용외 정치자금. 미보전" },
          { q: "탁송비·회수비는?", a: "선거비용외 정치자금. 미보전" },
          { q: "기사 숙박비를 별도 지급하면?", a: "위법비용. 미보전" },
          { q: "연설차량 고장 시 2대 청구?", a: "1일 1대분만 보전. 철거비 추가분은 미보전" },
        ]
      },
      {
        title: "전화·인터넷 관련 FAQ",
        content: null,
        faq: [
          { q: "유튜브 영상 제작비는?", a: "인터넷 홈페이지로 분류. 미보전" },
          { q: "카카오톡 채널 유료서비스는?", a: "전자우편 전송대행에 해당. 선거운동기간분 보전" },
          { q: "자동걸기시스템 이용료는?", a: "위법비용. 미보전" },
          { q: "개인통장으로 문자비 지출 후 입금은?", a: "신고 계좌외 지출로 미보전" },
          { q: "AI 딥페이크 영상 제작비는?", a: "공직선거법 제82조의8 위반. 미보전" },
        ]
      },
      {
        title: "수당·실비 관련 FAQ",
        content: null,
        faq: [
          { q: "계좌이체 시 수당명세서 서명 생략 가능?", a: "불가. 계좌이체라도 서명·날인 필수" },
          { q: "국회의원 보좌관 선거사무장 수당?", a: "실비만 지급 가능. 수당 지급 불가" },
          { q: "율동 강사비는?", a: "선거운동 준비 행위. 선거비용외 정치자금" },
          { q: "보좌관 식사 제공 명단 미첨부 시?", a: "식사자 명단 제출 시에만 보전" },
        ]
      }
    ]
  },
  {
    id: "VII",
    title: "보전항목별 증빙자료 작성요령",
    color: "#be185d",
    light: "#fdf2f8",
    icon: "📄",
    summary: "항목별로 어떤 서류를 어떻게 첨부해야 하는지 안내",
    sections: [
      {
        title: "증빙자료 작성 3원칙",
        content: null,
        checklist: [
          "선거운동에 실제 사용됐음을 객관적으로 증명할 수 있어야 함",
          "사진은 선거운동 중인 현장 사진 (사용 물품이 사진에 보여야 함)",
          "선거기간 중 구비 (선거 후 소급 제작 불가)"
        ]
      },
      {
        title: "증빙자료 작성 유의사항",
        content: null,
        checklist: [
          "정당한 사유 없이 미제출·누락 시 해당 항목 미보전",
          "선관위 보완 요청에 불응 시 해당 항목 미보전",
          "사진·파일 멸실·훼손 시 정당한 불가 사유 입증 필요",
          "다른 방법으로 실제 사용을 증명하면 보전 가능"
        ]
      },
      {
        title: "항목별 주요 증빙 서류",
        content: null,
        table: {
          headers: ["항목", "필요 서류"],
          rows: [
            ["현수막·간판", "영수증 + 설치·사용 현장 사진"],
            ["소품 (윗옷·어깨띠)", "영수증 + 착용 현장 사진"],
            ["연설차량", "임차계약서 + 사용 현장 사진 + 유류비 영수증"],
            ["선거사무원 수당", "수당·실비 지급명세서 (서명·날인) + 계좌이체확인증"],
            ["전화요금", "전화요금 보전청구내역서 + 통신사 정산결과 통보서"],
            ["방송·신문광고", "계약서 + 광고 게재 확인서"],
            ["인쇄물", "납품확인서 + 사용 현장 사진"],
          ],
          colors: ["#be185d","#be185d","#be185d","#be185d","#be185d","#be185d","#be185d"]
        }
      }
    ]
  },
  {
    id: "VIII",
    title: "주요 일정 및 서식",
    color: "#475569",
    light: "#f8fafc",
    icon: "📅",
    summary: "9회 지방선거 주요 회계 일정 및 각종 서식 목록",
    sections: [
      {
        title: "주요 회계 일정",
        content: null,
        table: {
          headers: ["일정", "날짜", "담당"],
          rows: [
            ["선거비용제한액 공고", "2026.1.23 (기공고)", "관할 선관위"],
            ["선거일", "2026.6.3 (수)", "—"],
            ["선거운동기간", "2026.5.21~6.2 (13일간)", "—"],
            ["보전청구 마감", "2026.6.15 (월)", "후보자·정당"],
            ["회계 마감", "2026.6.23 (화)", "회계책임자"],
            ["기탁금 반환·공제명세서 송부", "2026.7.3 (금)까지", "관할 선관위"],
            ["보전비용 지급 예정", "2026.7.31 (금)", "관할 선관위"],
          ],
          colors: ["#475569","#475569","#475569","#dc2626","#475569","#475569","#16a34a"]
        }
      },
      {
        title: "각종 서식 목록",
        content: null,
        table: {
          headers: ["서식번호", "내용"],
          rows: [
            ["서식 1", "선거비용 보전청구서 (지역구·지방자치단체장용)"],
            ["서식 2", "선거비용 보전청구서 (비례대표용)"],
            ["서식 3", "선거운동용 전화요금 정산 청구서"],
            ["서식 4", "선거사무장 등 전화요금 정산 위임장"],
            ["서식 5", "전화요금 보전청구내역서"],
            ["서식 6", "선거사무관계자 수당·실비 지급명세서"],
            ["서식 7", "점자형 선거공보 등 부담비용 지급청구서"],
            ["서식 8", "후보자 반환기탁금 및 보전비용 인계·인수서"],
            ["서식 9", "반환기탁금 및 보전비용 정산서"],
          ],
          colors: ["#475569","#475569","#475569","#475569","#475569","#475569","#475569","#475569","#475569"]
        }
      },
      {
        title: "부록 자료",
        content: null,
        checklist: [
          "선거비용 및 보전항목 일람표 (p.154)",
          "통상거래가격 결정내역 (p.174)",
          "반환기탁금·보전비용 인계비용 계산프로그램 매뉴얼 (p.189)",
          "정치자금 회계관리 프로그램 수입·지출부 출력 방법 (p.195)",
          "선거사무관계자 고용·산재보험 가입 안내 (p.196)"
        ]
      }
    ]
  }
];

// ─── HANDOUT COMPONENTS ────────────────────────────────────────────────────────
function Tag({ text, color }) {
  return (
    <span style={{
      display:"inline-block", fontSize:"11px", fontWeight:"700",
      color: color, border:`1px solid ${color}`, borderRadius:"4px",
      padding:"2px 8px", letterSpacing:"0.5px"
    }}>{text}</span>
  );
}

function SectionCard({ section, chapterColor }) {
  if (section.table) {
    return (
      <div style={{ marginBottom:"24px" }}>
        <div style={{ fontSize:"15px", fontWeight:"800", color:"#1e293b", marginBottom:"12px" }}>
          {section.title}
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
            <thead>
              <tr style={{ background:chapterColor }}>
                {section.table.headers.map((h,i) => (
                  <th key={i} style={{ padding:"10px 14px", color:"white", fontWeight:"700", textAlign:"left", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, i) => (
                <tr key={i} style={{ background: i%2===0?"white":"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                  {row.map((cell, j) => (
                    <td key={j} style={{
                      padding:"10px 14px", color: j===row.length-1 ? (section.table.colors?.[i] || "#374151") : "#1e293b",
                      fontWeight: j===row.length-1 ? "700" : "600", lineHeight:1.5
                    }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section.checklist) {
    return (
      <div style={{ marginBottom:"24px" }}>
        <div style={{ fontSize:"15px", fontWeight:"800", color:"#1e293b", marginBottom:"12px" }}>
          {section.title}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {section.checklist.map((item, i) => (
            <div key={i} style={{ display:"flex", gap:"10px", alignItems:"flex-start" }}>
              <div style={{
                width:"20px", height:"20px", borderRadius:"4px",
                background:chapterColor, flexShrink:0,
                display:"flex", alignItems:"center", justifyContent:"center",
                marginTop:"1px"
              }}>
                <span style={{ color:"white", fontSize:"12px", fontWeight:"900" }}>✓</span>
              </div>
              <span style={{ fontSize:"14px", fontWeight:"600", color:"#334155", lineHeight:1.6 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.compare) {
    const { left, right } = section.compare;
    return (
      <div style={{ marginBottom:"24px" }}>
        <div style={{ fontSize:"15px", fontWeight:"800", color:"#1e293b", marginBottom:"12px" }}>{section.title}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
          {[left, right].map((side, si) => (
            <div key={si} style={{
              border:`2px solid ${side.color}22`, borderRadius:"8px",
              overflow:"hidden"
            }}>
              <div style={{ background:side.color, padding:"10px 16px" }}>
                <span style={{ color:"white", fontWeight:"800", fontSize:"14px" }}>{side.label}</span>
              </div>
              <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:"8px" }}>
                {side.items.map((item, i) => (
                  <div key={i} style={{ fontSize:"13px", fontWeight:"600", color:"#334155", display:"flex", gap:"8px", alignItems:"flex-start" }}>
                    <span style={{ color:side.color, fontWeight:"900" }}>•</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.faq) {
    return (
      <div style={{ marginBottom:"24px" }}>
        <div style={{ fontSize:"15px", fontWeight:"800", color:"#1e293b", marginBottom:"12px" }}>{section.title}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {section.faq.map((item, i) => (
            <div key={i} style={{
              border:"1px solid #e2e8f0", borderRadius:"8px", overflow:"hidden"
            }}>
              <div style={{ background:"#f1f5f9", padding:"10px 14px", display:"flex", gap:"8px" }}>
                <span style={{ color:chapterColor, fontWeight:"900", fontSize:"13px" }}>Q</span>
                <span style={{ fontSize:"13px", fontWeight:"700", color:"#1e293b" }}>{item.q}</span>
              </div>
              <div style={{ padding:"10px 14px", display:"flex", gap:"8px" }}>
                <span style={{ color:"#16a34a", fontWeight:"900", fontSize:"13px" }}>A</span>
                <span style={{ fontSize:"13px", fontWeight:"600", color:"#334155" }}>{item.a}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 텍스트
  return (
    <div style={{ marginBottom:"24px" }}>
      <div style={{ fontSize:"15px", fontWeight:"800", color:"#1e293b", marginBottom:"10px" }}>{section.title}</div>
      {section.highlight && (
        <div style={{
          display:"inline-block", background:chapterColor, color:"white",
          fontSize:"13px", fontWeight:"800", padding:"6px 14px",
          borderRadius:"6px", marginBottom:"10px"
        }}>{section.highlight}</div>
      )}
      {section.content && (
        <div style={{ fontSize:"14px", fontWeight:"600", color:"#334155", lineHeight:1.8, whiteSpace:"pre-line" }}>
          {section.content}
        </div>
      )}
    </div>
  );
}


// ─── HANDOUT SCREEN ────────────────────────────────────────────────────────────
function HandoutScreen({ onBack }) {
  const [version, setVersion] = useState("guide");   // "guide" | "episode"
  const [activeChapter, setActiveChapter] = useState(0);
  const [activeEp, setActiveEp] = useState(0);
  const chapter = CHAPTERS[activeChapter];
  const h = HANDOUTS[activeEp];
  const sc = {"보전":"#2a9d5c","위법":"rgba(220,80,80,0.9)","부분보전":"#f0a030","단면기준":"#b0b0c0"};

  return (
    <div style={{ minHeight:"100vh", fontFamily:"'Noto Sans KR', sans-serif" }}>

      {/* 공통 상단 헤더 */}
      <div style={{
        background:"white", borderBottom:"1px solid #e2e8f0",
        padding:"14px 20px", position:"sticky", top:0, zIndex:10,
        boxShadow:"0 1px 3px rgba(0,0,0,0.06)"
      }}>
        <div style={{ maxWidth:"900px", margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
            <div>
              <div style={{ fontSize:"10px", fontWeight:"700", color:"#94a3b8", letterSpacing:"2px", marginBottom:"3px" }}>
                중앙선거관리위원회 · 제9회 전국동시지방선거
              </div>
              <div style={{ fontSize:"16px", fontWeight:"900", color:"#0f172a" }}>
                선거비용 보전 핵심정리 핸드아웃
              </div>
            </div>
            <button onClick={onBack} style={{
              background:"transparent", border:"1px solid #e2e8f0", color:"#64748b",
              fontSize:"12px", fontWeight:"700", padding:"7px 14px",
              cursor:"pointer", borderRadius:"6px"
            }}>← 나가기</button>
          </div>

          {/* 버전 탭 */}
          <div style={{ display:"flex", gap:"8px" }}>
            <button onClick={() => setVersion("guide")} style={{
              padding:"8px 20px", borderRadius:"6px", cursor:"pointer", fontWeight:"800",
              fontSize:"13px", border:"none", transition:"all 0.2s",
              background: version==="guide" ? "#0f172a" : "#f1f5f9",
              color: version==="guide" ? "white" : "#64748b"
            }}>
              📘 안내서 기반 (I~VIII장)
            </button>
            <button onClick={() => setVersion("episode")} style={{
              padding:"8px 20px", borderRadius:"6px", cursor:"pointer", fontWeight:"800",
              fontSize:"13px", border:"none", transition:"all 0.2s",
              background: version==="episode" ? "#0f172a" : "#f1f5f9",
              color: version==="episode" ? "white" : "#64748b"
            }}>
              🎮 에피소드별 판단기준 (1~8화)
            </button>
          </div>
        </div>
      </div>

      {/* ── 버전1: 안내서 기반 ── */}
      {version === "guide" && (
        <div style={{ background:"#f1f5f9", minHeight:"calc(100vh - 100px)" }}>
          <div style={{ maxWidth:"900px", margin:"0 auto", padding:"20px 16px" }}>

            {/* 챕터 탭 */}
            <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"20px" }}>
              {CHAPTERS.map((ch, i) => (
                <button key={ch.id} onClick={() => setActiveChapter(i)} style={{
                  display:"flex", alignItems:"center", gap:"6px",
                  padding:"8px 14px", borderRadius:"8px", cursor:"pointer",
                  border: activeChapter===i ? `2px solid ${ch.color}` : "2px solid #e2e8f0",
                  background: activeChapter===i ? ch.color : "white",
                  color: activeChapter===i ? "white" : "#64748b",
                  fontWeight:"700", fontSize:"13px", transition:"all 0.2s", whiteSpace:"nowrap"
                }}>
                  <span>{ch.icon}</span><span>제{ch.id}장</span>
                </button>
              ))}
            </div>

            {/* 챕터 헤더 */}
            <div style={{
              background: chapter.color, borderRadius:"12px",
              padding:"24px 28px", marginBottom:"20px", color:"white"
            }}>
              <div style={{ fontSize:"12px", fontWeight:"700", opacity:0.8, marginBottom:"6px", letterSpacing:"2px" }}>
                제{chapter.id}장
              </div>
              <div style={{ fontSize:"22px", fontWeight:"900", marginBottom:"8px", lineHeight:1.3 }}>
                {chapter.title}
              </div>
              <div style={{ fontSize:"14px", fontWeight:"600", opacity:0.85 }}>{chapter.summary}</div>
            </div>

            {/* 섹션 */}
            <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
              {chapter.sections.map((section, i) => (
                <div key={i} style={{
                  background:"white", borderRadius:"10px", padding:"20px 22px",
                  borderLeft:`4px solid ${chapter.color}`, boxShadow:"0 1px 3px rgba(0,0,0,0.04)"
                }}>
                  <SectionCard section={section} chapterColor={chapter.color} />
                </div>
              ))}
            </div>

            {/* 네비게이션 */}
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:"24px", gap:"12px" }}>
              <button onClick={() => setActiveChapter(i => Math.max(0, i-1))} disabled={activeChapter===0} style={{
                flex:1, padding:"12px", borderRadius:"8px", cursor:activeChapter===0?"default":"pointer",
                border:"1px solid #e2e8f0", background:activeChapter===0?"#f8fafc":"white",
                color:activeChapter===0?"#cbd5e1":"#334155", fontWeight:"700", fontSize:"14px"
              }}>← 이전 챕터</button>
              <div style={{ display:"flex", alignItems:"center", fontSize:"13px", fontWeight:"700", color:"#64748b" }}>
                {activeChapter+1} / {CHAPTERS.length}
              </div>
              <button onClick={() => setActiveChapter(i => Math.min(CHAPTERS.length-1, i+1))} disabled={activeChapter===CHAPTERS.length-1} style={{
                flex:1, padding:"12px", borderRadius:"8px",
                cursor:activeChapter===CHAPTERS.length-1?"default":"pointer",
                border:`1px solid ${activeChapter===CHAPTERS.length-1?"#e2e8f0":chapter.color}`,
                background:activeChapter===CHAPTERS.length-1?"#f8fafc":chapter.color,
                color:activeChapter===CHAPTERS.length-1?"#cbd5e1":"white",
                fontWeight:"700", fontSize:"14px"
              }}>다음 챕터 →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 버전2: 에피소드별 판단기준 ── */}
      {version === "episode" && (
        <div style={{ background:"#080810", minHeight:"calc(100vh - 100px)", fontFamily:"'Noto Sans KR', 'Courier New', monospace" }}>
          <div style={{ maxWidth:"720px", margin:"0 auto", padding:"24px 20px" }}>

            {/* 에피소드 탭 */}
            <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"28px" }}>
              {HANDOUTS.map((hd, i) => (
                <button key={i} onClick={() => setActiveEp(i)} style={{
                  background: activeEp===i ? "#e6c619" : "transparent",
                  border: `1px solid ${activeEp===i ? "#e6c619" : "rgba(255,255,255,0.12)"}`,
                  color: activeEp===i ? "#080810" : "#9a9aaa",
                  fontSize:"11px", letterSpacing:"1px", padding:"6px 12px",
                  cursor:"pointer", fontFamily:"'Noto Sans KR', 'Courier New', monospace",
                  fontWeight:"800", transition:"all 0.15s"
                }}>
                  {hd.ep===8?"Final":`${hd.ep}화`} {hd.title}
                </button>
              ))}
            </div>

            {/* 챕터 헤더 */}
            <div style={{ marginBottom:"24px" }}>
              <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"3px", marginBottom:"8px" }}>
                {h.ep===8?"FINAL CHAPTER":`EPISODE ${String(h.ep).padStart(2,"0")}`} — {h.title}
              </div>
              <div style={{ fontSize:"20px", fontWeight:"900", color:"#f5f2ea", fontFamily:"Georgia,serif", marginBottom:"6px" }}>
                {h.theme}
              </div>
              <div style={{ fontSize:"12px", fontWeight:"700", color:"#6a6a7a" }}>📋 {h.law}</div>
            </div>

            {/* 판단기준표 */}
            <div style={{ marginBottom:"24px" }}>
              <div style={{ fontSize:"11px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"3px", marginBottom:"12px" }}>
                판단 기준표
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {h.keyRules.map((r, i) => (
                  <div key={i} style={{
                    background:"#0f0f1a", border:"1px solid rgba(255,255,255,0.07)",
                    padding:"14px 18px", display:"flex", gap:"12px", alignItems:"flex-start"
                  }}>
                    <div style={{
                      minWidth:"80px", fontSize:"11px", fontWeight:"800",
                      color: sc[r.judge]||"#b0b0c0",
                      border:`1px solid ${sc[r.judge]||"#b0b0c0"}55`,
                      padding:"3px 8px", textAlign:"center"
                    }}>{r.judge}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:"14px", fontWeight:"800", color:"#f5f2ea", marginBottom:"4px" }}>{r.rule}</div>
                      <div style={{ fontSize:"12px", fontWeight:"700", color:"#8a8a9a", lineHeight:1.6 }}>{r.memo}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 이것만 기억해 */}
            <div style={{ border:"1px solid rgba(230,198,25,0.4)", background:"rgba(230,198,25,0.04)", padding:"24px" }}>
              <div style={{ fontSize:"10px", fontWeight:"800", color:"#e6c619", letterSpacing:"4px", marginBottom:"12px" }}>
                이것만 기억해
              </div>
              <div style={{ fontSize:"15px", fontWeight:"800", color:"#f5f2ea", lineHeight:1.8 }}>{h.point}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
function VerdictScreen({ episode, judgments, onNext, isLast, nextLabel }) {
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
            <button onClick={onNext} style={{
              background:"#e6c619", border:"none",
              color:"#080810", fontSize:"13px", letterSpacing:"3px",
              padding:"14px 40px", cursor:"pointer",
              fontFamily:"'Noto Sans KR', 'Courier New', monospace",
              fontWeight:"900", transition:"all 0.3s"
            }}>
              최종 판결 수령 →            </button>
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
// ─── ENDING SCREEN ────────────────────────────────────────────────────────────
function EndingScreen({ totalCorrect, totalQuestions }) {
  const [phase, setPhase] = useState(0);
  const pct = Math.round((totalCorrect / totalQuestions) * 100);
  const rank = pct === 100 ? "강남구 사무국장" : pct >= 75 ? "서초구 사무국장" : pct >= 50 ? "마포구 사무국장" : "신림동 담당관";

  const { displayed: msg1, done: done1 } = useTypewriter("수고했다, 수사관.", 60, phase >= 1);
  const { displayed: msg2, done: done2 } = useTypewriter("김○○ 캠프의 선거비용 비리 전모가 밝혀졌다.", 40, phase >= 2);
  const { displayed: msg3, done: done3 } = useTypewriter(`총 허위청구 적발액: ${((totalQuestions - totalCorrect) * 45).toLocaleString()}만원`, 40, phase >= 3);
  const { displayed: msg4, done: done4 } = useTypewriter("중앙선거관리위원회는 특별 인사명령을 발령한다.", 40, phase >= 4);

  useEffect(() => { setTimeout(() => setPhase(1), 800); }, []);
  useEffect(() => { if (done1) setTimeout(() => setPhase(2), 600); }, [done1]);
  useEffect(() => { if (done2) setTimeout(() => setPhase(3), 500); }, [done2]);
  useEffect(() => { if (done3) setTimeout(() => setPhase(4), 600); }, [done3]);
  useEffect(() => { if (done4) setTimeout(() => setPhase(5), 800); }, [done4]);

  return (
    <div style={{
      minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'Noto Sans KR', 'Courier New', monospace", position:"relative", overflow:"hidden"
    }}>
      {/* 황금빛 glow */}
      <div style={{
        position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        width:"600px", height:"600px",
        background:"radial-gradient(ellipse, rgba(230,198,25,0.06) 0%, transparent 70%)",
        pointerEvents:"none"
      }}/>
      {/* Scanlines */}
      <div style={{
        position:"absolute", inset:0,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)",
        pointerEvents:"none"
      }}/>

      <div style={{ position:"relative", maxWidth:"640px", width:"100%", textAlign:"center" }}>

        {/* 인사명령서 */}
        {phase >= 5 && (
          <div style={{
            border:"1px solid rgba(230,198,25,0.5)",
            background:"rgba(230,198,25,0.03)",
            padding:"40px 32px", marginBottom:"40px",
            animation:"fadeInUp 0.8s ease"
          }}>
            <div style={{ fontSize:"11px", fontWeight:"800", color:"#e6c619", letterSpacing:"5px", marginBottom:"24px" }}>
              인 사 명 령 서
            </div>
            <div style={{
              width:"48px", height:"1px", background:"rgba(230,198,25,0.3)",
              margin:"0 auto 24px"
            }}/>
            <div style={{ fontSize:"14px", fontWeight:"800", color:"#9a9aaa", lineHeight:2, marginBottom:"24px" }}>
              귀 수사관의 탁월한 수사 역량과<br/>
              선거비용 회계 전문성을 높이 평가하여<br/>
              아래와 같이 특별 승진 임명한다.
            </div>

            <div style={{
              fontSize:"13px", fontWeight:"800", color:"#e6c619",
              letterSpacing:"3px", marginBottom:"8px"
            }}>
              임명직위
            </div>
            <div style={{
              fontSize: window.innerWidth < 480 ? "28px" : "40px",
              fontWeight:"900", color:"#f5f2ea",
              fontFamily:"Georgia, serif", marginBottom:"32px",
              textShadow:"0 0 40px rgba(230,198,25,0.3)"
            }}>
              {rank}
            </div>


          </div>
        )}

        {/* 타이프라이터 메시지들 */}
        <div style={{ textAlign:"left", marginBottom:"40px" }}>
          {phase >= 1 && (
            <div style={{ fontSize:"16px", fontWeight:"800", color:"#f5f2ea", lineHeight:2.2, minHeight:"28px" }}>
              {msg1}
              {phase === 1 && !done1 && <span style={{ display:"inline-block", width:"2px", height:"16px", background:"#e6c619", marginLeft:"3px", verticalAlign:"middle", animation:"blink 0.7s step-end infinite" }}/>}
            </div>
          )}
          {phase >= 2 && (
            <div style={{ fontSize:"15px", fontWeight:"700", color:"#c0c0d0", lineHeight:2.2, minHeight:"28px" }}>
              {msg2}
              {phase === 2 && !done2 && <span style={{ display:"inline-block", width:"2px", height:"14px", background:"#e6c619", marginLeft:"3px", verticalAlign:"middle", animation:"blink 0.7s step-end infinite" }}/>}
            </div>
          )}
          {phase >= 3 && (
            <div style={{ fontSize:"15px", fontWeight:"800", color:"#e6c619", lineHeight:2.2, minHeight:"28px" }}>
              {msg3}
              {phase === 3 && !done3 && <span style={{ display:"inline-block", width:"2px", height:"14px", background:"#e6c619", marginLeft:"3px", verticalAlign:"middle", animation:"blink 0.7s step-end infinite" }}/>}
            </div>
          )}
          {phase >= 4 && (
            <div style={{ fontSize:"15px", fontWeight:"700", color:"#c0c0d0", lineHeight:2.2, minHeight:"28px" }}>
              {msg4}
              {phase === 4 && !done4 && <span style={{ display:"inline-block", width:"2px", height:"14px", background:"#e6c619", marginLeft:"3px", verticalAlign:"middle", animation:"blink 0.7s step-end infinite" }}/>}
            </div>
          )}
        </div>

        {/* 처음부터 버튼 */}
        {phase >= 5 && (
          <div style={{ animation:"fadeInUp 0.8s ease 0.5s both" }}>
            <div style={{ fontSize:"13px", fontWeight:"800", color:"#6a6a7a", letterSpacing:"2px", marginBottom:"20px" }}>
              앞으로도 잘 부탁한다.
            </div>
            <button onClick={() => window.location.reload()} style={{
              background:"transparent", border:"1px solid #e6c619",
              color:"#e6c619", fontSize:"13px", letterSpacing:"4px",
              padding:"14px 48px", cursor:"pointer",
              fontFamily:"'Noto Sans KR', 'Courier New', monospace",
              fontWeight:"800", transition:"all 0.3s"
            }}
            onMouseEnter={e => { e.target.style.background="#e6c619"; e.target.style.color="#080810"; }}
            onMouseLeave={e => { e.target.style.background="transparent"; e.target.style.color="#e6c619"; }}>
              처음부터 다시
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home"); // home | chapterSelect | handout | intro | investigation | verdict | finalIntro | finalInvestigation | finalVerdict | twist | ending
  const [epIdx, setEpIdx] = useState(0);
  const [allJudgments, setAllJudgments] = useState({});
  const [finalJudgments, setFinalJudgments] = useState({});
  const [finalRevealed, setFinalRevealed] = useState({});
  const [finalHint, setFinalHint] = useState(null);

  const episode = EPISODES[epIdx];

  const handleEpComplete = (judgments) => {
    setAllJudgments(p => ({ ...p, ...judgments }));
    setScreen("verdict");
  };

  const handleNext = () => {
    if (epIdx + 1 < EPISODES.length) {
      setEpIdx(i => i + 1);
      setScreen("intro");
    } else {
      // 7화 끝 → 최종화 인트로
      setScreen("finalIntro");
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

  if (screen === "home") {
    return (
      <HomeScreen
        onStart={() => { setEpIdx(0); setScreen("intro"); }}
        onChapterSelect={() => setScreen("chapterSelect")}
        onHandout={() => setScreen("handout")}
      />
    );
  }

  if (screen === "chapterSelect") {
    return (
      <ChapterSelectScreen
        onBack={() => setScreen("home")}
        onSelect={(idx, isFinal) => {
          if (isFinal) {
            setScreen("finalIntro");
          } else {
            setEpIdx(idx);
            setEpJudgments({});
            setEpRevealed({});
            setScreen("intro");
          }
        }}
      />
    );
  }

  if (screen === "handout") {
    return <HandoutScreen onBack={() => setScreen("home")} />;
  }

  if (screen === "ending") {
    const total = EPISODES.reduce((acc, ep) => acc + ep.evidence.length, 0);
    const correct = EPISODES.reduce((acc, ep) =>
      acc + ep.evidence.filter(e => allJudgments[e.id] === e.answer).length, 0);
    return <EndingScreen totalCorrect={correct} totalQuestions={total} />;
  }

  // ─── 최종화 화면들 ───────────────────────────────────────────────────────────
  if (screen === "finalIntro") {
    return <CinematicIntro episode={FINAL_EPISODE} onStart={() => setScreen("finalInvestigation")} />;
  }

  const finalAllJudged = FINAL_EPISODE.evidence.every(e => finalJudgments[e.id] !== undefined);
  const finalAllRevealed = FINAL_EPISODE.evidence.every(e => finalRevealed[e.id]);

  if (screen === "finalVerdict") {
    return (
      <VerdictScreen
        episode={FINAL_EPISODE}
        judgments={finalJudgments}
        isLast={true}
        onNext={() => setScreen("twist")}
        nextLabel="다음 →"
      />
    );
  }

  if (screen === "twist") {
    return <TwistEndingScreen />;
  }

  if (screen === "finalInvestigation") {
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
          <div style={{ borderBottom:"1px solid rgba(180,20,20,0.5)", paddingBottom:"20px", marginBottom:"32px" }}>
            <div style={{ fontSize:"11px", fontWeight:"800", color:"rgba(220,80,80,0.9)", letterSpacing:"4px", marginBottom:"8px" }}>{FINAL_EPISODE.subtitle}</div>
            <div style={{ fontSize:"30px", fontWeight:"900", color:"#f5f2ea", fontFamily:"Georgia,serif" }}>{FINAL_EPISODE.title}</div>
            <div style={{ marginTop:"12px", fontSize:"13px", fontWeight:"800", color:"#b0b0c0" }}>
              증거 파일 {FINAL_EPISODE.evidence.length}건 — 모든 덫을 찾아내라
            </div>
          </div>
          <div style={{ display:"flex", gap:"8px", marginBottom:"32px", alignItems:"center" }}>
            <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", letterSpacing:"2px" }}>진행</span>
            {FINAL_EPISODE.evidence.map(e => (
              <div key={e.id} style={{
                width:"24px", height:"4px",
                background: finalJudgments[e.id]
                  ? (finalJudgments[e.id]===e.answer?"#2a9d5c":"rgba(220,80,80,0.8)")
                  : "rgba(255,255,255,0.1)",
                transition:"background 0.4s"
              }}/>
            ))}
            <span style={{ fontSize:"12px", fontWeight:"800", color:"#b0b0c0", marginLeft:"4px" }}>
              {Object.keys(finalJudgments).length}/{FINAL_EPISODE.evidence.length}
            </span>
          </div>
          {FINAL_EPISODE.evidence.map((ev, i) => {
            const userChoice = finalJudgments[ev.id];
            const isJudged = userChoice !== undefined;
            const isRevealed = finalRevealed[ev.id];
            const isCorrect = userChoice === ev.answer;
            const choiceLabel = {"보전":"✓ 보전","위법":"✗ 위법·미보전","부분보전":"△ 부분보전"};
            const choiceColor = {"보전":"#2a9d5c","위법":"#e6c619","부분보전":"#f0a030"};
            const borderColor = !isJudged ? "rgba(255,255,255,0.1)" : !isRevealed ? choiceColor[userChoice] : isCorrect ? "#2a9d5c" : "rgba(220,80,80,0.8)";
            return (
              <div key={ev.id} style={{
                background:"#0f0f1a", border:`1px solid ${borderColor}`,
                marginBottom:"20px", transition:"border-color 0.4s",
                animation:`slideIn 0.4s ease ${i*0.08}s both`
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
                    <span style={{ fontSize:"11px", fontWeight:"800", color:"rgba(220,80,80,0.9)", border:"1px solid rgba(220,80,80,0.4)", padding:"3px 8px", letterSpacing:"1px" }}>{ev.id}</span>
                    <span style={{ fontSize:"12px", fontWeight:"700", color:"#b0b0c0", letterSpacing:"2px" }}>{ev.type.toUpperCase()}</span>
                  </div>
                  {isJudged && <span style={{ fontSize:"12px", color:choiceColor[userChoice], letterSpacing:"2px", fontWeight:"900" }}>내 판단: {choiceLabel[userChoice]}</span>}
                </div>
                <div style={{ padding:"20px" }}>
                  <div style={{ fontSize:"17px", fontWeight:"800", color:"#f5f2ea", marginBottom:"12px", fontFamily:"Georgia,serif" }}>{ev.title}</div>
                  <div style={{ fontSize:"14px", fontWeight:"700", color:"#c0c0d0", lineHeight:1.8, whiteSpace:"pre-line", marginBottom:"16px", fontFamily:"'Noto Sans KR',sans-serif" }}>{ev.content}</div>
                  <div style={{ display:"inline-block", fontSize:"13px", color:"#f0a030", fontWeight:"800", border:"1px solid rgba(240,160,48,0.3)", padding:"4px 12px" }}>청구금액: {ev.amount}</div>
                  {!isJudged && (
                    <div style={{ display:"flex", gap:"10px", marginTop:"20px", flexWrap:"wrap" }}>
                      {["보전","부분보전","위법"].map(opt => {
                        const c = opt==="보전"?"#2a9d5c":opt==="위법"?"#e6c619":"#f0a030";
                        return (
                          <button key={opt} onClick={() => setFinalJudgments(p => ({...p,[ev.id]:opt}))} style={{
                            background:"transparent", border:`1px solid ${c}`, color:c,
                            fontSize:"12px", letterSpacing:"2px", padding:"10px 20px", cursor:"pointer",
                            fontFamily:"'Noto Sans KR','Courier New',monospace", fontWeight:"800", transition:"all 0.2s"
                          }}
                          onMouseEnter={e=>{e.target.style.background=c;e.target.style.color="#080810";}}
                          onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color=c;}}>
                            {opt==="보전"?"✓ 보전":opt==="위법"?"✗ 위법·미보전":"△ 부분보전"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {isJudged && !isRevealed && (
                    <div style={{ display:"flex", gap:"12px", marginTop:"16px", flexWrap:"wrap" }}>
                      <button onClick={() => setFinalRevealed(p => ({...p,[ev.id]:true}))} style={{
                        background:"transparent", border:"1px solid rgba(255,255,255,0.2)", color:"#d4cfbf",
                        fontSize:"11px", letterSpacing:"3px", padding:"10px 24px", cursor:"pointer",
                        fontFamily:"'Noto Sans KR','Courier New',monospace", fontWeight:"800"
                      }}>판결 확인</button>
                      <button onClick={() => setFinalHint(ev)} style={{
                        background:"transparent", border:"1px solid rgba(220,80,80,0.3)", color:"rgba(220,80,80,0.7)",
                        fontSize:"11px", letterSpacing:"2px", padding:"10px 20px", cursor:"pointer",
                        fontFamily:"'Noto Sans KR','Courier New',monospace", fontWeight:"800"
                      }}>AI 법령 분석</button>
                    </div>
                  )}
                  {isJudged && isRevealed && (
                    <div style={{
                      marginTop:"16px", padding:"16px",
                      background:isCorrect?"rgba(42,157,92,0.08)":"rgba(220,80,80,0.06)",
                      border:`1px solid ${isCorrect?"#2a9d5c":"rgba(220,80,80,0.5)"}33`,
                      animation:"fadeIn 0.4s ease"
                    }}>
                      {isCorrect
                        ? <div style={{fontSize:"15px",fontWeight:"900",color:"#3abf70",marginBottom:"10px",letterSpacing:"2px"}}>✓ 정답</div>
                        : <div style={{fontSize:"14px",fontWeight:"800",color:"#e6c619",marginBottom:"10px"}}>⚠ 오답 — 정답: {choiceLabel[ev.answer]}</div>
                      }
                      <div style={{fontSize:"14px",fontWeight:"700",color:"#dedad2",lineHeight:1.8,fontFamily:"'Noto Sans KR',sans-serif"}}>{ev.explanation}</div>
                      <div style={{marginTop:"10px",fontSize:"12px",fontWeight:"700",color:"#b0b0c0",letterSpacing:"1px"}}>📋 {ev.law}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {finalAllJudged && finalAllRevealed && (
            <div style={{textAlign:"center",marginTop:"32px",animation:"fadeIn 0.5s ease"}}>
              <button onClick={() => setScreen("finalVerdict")} style={{
                background:"rgba(180,20,20,0.8)", border:"none", color:"#f5f2ea",
                fontSize:"13px", letterSpacing:"4px", padding:"16px 56px", cursor:"pointer",
                fontFamily:"'Noto Sans KR','Courier New',monospace", fontWeight:"900"
              }}>
                최종 판결 →
              </button>
            </div>
          )}
        </div>
        {finalHint && (
          <div style={{ position:"fixed", inset:0, background:"rgba(6,6,9,0.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:"20px" }}>
            <AIHint ev={finalHint} onClose={() => setFinalHint(null)} />
          </div>
        )}
        <style>{`
          @keyframes slideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
          @keyframes fadeIn { from{opacity:0} to{opacity:1} }
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        `}</style>
      </div>
    );
  }


  if (screen === "intro") {
    return <CinematicIntro episode={episode} onStart={() => setScreen("investigation")} />;
  }

  if (screen === "verdict") {
    return (
      <VerdictScreen
        episode={episode}
        judgments={epJudgments}
        isLast={epIdx === EPISODES.length - 1}
        onNext={() => {
          setAllJudgments(p => ({ ...p, ...epJudgments }));
          handleNext();
        }}
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
