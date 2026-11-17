# 보드 구현 계획서

> 처음에 classly.kr/board에 붙여 쓰려고 세운 계획이라 classly.kr 연동 이야기가 남아 있다. 지금 이 저장소의 주소와 이름 설정은 README를 따른다.

> 작성일: 2026-11-01
> 근거: grill-me 세션에서 합의한 결정 Q1~Q99 (결정 전체 목록은 부록 A)
> 상태: 구현 완료, 실제 배포 (2026-11-02). 남은 일은 23장
> 수정: 2026-11-01 독립 저장소로 변경(8.2, 15.3, Q41), 관리자 비밀번호 저장 위치 정리(8.3, 9.1), 스킬 사용 계획 추가(22장)
> 수정: 2026-11-01 구현 전 검증 결과 반영 (결정 내용은 부록 A의 Q100~Q112)

---

## 0. 배경과 목표

### 0.1 왜 만드는가
- 연수에서 Padlet을 많이 쓰지만, **보드 개수 제한** 때문에 연수가 늘어날수록 운영이 막힌다.
- 그래서 Padlet과 같은 조작감을 가지면서 개수 제한이 없는 자체 보드를 Classly 안에 만든다.

### 0.2 핵심 목표
1. **수강생이 Padlet과 똑같이 느끼는 조작감**: 연수생이 설명 없이 바로 글을 쓰고, 파일을 올리고, 댓글을 달 수 있어야 한다.
2. **강의 흐름에 맞춘 자료 공유**: 강사가 정한 순서대로 카드가 세로로 쌓이고, 수업 진행에 맞춰 하나씩 공개된다.
3. **원격 연수 지원**: 수강생이 스크린샷이나 실시간 화면으로 자기 상황을 보여주고, 강사는 누가 보냈는지 바로 확인한다.
4. **오래 쓸 수 있는 운영 도구**: 강의 편집, 강의 복제, 과정 복제, 저장 공간 정리, 백업을 강사 혼자 쉽게 할 수 있어야 한다.
5. **무료로 운영**: Cloudflare 무료 요금제 한도 안에서 동작한다.

### 0.3 성공 기준
- 처음 들어온 수강생이 안내 없이 1분 안에 닉네임을 정하고 과제 게시물을 올릴 수 있다.
- 강사가 수업 전 10분 안에 새 강의(카드 5개, 자료 10개)를 만들 수 있다. 복제를 쓰면 2분 안에 만들 수 있다.
- 30명이 동시에 접속한 강의에서 새 게시물과 댓글이 1초 안에 모두의 화면에 나타난다.
- 스크린샷을 보내면 강사의 도움 요청함에 보낸 사람의 닉네임, 모둠, 메시지가 2초 안에 뜬다.

---

## 1. 범위

### 1.1 1차 버전에 포함 (단계 1~3)
| 영역 | 기능 |
|---|---|
| 과정 | 과정 여러 개, 과정 주소(`classly.kr/과정이름` 바로가기), 과정 복제, 과정 종료(읽기 전용) |
| 강의 | 날짜, 시작 시각, 대표 그림, 공개 여부, 시작/종료(자정 자동 종료), 공지, 강의 복제 |
| 카드 | 강사가 정한 순서의 세로 스트림, 숨김/공개, 이모지 아이콘, 과제 마감, 과제 공개 범위 |
| 게시물 | 완료. Padlet식 글쓰기 창, 여러 첨부, 링크 미리보기, YouTube 재생, 정렬, 고정 |
| 소통 | 댓글(한 단계), 좋아요, 실시간 반영, 앱 내 알림 |
| 모둠 | 모둠 칼럼 보기, 전체 보기, 닉네임과 모둠 변경 |
| 원격 지원 | 스크린샷 보내기, 1:1 실시간 화면 공유, 도움 요청함 |
| 강사 도구 | 완료. 인라인 편집, 입장 QR, 수강생으로 보기, 접속 현황, 발표 모드, 저장 공간 정리, 백업 |
| 운영 | 도배 방지, 실행 취소, 오류 로그, 미리보기 배포 |

### 1.2 1차 버전에서 제외
- Classly 계정 연동 로그인 (Q42)
- 익명 글 (Q93)
- Padlet의 그리기, 음성 녹음, GIF 검색, 별점과 투표 (Q79)
- 기존 Padlet 자료 가져오기 (Q81)
- 휴대폰 푸시 알림 (Q50)
- 강사가 모든 수강생 화면을 격자로 동시에 보기 (Q7)
- 다크 모드 (Q9)
- 원격 조작, 화면 위 그리기, 음성 (Q29)
- 입장 코드 (Q26)

---

## 2. 사용자와 권한

### 2.1 사용자
| 사용자 | 입장 방법 | 신원 |
|---|---|---|
| 강사 (1명) | `classly.kr/board/admin`에서 8자 이상 비밀번호 로그인 | HttpOnly 쿠키, 30일 유지 |
| 수강생 | 공유받은 과정 링크 + 첫 입장 때 닉네임과 모둠 입력 | 과정별 기기 신원(비밀 토큰 + 공개 ID) |

### 2.2 권한표
| 동작 | 수강생 | 강사 |
|---|---|---|
| 과정, 강의, 카드 만들기와 편집 | 불가 | 가능 |
| 자료 탭 게시물 작성 | 불가 | 가능 |
| 과제 탭 게시물 작성 | 자기 모둠 칼럼에만, 강의가 진행 중일 때 | 모든 칼럼, 언제나 |
| 게시물 수정과 삭제 | 완료. 본인 글만, 강의가 진행 중일 때 | 모든 글 |
| 댓글 작성 | 강의가 진행 중일 때 | 언제나 |
| 댓글 수정과 삭제 | 본인 댓글만, 강의가 진행 중일 때 | 모든 댓글 |
| 좋아요 | 게시물당 1번 (토글), 강의가 진행 중일 때 | 게시물당 1번, 강사 표시 |
| 게시물 고정 | 완료. 불가 | 가능 |
| 스크린샷, 화면 공유 요청 | 강의가 진행 중일 때 | 요청을 보고 처리 |
| 접속 현황 보기 | 불가 | 가능 |
| 저장 공간 정리, 백업 | 불가 | 가능 |

### 2.3 강의 상태에 따른 동작 (Q31, Q90)
| 상태 | 수강생이 보는 것 | 수강생이 할 수 있는 것 |
|---|---|---|
| 비공개 (published = false) | 보이지 않음 | 없음 |
| 시작 전 | 홈의 다가오는 강의 카드, 누르면 "곧 시작해요" 화면 | 없음 |
| 진행 중 | 공개된 카드 전부 | 글, 댓글, 좋아요, 스크린샷, 화면 공유 |
| 종료 | 읽기 전용으로 전부, "지난 강의 살펴보기"에 표시 | 보기, 내려받기만 |

- 강사가 **시작** 버튼을 누르면 진행 중, **종료** 버튼을 누르면 종료가 된다.
- 종료를 누르지 않으면 그날 자정(KST)에 자동 종료된다. 자동 종료된 강의도 강사가 다시 열 수 있다.
- 날짜가 지났는데 한 번도 시작하지 않은 공개 강의도 자정에 종료로 바꾼다. 강사는 언제든 다시 열 수 있다.
- 과정 자체를 종료하면 그 과정의 모든 강의가 읽기 전용이 된다.

---

## 3. 정보 구조

```
과정 (Course)          예: 1101연수
 ├─ 모둠 (Group)        1모둠, 2모둠 ...
 ├─ 수강생 (Participant) 과정별 신원
 ├─ 도움 요청 (HelpRequest)
 └─ 강의 (Lecture)       날짜 + 시작 시각, 대표 그림, 공지
     └─ 카드 (Card)      강사가 정한 "확인할 순서"
         ├─ 자료 탭 게시물 (Post, tab = material)   강사 작성
         └─ 과제 탭 게시물 (Post, tab = assignment) 수강생 작성, 모둠 칼럼
             ├─ 첨부 (Attachment → File)
             ├─ 댓글 (Comment)
             └─ 좋아요 (Like)
```

- 카드 순서는 차시 순서가 아니라 **수강생이 확인해야 할 순서**다 (Q12).
- 공지는 별도 카테고리가 아니라 강의 페이지 맨 위의 고정 카드다 (Q14).
- 자료와 과제는 같은 "게시물" 형태로 통일한다 (Q32).

---

## 4. 주소 체계

### 4.1 앱 주소 (Q54, Q83, Q95)
| 주소 | 화면 |
|---|---|
| `classly.kr/과정이름` | 바로가기. `classly.kr/board/과정이름`으로 이동 (Classly 쪽 처리, 15장) |
| `classly.kr/보드` | `classly.kr/board`로 이동 (Q40) |
| `/board` | 안내 화면: "강사님께 받은 연수 주소로 들어와 주세요" + Classly로 돌아가기 + 이 기기에서 들어갔던 과정 바로가기 |
| `/board/:과정` | 완료. 과정 홈: 오늘 강의, 다가오는 강의, 지난 강의 살펴보기 |
| `/board/:과정/l/:강의ID` | 완료. 강의 페이지: 공지 고정 카드 + 세로 카드 스트림 |
| `/board/:과정/l/:강의ID/c/:카드ID?tab=material` | 카드 상세 자료 탭 |
| `/board/:과정/l/:강의ID/c/:카드ID?tab=assignment` | 카드 상세 과제 탭 |
| `/board/:과정/l/:강의ID/c/:카드ID/p/:게시물ID` | 게시물 크게 보기 (링크 공유용) |
| `/board/admin` | 강사 로그인 |
| `/board/admin/home` | 완료. 관리자 홈: 과정 목록, 남은 용량 |
| `/board/admin/c/:과정` | 완료. 과정 관리: 강의 목록, 모둠, 과정 설정, 복제, 종료, 백업 |
| `/board/admin/storage` | 저장 공간 정리 |
| `/board/api/*` | API |
| `/board/ws/*` | 실시간 연결 |

- 도움 요청함은 따로 주소를 두지 않는다. 강사로 로그인하면 모든 화면에서 오른쪽 패널로 열린다 (Q34).
- `admin`, `api`, `ws`, `assets`는 과정 이름으로 쓸 수 없다.

### 4.2 과정 이름 규칙 (Q96~Q99)
- 쓸 수 있는 글자: 한글, 영문, 숫자, 하이픈. 최대 30자.
- 공백은 자동으로 하이픈으로 바꾼다.
- 영문은 대소문자를 구분하지 않는다. 저장할 때 소문자로 정규화하고, 한글은 유니코드 NFC로 정규화한다.
- Classly의 기존 첫 단계 주소(`me`, `tools`, `play`, `s`, `share`, `privacy`, `board`, `보드`, `api`, `_next`, `brand`, `shots`, `qr` 등)와 한글 별칭(`인터뷰`, `검색`, `뉴스`, `수학오락실`, `뉴로피아`, `스크리블타임`, `경남의자랑거리`)은 쓸 수 없다. 최종 목록은 구현 시 Classly 코드에서 뽑아 확정한다.
- 과정을 만들 때 입력하는 즉시 "사용할 수 있어요" 또는 "이미 쓰이는 이름이에요"를 보여준다.
- 이름을 바꿔도 옛 주소로 들어오면 새 주소로 넘겨 준다. 옛 이름은 그 과정을 삭제할 때까지 다른 과정이 쓸 수 없다.
- 나중에 Classly에 같은 이름의 페이지가 생기면 Classly 페이지가 우선한다.
- 외부인 접근 관리는 강사가 직접 한다. 주소에 무작위 글자는 붙이지 않는다 (Q82).

### 4.3 한글 주소 공유 (Q97)
- 관리자 화면의 **링크 복사** 버튼은 항상 사람이 읽을 수 있는 `classly.kr/1101연수` 형태로 복사한다.
- 입장 QR도 같은 주소로 만든다.

---

## 5. 화면 명세 (수강생)

### 5.1 첫 입장 화면 (Q51, Q84)
- 과정 링크로 처음 들어오면 화면 가운데에 카드 한 장이 뜬다.
  - 과정 이름
  - 닉네임 입력 (2~12자). 다른 과정에서 쓴 닉네임이 이 기기에 있으면 미리 채운다.
  - 모둠 선택 (강사가 모둠을 만들지 않았으면 이 칸은 없다)
  - **입장하기** 버튼
- 아바타 색은 자동으로 정한다 (8색 중 하나, 공개 ID로 결정).
- 서버가 비밀 토큰을 발급하고, 브라우저 localStorage에 과정별로 저장한다. 복구용 HttpOnly 쿠키도 함께 설정한다 (14.2).
- 저장된 토큰이 없으면 입장 카드를 띄우기 전에 복구를 먼저 시도한다. 복구되면 입장 카드 없이 그대로 들어간다.

### 5.2 과정 홈 (Q6, Q17, Q45)
**오늘 강의 영역**
- 오늘(KST) 날짜의 공개된 강의를 큰 카드로 보여준다.
- 같은 날 강의가 여러 개면 모두 큰 카드로 시작 시각 순서로 쌓고, 진행 중인 강의를 맨 위에 둔다.
- 오늘 종료된 강의는 종료 배지와 함께 오늘 강의 영역에 남고, 다음 날부터 지난 강의로 옮긴다.
- 오늘 강의가 없으면 가장 가까운 다음 공개 강의를 "다가오는 강의"로 크게 보여준다.

**큰 강의 카드 구성**
- 왼쪽: 강의 대표 그림을 연하게(불투명도 약 0.35, 오른쪽으로 갈수록 투명해지는 그라데이션 마스크) 깐다. 그림이 없으면 Classly 톤의 기본 패턴을 쓴다.
- 오른쪽: 날짜, 시작 시각, 상태 배지(진행 중, 곧 시작, 종료), 제목, 설명, **들어가기** 버튼.
- 휴대폰 세로 화면에서는 그림이 위, 내용이 아래로 바뀐다.

**지난 강의 살펴보기**
- 오늘 강의 아래에 작은 버튼으로 둔다.
- 누르면 지난 강의 카드가 0.05초 간격으로 위에서부터 차례로 펼쳐진다.
- 지난 강의 카드는 작은 썸네일, 날짜, 제목만 보여주고 최신 날짜가 위에 온다.

### 5.3 강의 페이지 (Q21, Q44, Q24)
- 모든 화면에서 **한 줄에 카드 하나**씩 세로로 쌓는다. 카드 폭은 최대 720px, 넓은 화면에서는 가운데 정렬하고 양옆은 여백이다.
- 맨 위: 강의 제목, 날짜, 상태. 그 아래 공지 고정 카드(공지가 있을 때만).
- 카드 구성:
  - 왼쪽: 이모지 아이콘
  - 가운데: 제목, 한 줄 설명
  - 오른쪽 아래: 문서 아이콘과 자료 개수, 연필 아이콘과 과제 개수 (가운뎃점 없이 간격으로 구분)
  - 마지막으로 본 뒤 새 글이 있으면 포인트 색 점
  - 과제 마감이 있으면 "오늘 17:00 마감" 같은 작은 표시
- 스크롤하면 카드가 16px 아래에서 서서히 떠오르며 나타난다.
- 강사가 숨겼던 카드를 공개하면 수강생 화면에 실시간으로 떠오르고 "새 카드가 공개됐어요" 알림이 뜬다.

### 5.4 카드 상세 (Q13, Q14)
- 카드를 누르면 App Store "투데이" 카드처럼 그 카드가 화면 가득 부드럽게 커진다. 닫으면 원래 자리로 줄어든다.
- 위쪽: 이모지, 제목, 설명, 탭 두 개(**자료**, **과제**). 과제 탭이 없는 카드(과제 게시물이 허용되지 않는 카드)는 탭 없이 자료만 보여준다.
- 상세마다 고유 주소가 있어 링크로 바로 열 수 있다.
- 휴대폰에서는 아래로 끌어내리면 닫힌다.

#### 5.4.1 자료 탭
- 강사 게시물이 강사가 정한 순서로 세로로 쌓인다.
- 맨 위에 **전체 내려받기** 버튼: 이 탭의 모든 첨부 파일을 브라우저에서 zip으로 묶어 받는다 (Q49).

#### 5.4.2 과제 탭 (Q15, Q47, Q87, Q5)
- 기본 보기: 모둠별 세로 칼럼 (Padlet 칼럼 보기).
  - 칼럼 폭 300px 고정. 넘치면 보드를 좌우로 스크롤한다.
  - 칼럼 머리(모둠 이름, 글 개수, + 버튼)는 아래로 스크롤해도 위에 붙어 있다.
  - 칼럼 머리 색은 Classly 분류 색을 차례로 돌려 쓴다 (7.1).
  - 모둠을 고르지 않은 수강생 글은 "미지정" 칼럼에 들어간다.
  - 들어오면 내 모둠 칼럼이 보이는 위치로 자동 스크롤한다.
  - 휴대폰에서는 칼럼을 좌우로 넘겨 본다 (스냅 스크롤).
- **전체 보기** 전환: 모둠 구분 없이 한 줄 스트림.
- 정렬: 최신순, 오래된 순, 좋아요 많은 순 (Q79). 고정 게시물은 정렬과 상관없이 칼럼 맨 위.
- 공개 범위가 "강사만 보기"인 카드에서는 수강생에게 자기 글만 보인다.
- 수강생은 자기 모둠 칼럼에만 글을 쓴다. 중간에 모둠을 바꿔도 이전 글은 원래 칼럼에 남는다.
- 마감이 지난 뒤 올린 글에는 "늦은 제출" 표시가 붙는다 (Q46).

### 5.5 글쓰기 창 (Padlet식, Q32, Q78, Q88)
**여는 방법**
- 화면 오른쪽 아래의 큰 동그란 **+** 버튼 (자기 모둠 칼럼에 작성)
- 모둠 칼럼 머리의 **+** 버튼
- 파일을 보드 위에 끌어다 놓으면 그 파일이 첨부된 글쓰기 창이 열린다.
- 보드에서 Ctrl+V(또는 Cmd+V)를 누르면 복사한 이미지나 링크로 글쓰기 창이 열린다.

**구성**
- 위: 제목(선택), 본문(여러 줄, 링크 자동 인식)
- 아래: 첨부 아이콘 한 줄. 파일 올리기, 링크, 이미지, 카메라(휴대폰은 카메라 앱 호출, 컴퓨터는 웹캠 촬영)
- 첨부는 여러 개 가능. 첨부마다 썸네일과 진행 막대, 삭제 버튼
- 오른쪽 위: **게시** 버튼

**안전장치**
- 창을 실수로 닫아도 쓰던 내용이 브라우저에 임시 저장되고, 다시 열면 이어 쓴다. 글은 localStorage, 첨부 파일은 IndexedDB에 둔다.
- **게시**를 누르면 작성자 화면에 카드가 바로 나타나고, 파일은 카드 안에서 진행 막대와 함께 올라간다.
- 업로드가 모두 끝나면 서버에 저장되고, 그때 다른 사람 화면에 나타난다 (Q101). 업로드 중 탭을 닫으면 게시되지 않고 임시 저장본으로 남는다.
- 업로드에 실패하면 카드에 **다시 시도** 버튼이 뜬다.
- 이미지는 올리기 전에 브라우저에서 긴 변 2560px로 줄이고, 목록에 쓸 긴 변 480px 썸네일도 함께 만든다 (Q58, Q105).
- 용량 제한을 넘는 파일은 고르는 즉시 "50MB까지 올릴 수 있어요"를 보여준다.

### 5.6 게시물 카드와 크게 보기 (Q78, Q69, Q49)
**게시물 카드**
- 맨 위: 아바타, 닉네임, 작성 시각. 강사 글은 이름 옆에 **강사** 배지 (Q62).
- 굵은 제목, 본문
- 첨부 미리보기
  - 이미지: 썸네일. 누르면 크게 보는 화면, 좌우로 넘기기
  - PDF: 첫 장 미리보기. 누르면 앱 안 뷰어
  - 동영상: 앱 안 플레이어
  - YouTube 링크: 게시물 안에서 바로 재생되는 플레이어
  - Google 문서, 슬라이드, 드라이브 링크: 서비스 아이콘이 붙은 링크 카드
  - 일반 링크: 제목, 설명, 대표 이미지가 담긴 미리보기 카드
  - 그 밖의 파일: 파일 아이콘, 이름, 크기, 다운로드 버튼
- 맨 아래: 하트와 개수, 댓글 개수
- 내 게시물 오른쪽 위: 점 세 개 메뉴(수정, 삭제). 강사에게는 고정, 삭제가 보인다.
- 고정된 게시물은 포인트 색 테두리와 고정 표시.

**크게 보기**
- 게시물을 누르면 화면 가운데에 크게 펼쳐진다. 본문, 첨부 전체, 댓글 전체가 보인다.

### 5.7 댓글 (Q48)
- 게시물에만 단다. 대댓글 없이 한 단계.
- 게시물 카드 아래 "댓글 추가" 입력칸에서 바로 쓴다. 최근 댓글 2개까지 카드 아래에 보이고, 더 있으면 "댓글 N개 더 보기".
- 강사 댓글은 연한 하늘 배경 `#EAF4FA`로 구분한다.
- 본인 댓글은 수정, 삭제 가능. 강사는 모든 댓글을 지울 수 있다.

### 5.8 좋아요 (Q36, Q38)
- 자료와 과제 게시물에만 하트 버튼을 둔다. 댓글에는 없다.
- 한 기기에서 게시물당 한 번. 다시 누르면 취소.
- 개수는 실시간으로 바뀐다. 개수를 누르면 누른 사람의 닉네임 목록이 나온다.
- 강사가 누른 게시물은 하트 옆에 작은 **강사** 표시가 붙어서 수강생이 "강사님이 봤다"는 걸 알 수 있다.

### 5.9 내 이름 칩 메뉴 (Q15, Q85)
- 오른쪽 위에 아바타와 닉네임 칩.
- 누르면: 닉네임 바꾸기, 모둠 바꾸기, **다른 사람으로 입장하기**.
- 닉네임을 바꾸면 이전에 쓴 글과 댓글에도 새 닉네임이 표시된다.
- "다른 사람으로 입장하기"를 누르면 이 브라우저의 이 과정 신원(토큰과 복구 쿠키)이 지워지고 첫 입장 화면이 다시 뜬다. 앞사람 글은 남지만 더는 수정할 수 없다.

### 5.10 앱 내 알림 (Q50)
- 앱을 열어 둔 동안에만 화면 위에 짧게 뜬다(토스트).
- 대상: 새 카드가 공개됐을 때, 강사가 내 글에 댓글을 달았을 때, 강사가 내 글에 좋아요를 눌렀을 때.

### 5.11 원격 지원 (수강생 쪽)
#### 스크린샷 보내기 (Q33, Q67)
- 강의 페이지와 카드 상세 오른쪽 아래, + 버튼 위에 작은 **도움 요청** 버튼.
- 컴퓨터: "스크린샷 보내기"를 누르면 브라우저의 화면 선택 창이 뜨고, 고른 화면을 한 장 찍는다.
- 휴대폰, 태블릿: 기기로 찍은 스크린샷을 앨범에서 고른다.
- 보내기 전 미리보기 화면에 "강사님만 볼 수 있어요. 개인 정보가 보이지 않는지 확인해 주세요"를 보여주고, 메시지를 한 줄 덧붙일 수 있다(예: "여기서 오류가 나요").

#### 실시간 화면 공유 (Q7, Q29, Q53)
- 컴퓨터에서만 **화면 보여주기** 버튼이 활성화된다. 휴대폰과 태블릿에서는 "이 기기에서는 스크린샷으로 보내 주세요" 안내.
- 누르면 "창 하나만 고르기를 권해요" 안내 뒤 브라우저 화면 선택 창이 뜬다.
- 요청은 강사 대기열에 들어간다. 수강생 화면에는 "강사님이 확인하면 연결돼요" 대기 표시.
- 강사가 보는 동안 화면 위에 "강사님이 보고 있어요" 띠(연한 하늘 배경)와 **중지** 버튼.
- 음성 없음. 강사는 보기만 한다.
- 강사가 다음 사람으로 넘어가면 공유가 자동으로 끝난다.

#### 카카오톡 앱 안 브라우저 (Q86)
- 보기, 글쓰기, 댓글, 좋아요, 사진 첨부는 카카오톡 안에서도 되게 만든다.
- 앱 안 브라우저에서 막히는 기능(화면 공유 등)을 누르면 "Chrome이나 Safari로 열기" 안내를 띄운다.
- 다른 브라우저로 옮기면 신원을 가져갈 수 없어 새 사람으로 입장하게 된다. 이 안내에 그 사실도 함께 알린다.

---

## 6. 화면 명세 (강사)

### 6.1 기기 범위 (Q80)
- 컴퓨터: 강사 기능 전체. 편집 화면은 컴퓨터에 맞춰 최적화한다.
- 휴대폰과 태블릿: 강의 시작과 종료, 도움 요청함 확인만.

### 6.2 로그인 (Q18, Q57)
- `/board/admin`. 홈 화면에는 링크하지 않는다.
- 8자 이상 비밀번호. 같은 IP에서 5번 틀리면 그 IP만 10분 잠금 (Q102). 30일 로그인 유지.

### 6.3 관리자 홈 (`/board/admin/home`)
- 과정 목록 카드: 과정 이름, 주소, 상태(진행 중, 종료), 강의 수, 마지막 강의 날짜.
- **새 과정** 버튼: 과정 이름, 주소(처음에는 이름을 따라가고 직접 고칠 수 있다. 사용 가능 여부 실시간 표시), 강사 표시 이름.
- 과정마다: 열기, 링크 복사, 복제, 종료, 삭제.
- 화면 위쪽에 R2 전체 사용량 막대(10GB 기준, 9GB에서 업로드 차단, 12.1).

### 6.4 과정 관리 (`/board/admin/c/:과정`)
- **강의 목록**: 날짜순 표. 날짜, 시작 시각, 제목, 공개 여부, 상태, 카드 수.
  - 새 강의: 날짜, 시작 시각, 제목, 설명, 대표 그림 업로드.
  - 강의마다: 편집(강의 페이지로 이동), 공개 전환, 복제(Q61), 삭제(제목 직접 입력 확인, Q64).
- **모둠**: 모둠 추가, 이름 바꾸기, 순서 바꾸기, 삭제(삭제된 모둠의 글은 "미지정"으로).
- **과정 설정**: 과정 이름, 주소(바꾸면 옛 주소는 새 주소로 넘어간다), 강사 표시 이름, 비밀번호 변경.
- **과정 복제** (Q77): 새 과정 이름을 입력하면 강의, 카드, 공지, 강사 자료, 모둠 목록을 복사. 수강생, 수강생 글, 댓글, 좋아요, 도움 요청은 복사하지 않는다. 강의 날짜는 첫 강의 날짜만 새로 고르면 간격을 유지해 옮긴다.
- **과정 종료** (Q28): 전체 읽기 전용. 데이터는 강사가 지울 때까지 보관.
- **백업** (Q73): 데이터 백업(JSON 파일 하나), 강의별 파일 백업(zip).

### 6.5 강의 페이지의 강사 모드 (Q22, Q24, Q63, Q91, Q92)
- 강사로 로그인한 상태로 강의 페이지에 들어가면 위쪽에 강사 도구 막대가 생긴다.
  - **시작** 또는 **종료** 버튼
  - "지금 24명 접속 중". 누르면 모둠별 접속자 목록
  - **입장 QR**: 과정 주소 QR을 전체 화면으로 (키보드 Esc로 닫기)
  - **수강생으로 보기** 스위치: 켜면 편집 도구와 숨긴 카드가 사라진 수강생 화면 그대로
  - **편집** 스위치
- 편집을 켜면:
  - 카드마다 끌기 손잡이. 드래그로 순서를 바꾼다.
  - 카드마다 숨김/공개 스위치, 점 세 개 메뉴(수정, 복제, 삭제).
  - 카드 사이에 마우스를 올리면 **+ 카드 추가** 버튼이 나타난다.
  - 카드 수정 창: 이모지(이모지 고르기), 제목, 한 줄 설명, 과제 탭 사용 여부, 과제 마감 시각(선택), 과제 공개 범위(전원 공개 또는 강사만 보기).
  - 공지 편집: 강의 페이지 맨 위 공지 카드에서 바로 편집 (제목, 본문, 첨부).
- 자료 게시물 작성은 수강생과 같은 글쓰기 창을 쓴다. 자료 탭에서도 게시물을 끌어서 순서를 바꿀 수 있다.
- 모든 편집은 즉시 저장된다.

### 6.6 도움 요청함 (Q34, Q29)
- 강사로 로그인하면 모든 화면 오른쪽에 접었다 펼 수 있는 패널. 접혀 있을 때는 오른쪽 가장자리에 대기 개수 배지.
- 현재 과정의 요청을 시간순으로 모은다.
  - 스크린샷: 썸네일, 닉네임, 모둠, 보낸 시각, 메시지. 누르면 크게 보기.
  - 실시간 화면 공유 대기: 닉네임, 모둠, 요청 시각, **보기** 버튼.
- 새 요청이 오면 알림음과 화면 위 짧은 알림. 알림음은 패널에서 끌 수 있다.
- 항목마다 **확인함** 버튼. 확인한 항목은 흐리게 바뀌고 아래로 내려간다.
- **보기**를 누르면 패널이 넓어지며 수강생 화면이 재생된다. 한 번에 한 명만. 다른 사람의 **보기**를 누르면 이전 공유는 자동 종료.
- 강사가 접속해 있지 않을 때 온 요청도 대기열에 남는다. 강사가 들어오면 알림음과 함께 보여준다.

### 6.7 발표 모드 (Q91, 단계 2)
- 카드 상세에서 **발표** 버튼을 누르면 그 탭의 게시물을 한 장씩 전체 화면으로 크게 보여준다.
- 키보드 좌우 화살표로 넘기고, Esc로 나간다.

### 6.8 저장 공간 (Q35, 단계 3)
- 강의별, 종류별(강사 자료, 수강생 첨부, 스크린샷) 사용량.
- 파일 목록에서 골라서 한꺼번에 삭제.
- **스크린샷만 전체 삭제** 버튼.
- 강의 복제로 함께 쓰는 파일은 마지막으로 쓰는 곳이 지워질 때 실제로 삭제된다.

### 6.9 실행 취소 (Q64)
- 게시물, 댓글, 카드를 지우면 화면 아래에 5초 동안 **실행 취소** 버튼이 뜬다.
- 강의 전체 삭제와 과정 삭제는 제목을 직접 입력해야 할 수 있다.

---

## 7. 디자인 시스템

> 2026-11-03 v2로 개편했다 (Q113~Q128). 토큰의 원본은 `src/styles/tokens.css`, 움직임 프리셋은 `src/lib/motion.ts`다. 견본 화면은 미리보기 주소의 `/board/__design`에 있다(실제 주소에서는 열리지 않음).

방향: Padlet의 보드 구조를 바탕으로, 화면과 반응은 토스와 iOS처럼 담백하고 부드럽게 만든다 (Q113~Q115).
- 연회색 바탕 위에 테두리 없는 흰 카드를 놓는다.
- 제목은 크고 굵게 쓴다.
- 버튼은 꽉 찬 알약 모양이다.
- 그림자는 아주 옅게 쓴다.

### 7.1 색 (Q116, Q117, Q123)
| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--bg` | `#F2F4F7` | 페이지 바탕 |
| `--surface` | `#FFFFFF` | 카드, 게시물, 시트 |
| `--fill` / `--fill-strong` | `#F2F4F7` / `#E6EAEF` | 입력칸 바탕, 중립 버튼, 나눔 버튼 바탕, 뼈대 화면 |
| `--border` | `#E5E9EE` | 꼭 필요한 구분선만 |
| `--text` | `#17293B` | 본문, 제목 |
| `--text-muted` | `#56687A` | 설명, 시각, 보조 글자 |
| `--text-faint` | `#8B99A8` | 입력칸 안내 글자 |
| `--accent` | `#1877C0` | 기본 버튼 바탕, 포커스, 새 글 점 |
| `--accent-ink` | `#135F99` | 포인트 색 글자와 링크 (연한 블루 바탕 위에서도 4.5:1) |
| `--accent-soft` | `#E7F1FB` | 보조 버튼, 공지 바탕, 강사 댓글 바탕, 상태 칩 |
| `--danger` / `--danger-soft` | `#C12F2F` / `#FDECEC` | 삭제, 오류, 마감, 좋아요 하트 |
| `--tile-1`~`--tile-6` | 연한 노랑, 민트, 장미, 하늘, 라벤더, 살구 | 카드 아이콘 타일, 아바타 바탕 (차례로 돌려 씀) |
| `--group-1`~`--group-4` | 진한 초록, 황토, 자주, 블루 | 모둠 칼럼 머리 글자 |
| `--group-N-soft` | 같은 계열의 연한 색 | 모둠 칼럼 머리 바탕 |

- 포인트 색은 Classly 블루(`#2E6C96`) 계열을 버튼에 쓰기 좋게 밝힌 값이다 (Q117).
- 색은 Padlet처럼 카드 아이콘 타일과 모둠 칼럼에만 쓴다. 게시물은 흰 카드다 (Q123).
- 대비 확인 결과(WCAG 4.5:1 기준 통과):
  - 흰 글자 on `#1877C0`: 4.7
  - `#135F99`: 흰 바탕 6.7, `#E7F1FB` 위 5.9
  - `#56687A`: 흰 바탕 5.8, `#F2F4F7` 위 5.2
  - `#C12F2F`: 흰 바탕 5.7, `#FDECEC` 위 5.0
  - 모둠 글자: 각 연한 바탕 위에서 5 이상
- 모둠이 5개 이상이면 모둠 색을 처음부터 다시 돌려 쓰고, 칼럼 머리에 모둠 이름을 항상 함께 표시해 색에만 의존하지 않는다.
- 다크 모드는 넣지 않는다(Q126). 색은 모두 토큰으로만 쓰므로 나중에 토큰만 바꾸면 된다.

### 7.2 글꼴과 이모지 (Q9, Q124)
- **글꼴:** Pretendard Variable(Classly와 동일)이고, jsDelivr의 dynamic subset을 쓴다.
- **크기 단계:**
  - 13: 칩, 시각
  - 14: 설명
  - 16: 본문
  - 17: 카드 제목
  - 20: 구역 제목
  - 24, 28: 화면 제목
  - 굵기는 400, 500, 600, 700이다.
- **자간과 줄 간격:** 제목은 자간 -0.025em, 줄 간격 1.3이다. 본문은 줄 간격 1.55이고, 한글 줄바꿈은 `keep-all`이다.
- **이모지:** Tossface v1.6.1을 jsDelivr로 불러온다. 쓰는 글자의 조각만 받는다(`unicode-range`). 기기마다 다른 이모지가 같은 모양으로 보인다.
  - 라이선스: 판매하지 않는 한 자유롭게 사용할 수 있다.
  - 쓰는 곳: 카드 아이콘, 빈 화면, 공지 아이콘

### 7.3 모양
- **모서리:**
  - 큰 카드 28px, 카드 24px, 게시물 20px, 입력칸 14px
  - 버튼, 칩, 탭은 알약(999px)
  - 아이콘 타일은 30%
- **그림자:**
  - 카드: `0 1px 2px rgba(23,41,59,.04), 0 6px 16px -10px rgba(23,41,59,.1)`
  - 떠 있는 것(시트, 메뉴, 글쓰기 버튼, 알림): `0 18px 44px -16px rgba(23,41,59,.28)`
- **버튼:**
  - 종류: 기본(블루), 보조(연한 블루), 중립(회색, 취소용), 위험(연한 빨강)
  - 높이: 48px, 작은 버튼 40px
  - 바쁠 때(`aria-busy`): 글자 자리에 도는 표시가 뜨고 폭은 그대로다.
- **입력칸:** 테두리 없이 연회색 바탕이다. 누르면 흰 바탕과 블루 테두리로 바뀐다.
- **간격:** 4px 단위(4, 8, 12, 16, 20, 24, 32, 48)다.
- **아이콘:** Lucide 선 아이콘이고, 선 굵기는 2px다.

### 7.4 반응형과 화면 구성 (Q10, Q21, Q125)
| 구간 | 폭 | 바깥 여백 | 비고 |
|---|---|---|---|
| 휴대폰 | 0~639px | 16px | 카드 스트림 전체 폭, 과제 칼럼은 스냅 스와이프, 창은 아래 시트 |
| 태블릿 | 640~1023px | 24px | 카드 스트림 최대 720px 가운데, 창은 가운데 창 |
| 컴퓨터 | 1024px 이상 | 32px | 도움 요청함 패널이 열리면 본문이 왼쪽으로 밀림 |

- **헤더:** 위에 붙어 있다.
  - 과정 홈: 왼쪽에 Classly 로고, 오른쪽에 이름 칩
  - 강의: 왼쪽에 뒤로 가기 버튼. 스크롤해서 큰 제목이 사라지면 작은 제목이 나타난다.
  - 위쪽 안전 영역(`safe-area-inset-top`)을 반영한다.
- **강사 도구 막대:** 화면 아래에 떠 있는 막대다(Q125).
- **컴퓨터 화면:** 지금 구조를 유지하고 새 스타일만 입힌다.
- 가로와 세로 화면을 모두 지원한다. 휴대폰 가로에서는 홈 큰 카드가 그림 왼쪽, 내용 오른쪽 배치로 돌아간다.
- 터치 대상은 최소 44px이다.

### 7.5 움직임과 제스처 (Q52, Q118~Q122)
| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--duration-press` | 0.1s | 눌림 |
| `--duration-base` | 0.22s | 색, 투명도 전환 |
| `--ease-spring` | `cubic-bezier(.34,1.4,.64,1)` | CSS로 눌림에서 돌아올 때 |

스프링 프리셋(`motion.ts`):
| 이름 | stiffness, damping | 쓰는 곳 |
|---|---|---|
| `tapSpring` | 700, 34 | 누름 |
| `spring` | 500, 38 | 탭 표시, 스위치, 목록 재배치 |
| `pageSpring` | 340, 34 | 카드가 상세로 커지고 줄어듦 |
| `sheetSpring` | 420, 40 | 시트, 알림, 도움 요청함 |
| `pushSpring` | 380, 40 | 옆에서 들어오는 화면 |

| 동작 | 효과 |
|---|---|
| 누름 | 버튼, 카드가 96~97%로 줄었다가 스프링으로 돌아옴. 컴퓨터에서 카드에 마우스를 올리면 2px 떠오름 |
| 화면 이동 (Q118) | 과정 홈에서 강의로 들어가면 오른쪽에서 밀려 들어오고, 돌아오면 왼쪽에서 들어온다. 화면마다 스크롤 위치를 기억한다 |
| 카드 상세 | 누른 카드가 화면 가득 커지고(Motion `layoutId`), 닫으면 원래 자리로 줄어든다. 휴대폰에서는 끌어내리면 닫힌다 |
| 시트 (Q121) | 휴대폰의 모든 창(글쓰기, 메뉴, 편집)은 아래에서 올라오고, 손잡이를 끌어내리면 닫힌다. 컴퓨터에서는 가운데 창이 커지며 열린다. 닫힐 때도 움직인다 |
| 메뉴 | 휴대폰은 시트, 컴퓨터는 버튼 쪽에서 커지는 팝오버 |
| 당겨서 새로고침 (Q121) | 과정 홈과 강의 맨 위에서 당기면 열린 화면의 데이터를 다시 받는다. 브라우저의 당김은 `overscroll-behavior`로 막는다 |
| 왼쪽 끝 쓸어 뒤로 (Q121) | 홈 화면 앱으로 열었을 때만 켠다 (iOS Safari 자체 제스처와 겹치므로) |
| 불러오는 동안 (Q119) | 글자 대신 실제 모양의 뼈대 화면이 은은하게 빛난다. 누르기 시작하면 다음 화면의 데이터와 화면 조각을 미리 받는다 |
| 즉시 반영 (Q120) | 좋아요, 댓글 쓰기와 고치기, 카드 추가와 수정, 고정, 공지 저장, 닉네임과 모둠 변경은 누르는 즉시 화면에 반영한다. 실패하면 되돌리고 알린다. 관리자 설정과 삭제 확인은 응답을 기다린다 |
| 좋아요 | 하트가 톡 커졌다 돌아온다. Android에서는 짧게 진동한다 (Q122) |
| 사진 크게 보기 | 손가락을 따라 옆으로 끌리고, 충분히 끌면 다음 사진으로 넘어간다 |
| 알림 | 위에서 스프링으로 내려온다. 실행 취소 버튼이 함께 뜬다 |
| 스크롤 등장 | 12px 아래에서 투명도 0 → 1 |

- 기기의 "동작 줄이기" 설정을 켠 사용자에게는 위치 이동 없이 투명도 변화만 쓰고, 진동과 뼈대 화면의 빛남도 끈다.
- 새 라이브러리 없이 이미 쓰는 Motion과 CSS로 만든다. 첫 화면 JS 기준은 gzip 250KB다 (Q127).

### 7.6 문구 규칙 (Q76)
- **가운뎃점(·)을 쓰지 않는다.** 항목 나열은 아이콘, 간격, 줄바꿈, 쉼표로 구분한다.
- 브라우저 탭 제목: `Classly 보드 | 강의 제목`. 과정 홈은 `Classly 보드 | 과정 이름`.
- 존댓말 해요체. 버튼은 동사로 짧게(게시, 입장하기, 보내기).
- 오류 문구는 무엇을 하면 되는지 함께 말한다. 예: "50MB까지 올릴 수 있어요. 더 작은 파일을 골라 주세요."

### 7.7 앱 이름과 설치 (Q66)
- 이름: **Classly 보드**. 왼쪽 위에 Classly 로고를 작게 두고 누르면 Classly 홈으로 이동 (Q42).
- 웹 앱 매니페스트와 아이콘을 넣어 휴대폰 "홈 화면에 추가" 시 앱처럼 열리게 한다. 매니페스트는 정적 파일이라 사용자별로 바꿀 수 없으므로 `start_url`은 `/board`로 고정한다. 홈 화면 앱으로 열리면(`display-mode: standalone`) 이 기기에서 마지막으로 들어간 과정으로 바로 이동한다.

---

## 8. 기술 구조

### 8.1 스택 (Q30)
| 영역 | 선택 |
|---|---|
| 화면 | React 19 + TypeScript + Vite |
| 라우팅 | React Router (라이브러리 모드), basename `/board` |
| 서버 상태 | TanStack Query |
| API | Hono (Cloudflare Workers), Hono RPC 클라이언트로 타입 공유 |
| 검증 | Zod (서버 API 입력만, 번들 크기 때문에 화면 폼은 간단한 직접 검사, Q108) |
| DB | Cloudflare D1 + Drizzle ORM + drizzle-kit 마이그레이션 |
| 파일 | Cloudflare R2 (S3 호환 presigned URL) |
| 실시간 | Durable Objects + WebSocket Hibernation API |
| 화면 공유 | WebRTC (`getDisplayMedia`) + Cloudflare TURN |
| UI | Tailwind CSS v4 + Radix 부품을 감싼 자체 부품(`components/ui`) + Lucide |
| 애니메이션 | Motion (구 Framer Motion) |
| 드래그 | dnd-kit (카드, 자료 게시물 순서) |
| 압축 | fflate (브라우저 zip) |
| QR | qrcode (브라우저 생성) |
| PDF | pdf.js (`pdfjs-dist`, 약 127KB라 필요할 때만 불러옴) |
| R2 서명 | aws4fetch (Worker에서 presigned URL 생성) |
| 빌드 연결 | `@cloudflare/vite-plugin` (화면과 Worker를 한 프로젝트로) |
| 테스트 | Vitest + `@cloudflare/vitest-plugin`, Playwright |

### 8.2 저장소와 폴더 (Q41)
독립 저장소 `cyeons/classly_board`로 두고, 저장소 루트가 곧 앱 루트다. 배포는 Classly와 따로 한다.

```
classly_board/
├─ plan.md
├─ wrangler.jsonc
├─ wrangler.preview-migrations.jsonc  미리보기 D1 마이그레이션용
├─ vite.config.ts
├─ drizzle.config.ts
├─ index.html
├─ public/                 매니페스트, 아이콘, 기본 패턴 이미지
├─ src/                    화면
│  ├─ main.tsx
│  ├─ routes/              home, course, lecture, card, post, admin/*
│  ├─ components/ui/       Radix를 감싼 부품
│  ├─ features/
│  │  ├─ entry/            첫 입장, 이름 칩
│  │  ├─ lecture/          강의 페이지, 카드 스트림, 강사 도구 막대
│  │  ├─ card/             카드 상세, 탭, 모둠 칼럼
│  │  ├─ post/             게시물 카드, 크게 보기, 첨부 미리보기
│  │  ├─ composer/         글쓰기 창, 끌어다 놓기, 붙여넣기, 임시 저장
│  │  ├─ comments/
│  │  ├─ likes/
│  │  ├─ help/             스크린샷, 화면 공유(수강생), 도움 요청함(강사)
│  │  ├─ present/          발표 모드
│  │  └─ admin/            관리자 홈, 과정 관리, 저장 공간
│  ├─ lib/
│  │  ├─ api.ts            Hono RPC 클라이언트
│  │  ├─ realtime.ts       WebSocket 연결, 재연결, 캐시 갱신
│  │  ├─ identity.ts       과정별 토큰 저장
│  │  ├─ upload.ts         presign, 업로드, 진행률
│  │  ├─ image.ts          이미지 축소, 썸네일 생성
│  │  ├─ seen.ts           카드별 마지막 본 시각 (localStorage)
│  │  └─ motion.ts         애니메이션 프리셋
│  └─ styles/tokens.css    7장 디자인 토큰
├─ worker/                 서버
│  ├─ index.ts             Hono 앱, fetch, scheduled 진입점
│  ├─ routes/              public, participant, admin, uploads, help, shortlink
│  ├─ db/schema.ts
│  ├─ db/migrations/
│  ├─ durable/LectureRoom.ts
│  ├─ durable/HelpDesk.ts
│  ├─ lib/                 auth, token, r2, ratelimit, slug, linkpreview, broadcast
│  └─ cron.ts              자정 자동 종료, 삭제 정리
├─ test/                   Workers 환경 자동 테스트
└─ e2e/                    Playwright
```

### 8.3 Cloudflare 리소스와 바인딩
| 바인딩 | 종류 | 미리보기 | 실제 |
|---|---|---|---|
| `DB` | D1 | `board-preview` | `board-prod` |
| `FILES` | R2 | `board-files-preview` | `board-files-prod` |
| `LECTURE_ROOM` | Durable Object | LectureRoom 클래스 | 동일 |
| `HELP_DESK` | Durable Object | HelpDesk 클래스 | 동일 |
| `ASSETS` | 정적 파일 | Vite 빌드 결과 | 동일 |

비밀 설정 (`wrangler secret`):
- `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT` (첫 로그인용 초기값. 비밀번호를 바꾸면 이후로는 D1 `admin_state` 값을 쓴다, 14.1)
- `SESSION_SECRET` (강사 쿠키와 실시간 연결 티켓 서명)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` (presigned URL용)
- `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`

wrangler 설정 요점:
- `assets.base_path`는 이 계정에서 켜져 있지 않아(code 100343) 쓰지 않는다. 대신 빌드 뒤 `scripts/nest-assets.mjs`가 화면 파일을 `dist/client/board/`로 옮긴다.
- `assets.not_found_handling = "single-page-application"`
- `assets.run_worker_first = ["/board/api/*", "/board/ws/*"]`
- 실제 환경 경로: `classly.kr/board/*` 하나만 등록한다. 끝 슬래시 없는 `/board`는 Classly가 `/board/`로 넘긴다 (15.2, Q112).
- Cron Trigger: `0 15 * * *` (UTC 15:00 = KST 자정, 자동 종료), `0 * * * *` (매시 정각, 삭제 정리)
- `migrations`는 `new_sqlite_classes`로 선언한다. 무료 요금제는 SQLite 기반 Durable Object만 쓸 수 있다.
- `previews` 블록에 D1, R2, Durable Object 바인딩을 모두 적는다. 빠뜨리면 미리보기에서 1101 오류가 날 수 있다.
- D1과 R2는 만들 때 `apac` 위치를 지정한다.
- `observability.enabled = true` (Workers Logs)

---

## 9. 데이터 모델 (D1)

모든 ID는 ULID 문자열. 시각은 UTC 밀리초 정수. 날짜와 시각 입력은 KST 기준으로 받고 저장할 때 변환한다. 삭제는 `deleted_at` 소프트 삭제 후 Cron에서 정리한다.

### 9.1 표
**courses**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| slug | text unique | 정규화된 과정 이름 |
| title | text | 표시용 과정 이름 |
| instructor_name | text | 강사 표시 이름 |
| status | text | `active`, `ended` |
| created_at, ended_at, deleted_at | int | |

**course_slugs** (이름 변경 이력, Q98)
| 열 | 형 | 비고 |
|---|---|---|
| slug | text PK | 옛 이름 포함 |
| course_id | text | |
| is_current | int | |

**groups**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| course_id | text | |
| name | text | |
| position | int | |
| color_index | int | 7.1 모둠 색 |

**participants**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | 내부 ID, 외부에 노출하지 않음 |
| course_id | text | |
| public_id | text unique | 화면과 실시간 메시지에 쓰는 ID |
| token_hash | text | 비밀 토큰의 SHA-256 |
| nickname | text | 2~12자 |
| group_id | text null | |
| avatar_color | int | |
| created_at, last_seen_at, revoked_at | int | "다른 사람으로 입장" 시 revoked_at 기록 |

**lectures**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| course_id | text | |
| date | text | `YYYY-MM-DD` (KST) |
| start_time | text | `HH:mm` (KST) |
| title, description | text | |
| cover_file_id | text null | |
| published | int | 0이면 수강생에게 안 보임 |
| status | text | `before`, `open`, `closed` |
| opened_at, closed_at | int | |
| auto_closed | int | 자정 자동 종료 여부 |
| notice_post_id | text null | 공지 게시물 |
| created_at, updated_at, deleted_at | int | |

**cards**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| lecture_id | text | |
| sort_key | text | 분수 인덱스 문자열 (드래그 시 해당 카드만 갱신) |
| emoji | text | |
| title, summary | text | |
| visible | int | 숨김/공개 |
| has_assignment | int | 과제 탭 사용 여부 |
| assignment_due_at | int null | |
| assignment_visibility | text | `public`, `instructor_only` |
| created_at, updated_at, deleted_at | int | |

**posts**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| card_id | text null | 공지 게시물은 null |
| lecture_id | text | 조회 편의 |
| tab | text | `material`, `assignment`, `notice` |
| author_type | text | `instructor`, `participant` |
| participant_id | text null | |
| group_id | text null | 작성 당시 모둠 (모둠을 바꿔도 칼럼 유지) |
| title, body | text | 본문은 평문, 링크는 화면에서 자동 링크 |
| sort_key | text null | 자료 탭 순서 |
| pinned_at | int null | 고정 |
| is_late | int | 마감 뒤 작성 |
| like_count, comment_count | int | 비정규화 카운터 |
| instructor_liked | int | |
| created_at, updated_at, deleted_at | int | |

**files**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| course_id | text | |
| r2_key | text | `courses/{courseId}/{yyyy}/{mm}/{fileId}` |
| filename | text | 원래 이름 |
| mime | text | |
| size | int | |
| width, height | int null | 이미지 |
| thumb_r2_key, thumb_size | text null, int null | 긴 변 480px 썸네일 (이미지, PDF 첫 장) |
| category | text | `material`, `student`, `screenshot`, `cover` |
| uploader_type, uploader_id | text | |
| status | text | `pending`, `ready` |
| created_at, deleted_at | int | |

**attachments**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| post_id | text | |
| kind | text | `image`, `video`, `pdf`, `file`, `link` |
| file_id | text null | 파일 첨부. 강의 복제 시 같은 file_id 공유 |
| url | text null | 링크 첨부 |
| link_title, link_description, link_image, link_site | text null | 링크 미리보기 |
| link_provider | text null | `youtube`, `google_docs`, `google_slides`, `google_drive`, `generic` |
| position | int | |

**comments**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| post_id | text | |
| author_type | text | |
| participant_id | text null | |
| body | text | 최대 1000자 |
| created_at, updated_at, deleted_at | int | |

**likes**
| 열 | 형 | 비고 |
|---|---|---|
| post_id | text | PK 1 |
| liker_key | text | PK 2. `instructor` 또는 participant_id |
| is_instructor | int | |
| created_at | int | |

**help_requests**
| 열 | 형 | 비고 |
|---|---|---|
| id | text PK | |
| course_id, lecture_id | text | |
| participant_id | text | |
| kind | text | `screenshot`, `live` |
| message | text null | |
| file_id | text null | 스크린샷 |
| status | text | `waiting`, `viewing`, `done` |
| created_at, handled_at | int | |

**admin_state** (한 줄)
| 열 | 형 | 비고 |
|---|---|---|
| id | int PK | 항상 1 |
| session_version | int | 비밀번호 변경 시 증가, 모든 세션 무효화 |
| password_hash, password_salt | text null | 관리 화면에서 바꾼 비밀번호. null이면 비밀 설정의 초기값을 쓴다 |

**login_attempts** (로그인 잠금, Q102)
| 열 | 형 | 비고 |
|---|---|---|
| ip_hash | text PK | IP의 SHA-256 |
| failed_count | int | |
| locked_until | int | |
| updated_at | int | 하루 지난 줄은 Cron에서 삭제 |

브라우저 오류는 표에 저장하지 않고 Workers Logs에 남긴다 (19.3).

### 9.2 인덱스
- `lectures(course_id, date)`
- `cards(lecture_id, sort_key)`
- `posts(card_id, tab, created_at)`, `posts(card_id, group_id)`
- `comments(post_id, created_at)`
- `help_requests(course_id, status, created_at)`
- `files(course_id, category)`
- `attachments(file_id)` (파일 참조 확인용)
- `posts(participant_id, created_at)`, `comments(participant_id, created_at)`, `help_requests(participant_id, created_at)`, `files(uploader_id, created_at)` (도배 방지 개수 조회용, 14.3)

### 9.3 규칙
- 카운터(like_count, comment_count)는 같은 트랜잭션(D1 batch)에서 갱신한다.
- 삭제 정리는 Cron이 다음 순서로 한다.
  1. 소프트 삭제 후 24시간이 지난 게시물, 댓글, 카드, 강의, 과정을 완전히 지운다. 게시물의 attachments도 함께 지운다.
  2. attachments, lectures.cover_file_id, help_requests 어디서도 참조하지 않게 된 files에 `deleted_at`을 기록한다.
  3. `deleted_at`이 지난 지 24시간 넘은 files 중 그때도 참조가 없는 것만 R2에서 원본과 썸네일을 지운다.
- 저장 공간 화면에서 파일을 지우면 그 파일의 참조를 먼저 끊고 같은 정리 순서를 탄다.
- Cron에도 CPU 10ms 제한이 있으므로 한 번에 정해진 개수만 처리하고, 남은 것은 다음 실행으로 넘긴다.
- `pending` 상태로 24시간이 지난 files는 업로드 실패로 보고 정리한다.

---

## 10. API 명세

모두 `/board/api` 아래. 수강생 요청은 `Authorization: Bearer <참가자 토큰>`. 강사 요청은 서명된 HttpOnly 쿠키. 응답은 JSON. 입력은 Zod로 검증.

### 10.1 공개, 수강생
| 메서드와 경로 | 설명 | 권한 |
|---|---|---|
| `GET /courses/:slug` | 과정 정보, 모둠 목록, 공개된 강의 요약. 옛 이름이면 `{redirectTo}` | 누구나 |
| `POST /courses/:slug/join` | `{nickname, groupId}` → `{token, participant}`. 복구 쿠키 설정 | 누구나 |
| `POST /courses/:slug/restore` | 복구 쿠키를 확인해 `{token, participant}` 반환. 없거나 폐기됐으면 404 | 복구 쿠키가 있는 브라우저 |
| `GET /me?course=` | 내 정보 | 수강생 |
| `PATCH /me` | 닉네임, 모둠 변경 | 수강생 |
| `POST /me/leave` | 다른 사람으로 입장 (토큰 폐기, 복구 쿠키 삭제) | 수강생 |
| `GET /lectures/:id` | 강의, 공지, 보이는 카드 목록(개수, 마지막 글 시각 포함). 시작 전이면 제목과 일정만 | 보기 규칙 (10.3) |
| `GET /cards/:id/posts?tab=&sort=` | 게시물, 첨부, 최근 댓글 2개, 좋아요 여부 | 보기 규칙 |
| `POST /cards/:id/posts` | 게시물 작성 `{tab, title, body, attachments[], groupId?}`. `groupId`는 강사만 보내고, 수강생은 서버가 자기 모둠으로 정한다 | 수강생(과제), 강사 |
| `PATCH /posts/:id` | 수정 | 작성자, 강사 |
| `DELETE /posts/:id` | 소프트 삭제 | 작성자, 강사 |
| `POST /posts/:id/restore` | 실행 취소 (삭제 후 10초 안) | 작성자, 강사 |
| `GET /posts/:id` | 게시물 하나 (크게 보기) | 보기 규칙 |
| `GET /posts/:id/comments` | 댓글 전체 | 보기 규칙 |
| `POST /posts/:id/comments` | 댓글 작성 | 수강생, 강사 |
| `PATCH /comments/:id`, `DELETE /comments/:id`, `POST /comments/:id/restore` | | 작성자, 강사 |
| `PUT /posts/:id/like`, `DELETE /posts/:id/like` | 좋아요 토글 | 수강생, 강사 |
| `GET /posts/:id/likes` | 누른 사람 닉네임 목록 | 보기 규칙 |
| `POST /uploads` | `{filename, mime, size, category, thumbSize?}` → `{fileId, uploadUrl, thumbUploadUrl?, headers}`. 강사 전용 분류는 강사만 쓸 수 있다 | 수강생, 강사 |
| `POST /uploads/:fileId/complete` | 업로드 확인 (R2 HEAD로 크기 검증, 초과하면 즉시 삭제 후 거절) | 올린 사람 |
| `POST /files/urls` | `{items: [{fileId, variant}]}` 최대 50개 → 1시간짜리 presigned GET 주소 묶음. `variant`는 `thumb`, `inline`, `download` | 보기 규칙 (스크린샷은 강사만) |
| `POST /link-preview` | `{url}` → 미리보기 정보 | 수강생, 강사 |
| `POST /help/screenshot` | `{lectureId, fileId, message}` | 수강생 |
| `POST /help/live` | 실시간 공유 요청 등록 | 수강생 |
| `DELETE /help/live/:id` | 요청 취소 | 수강생 |
| `POST /ws-ticket` | `{kind, id}` → 60초짜리 실시간 연결 티켓 (11장) | 수강생, 강사 |
| `GET /turn-credentials` | 2시간짜리 TURN 자격 증명 | 수강생, 강사 |
| `POST /client-errors` | 브라우저 오류 보고 | 누구나 (도배 방지 적용) |
| `GET /shortlink/:slug` | Classly 바로가기용. 과정이 있으면 `{path: "/board/1101연수"}`, 없으면 404. `Cache-Control: max-age=60` | 누구나 (Classly 404 페이지가 호출, 15.2) |

### 10.2 강사
| 메서드와 경로 | 설명 |
|---|---|
| `POST /admin/login`, `POST /admin/logout` | 로그인, 로그아웃 |
| `GET /admin/me` | 강사 로그인 여부 (HttpOnly 쿠키는 화면에서 읽을 수 없다) |
| `POST /admin/password` | 비밀번호 변경 (D1에 해시 저장, 14.1) |
| `GET /admin/courses`, `POST /admin/courses` | 과정 목록, 생성 |
| `GET /admin/slug-check?slug=` | 과정 이름 사용 가능 여부 |
| `GET /admin/courses/:id` | 과정 상세 (비공개 포함 강의 목록, 모둠) |
| `PATCH /admin/courses/:id`, `DELETE /admin/courses/:id` | 과정 수정, 삭제 |
| `POST /admin/courses/:id/duplicate` | 과정 복제 `{slug, title, firstDate}` |
| `POST /admin/courses/:id/end`, `POST /admin/courses/:id/reopen` | 완료. 과정 종료, 재개 |
| `GET /admin/courses/:id/export?cursor=` | 데이터 백업. 나눠서 받아 브라우저에서 JSON 파일 하나로 조립한다 (CPU 10ms 제한) |
| `GET /admin/lectures/:id/files` | 강의별 파일 목록 (브라우저 zip 백업용) |
| `POST /admin/courses/:id/groups`, `PATCH /admin/groups/:id`, `DELETE /admin/groups/:id` | 모둠 |
| `POST /admin/courses/:id/lectures`, `PATCH /admin/lectures/:id`, `DELETE /admin/lectures/:id` | 강의 |
| `POST /admin/lectures/:id/open`, `POST /admin/lectures/:id/close` | 시작, 종료 |
| `POST /admin/lectures/:id/duplicate` | 강의 복제 `{date, startTime}` |
| `POST /admin/lectures/:id/cards`, `PATCH /admin/cards/:id`, `DELETE /admin/cards/:id`, `POST /admin/cards/:id/restore` | 카드, 실행 취소 |
| `PUT /admin/lectures/:id/notice`, `DELETE /admin/lectures/:id/notice` | 공지 작성과 수정, 삭제 |
| `PATCH /admin/cards/:id/move` | `{before, after}` → 새 sort_key |
| `PATCH /admin/posts/:id/move` | 자료 게시물 순서 |
| `PUT /admin/posts/:id/pin`, `DELETE /admin/posts/:id/pin` | 고정 |
| `GET /admin/lectures/:id/presence` | 모둠별 접속자 |
| `GET /admin/courses/:id/help` | 도움 요청 목록 |
| `PATCH /admin/help/:id` | 상태 변경 (`viewing`, `done`) |
| `POST /admin/help/:id/request-screenshot` | 화면 공유 실패 시 수강생에게 스크린샷 요청 알림 (13.2) |
| `GET /admin/storage` | 사용량 (강의별, 종류별) |
| `POST /admin/storage/delete` | `{fileIds[]}` 일괄 삭제 |
| `POST /admin/storage/delete-screenshots` | 스크린샷 전체 삭제 `{courseId?}` |

### 10.3 공통 규칙
- 쓰기 요청은 먼저 강의 상태와 과정 상태를 확인한다. 종료된 강의에 수강생이 쓰면 `423 Locked`와 안내 문구.
- 쓰기가 성공하면 D1에 저장한 뒤 해당 LectureRoom에 변경 이벤트를 보낸다 (11장).
- 오류 응답 형식: `{error: {code, message}}`. `message`는 화면에 그대로 띄울 수 있는 한국어 문장.
- **보기 규칙**: 강사가 아니면 다음을 모두 만족할 때만 내용을 돌려준다. 게시물, 댓글, 좋아요, 파일을 하나씩 조회할 때도 똑같이 적용한다.
  - 과정과 강의가 삭제되지 않았고, 강의가 공개 상태다.
  - 강의가 시작 전이 아니다.
  - 카드가 숨김이 아니다.
  - `instructor_only` 카드의 과제 글은 작성자 본인만 볼 수 있다.
- **파일 소유권**: 게시물과 도움 요청에는 요청한 사람이 올린 `ready` 파일만 연결할 수 있다.
- **입력 제한**: 제목 100자, 본문 5000자, 댓글 1000자, 도움 요청 메시지 200자, 글당 첨부 10개. 링크는 `http`와 `https`만 받는다.

---

## 11. 실시간 구조 (Q19, Q59)

### 11.1 원칙
- 데이터의 원본은 항상 D1이다. Durable Object는 방송만 한다.
- 연결이 끊겼다 다시 붙으면 클라이언트는 열려 있는 화면의 쿼리를 모두 무효화해 서버 데이터로 다시 맞춘다. 놓친 이벤트를 따로 재전송하지 않는다.
- WebSocket Hibernation API를 써서 연결이 쉬는 동안 과금되지 않게 한다. 연결별 정보(역할, 공개 ID, 모둠)는 `serializeAttachment`로 보존한다.

### 11.2 LectureRoom (강의마다 하나)
- 연결: `POST /ws-ticket`으로 받은 60초짜리 티켓으로 `GET /board/ws/lecture/:lectureId?ticket=`에 붙는다 (브라우저 WebSocket은 헤더를 보낼 수 없고, 비밀 토큰을 주소에 넣지 않는다).
- 연결할 때 `Origin`과 보기 규칙을 확인한다. 비공개 강의와 시작 전 강의는 강사만 연결할 수 있다.
- 서버 → 클라이언트 이벤트:

| 이벤트 | 내용 | 받는 사람 |
|---|---|---|
| `lecture.status` | 시작, 종료 | 모두 |
| `notice.update` | 공지 변경 | 모두 |
| `card.upsert` | 카드 추가, 수정, 공개 | 모두 (숨김 카드는 강사만) |
| `card.remove` | 카드 삭제, 숨김 | 모두 |
| `card.move` | 순서 변경 | 모두 |
| `post.upsert` | 게시물 추가, 수정, 고정 | 보기 규칙에 맞는 사람 |
| `post.remove` | 게시물 삭제 | 모두 |
| `comment.upsert`, `comment.remove` | 댓글 | 그 게시물의 보기 규칙에 맞는 사람 |
| `like.update` | `{postId, count, instructorLiked}` | 그 게시물의 보기 규칙에 맞는 사람 |
| `participant.update` | 닉네임, 모둠 변경 | 모두 |
| `notify` | 개인 알림 (강사 댓글, 강사 좋아요) | 해당 수강생 |
| `presence` | 접속자 수와 목록 | 강사만 |

- `instructor_only` 카드의 과제 게시물과 그 댓글, 좋아요 이벤트는 강사와 작성자에게만 보낸다. 숨긴 카드의 이벤트는 강사에게만 보낸다.
- 접속 현황은 `getWebSockets()`와 `deserializeAttachment()`로 계산한다. Hibernation에서 메모리가 사라지므로 메모리 변수에 두지 않고, DB에도 쓰지 않는다.

### 11.3 HelpDesk (과정마다 하나)
- 연결: `POST /ws-ticket`으로 받은 티켓으로 `GET /board/ws/help/:courseId?ticket=`에 붙는다. 연결할 때 `Origin`을 확인한다.
- 수강생은 자기 요청에 관한 이벤트만 받고, `rtc.*` 신호는 그 공유의 당사자 두 명에게만 전달한다.
- 수강생 연결이 끊기면 그 수강생의 대기 중인 `live` 요청을 `done`으로 바꾼다. 스크린샷 요청은 그대로 남긴다.
- 이벤트: `help.new`, `help.update`, 그리고 화면 공유 신호 `rtc.offer`, `rtc.answer`, `rtc.ice`, `rtc.start`, `rtc.end`.
- 강사 접속 여부를 기억해 두고, 강사가 들어오면 대기 중 요청을 한꺼번에 보낸다.

### 11.4 클라이언트
- `realtime.ts`가 화면별로 필요한 방에 연결하고, 이벤트를 받으면 TanStack Query 캐시를 직접 갱신한다.
- 재연결: 1초, 2초, 4초 ... 최대 30초 간격. 재연결되면 쿼리 무효화.
- 탭이 백그라운드로 가면 연결을 유지하되, 5분 넘게 숨겨져 있으면 끊고 돌아왔을 때 다시 연결한다.

---

## 12. 파일 처리 (Q16, Q27, Q49, Q58, Q69)

### 12.1 용량 제한
| 올리는 사람 | 파일당 최대 |
|---|---|
| 강사 | 100MB |
| 수강생 | 50MB |
| 스크린샷 | 10MB (축소 후) |

- 전체 R2 무료 한도는 10GB. 관리자 홈에 사용량 막대.
- 문서에는 10GB를 넘을 때 자동 차단이 없고 초과분 과금만 나온다. 그래서 서버가 직접 막는다. `POST /uploads`는 files의 크기 합계(`pending` 포함)가 9GB를 넘으면 "저장 공간이 가득 찼어요. 강사님께 알려 주세요"로 거절한다 (Q104).

### 12.2 업로드 흐름
1. 브라우저가 이미지면 긴 변 2560px로 줄인다 (HEIC는 가능하면 JPEG로 변환, 실패하면 원본 그대로). 이미지와 PDF 첫 장은 긴 변 480px 썸네일도 만든다. 실패하면 썸네일 없이 파일 아이콘으로 보여준다.
2. `POST /uploads`로 크기, 종류, 강의 상태, 전체 사용량을 확인받고 `fileId`와 presigned PUT 주소를 받는다 (유효 10분). 서명에 `Content-Type`을 포함한다.
3. 브라우저가 R2에 직접 PUT한다. 진행률을 표시한다.
4. `POST /uploads/:fileId/complete`로 서버가 R2 HEAD로 실제 크기를 확인하고 `ready`로 바꾼다. 신고한 크기나 한도를 넘으면 R2에서 즉시 지우고 거절한다.
5. 모든 첨부가 `ready`가 되면 `POST /cards/:id/posts`로 게시물을 저장한다. 요청한 사람이 올린 `ready` 파일만 첨부로 연결한다. 이 저장이 끝나야 다른 사람에게 방송된다.

- R2 버킷에 CORS 설정: 허용 출처 `https://classly.kr`, 미리보기 주소, 로컬 개발 주소. 메서드 PUT, GET, HEAD.
- Workers를 거치지 않고 R2로 바로 올리기 때문에 큰 파일도 Worker 요청 크기와 CPU 제한에 걸리지 않는다.

### 12.3 내려받기
- 화면이 보이는 첨부를 모아 `POST /files/urls`로 1시간짜리 presigned GET 주소를 묶어서 받는다. `<img>`는 인증 헤더를 보낼 수 없고, 파일마다 Worker를 거치면 일일 요청 한도를 빠르게 쓰기 때문이다.
- 내려받기 주소에는 `response-content-disposition`에 원래 파일 이름(UTF-8 인코딩)을 넣는다.
- 목록에는 썸네일만 쓰고, 크게 볼 때 원본을 받는다. 화면에서 같은 파일 주소는 50분 동안 재사용한다.
- 한 번에 서명할 수 있는 개수는 1-A에서 CPU를 측정해 확정한다 (시작값 50개).

### 12.4 전체 내려받기
- 자료 탭의 첨부 목록을 받아 브라우저에서 하나씩 내려받고 fflate로 zip을 만든다 (스트리밍 방식으로 메모리 사용을 줄인다).
- 총 용량이 500MB를 넘으면 "파일이 많아서 강의별 백업이나 개별 다운로드를 권해요" 안내.

### 12.5 링크 미리보기
- 게시할 때 `POST /link-preview`가 Worker에서 해당 주소를 가져와 HTMLRewriter로 `og:title`, `og:description`, `og:image`, `<title>`만 읽는다. 결과는 attachments에 저장한다.
- 가져오기 제한: `http`와 `https`만, 3초 시간 제한, HTML 앞 512KB만 읽기, 내부 주소와 사설 IP 차단.
- YouTube(`youtube.com/watch`, `youtu.be`, `youtube.com/shorts`)는 영상 ID를 뽑아 `youtube-nocookie.com` 임베드로 보여준다.
- Google 문서, 슬라이드, 드라이브는 주소 패턴으로 구분해 서비스 아이콘을 붙인다.

---

## 13. 화면 공유 (WebRTC, 단계 2)

### 13.1 연결 순서
1. 수강생이 **화면 보여주기** → `getDisplayMedia({video: {frameRate: 15}, audio: false})`로 화면을 고른다.
2. `POST /help/live`로 대기열 등록. HelpDesk가 강사에게 `help.new`.
3. 강사가 **보기** → HelpDesk가 수강생에게 `rtc.start`.
4. 수강생 브라우저가 `RTCPeerConnection`을 만들고 offer를 보낸다. 강사가 answer. ICE 후보를 HelpDesk로 주고받는다.
5. ICE 서버: `GET /turn-credentials`로 받은 Cloudflare TURN 자격 증명 (수명 2시간). 사용 중 만료되면 연결이 끊기므로 가장 긴 공유 시간보다 길게 잡는다 (Q107).
6. 강사가 다른 사람을 보거나 **확인함**을 누르면 `rtc.end`. 수강생이 **중지**를 눌러도 `rtc.end`.

### 13.2 품질
- 해상도는 원본 유지, 프레임 15fps, 비트레이트 상한 1.5Mbps. 글자가 읽히는 것이 우선이므로 `contentHint = "text"`.
- 연결 실패 시 강사 화면에 "연결이 안 돼요. 스크린샷을 요청해 보세요"와 **스크린샷 요청** 버튼(수강생에게 알림).

### 13.3 기기 지원
- 화면 공유 보내기: Chrome, Edge, Firefox, Safari (컴퓨터). 휴대폰과 태블릿 브라우저는 지원하지 않으므로 스크린샷으로 안내.
- 화면 공유 보기: 강사 컴퓨터.

---

## 14. 인증과 보안

### 14.1 강사 (Q18, Q57)
- 비밀번호는 원문을 저장하지 않는다. PBKDF2-SHA256 해시와 솔트만 저장한다. 초기값은 Workers 비밀 설정에, 변경한 값은 D1 `admin_state`에 둔다.
- 무료 요금제의 요청당 CPU 10ms 제한 때문에 PBKDF2 반복 횟수는 실제 측정으로 정한다(목표: 로그인 1회 CPU 8ms 이하). 반복 횟수가 낮아지는 만큼 잠금 정책(같은 IP 5번 실패 시 그 IP만 10분)으로 대입 공격을 막는다. 잠금이 전역이면 아무나 5번 틀려서 강사의 로그인을 막을 수 있으므로 IP별로 둔다 (Q102). 로컬 측정으로는 8ms가 약 2만 회이므로 1-A에서 실측한다.
- 비밀번호 변경: 관리자 화면에서 새 비밀번호를 받으면 서버가 해시를 만들어 D1 `admin_state`에 저장한다. 바로 적용되며 `wrangler secret put`은 필요 없다.
- 로그인 성공 시 `SESSION_SECRET`으로 서명한 쿠키 발급: `HttpOnly; Secure; SameSite=Lax; Path=/board; Max-Age=2592000`. 쿠키 안에 `session_version`을 넣어, 비밀번호를 바꾸면 모든 기기 로그인이 풀린다.
- 강사 쓰기 요청은 `Origin` 헤더를 확인해 다른 사이트에서 보낸 요청을 막는다.

### 14.2 수강생 (Q25, Q56)
- 첫 입장 시 32바이트 무작위 토큰을 발급한다. 서버에는 SHA-256 해시만 저장한다.
- 토큰은 localStorage에 과정별로 저장한다 (`board:token:{courseId}`).
- Safari는 7일간 방문이 없으면 localStorage를 지운다. 그래서 같은 토큰을 서버가 설정하는 쿠키에도 둔다: `board_p_{courseId}`, `HttpOnly; Secure; SameSite=Lax; Path=/board; Max-Age=31536000` (Q100).
- localStorage가 비어 있으면 `POST /courses/:slug/restore`로 복구한다. 이 쿠키는 복구에만 쓰고, API 인증은 계속 `Authorization` 헤더로 한다.
- "다른 사람으로 입장하기"는 토큰을 폐기하고 쿠키도 지운다.
- 화면과 실시간 메시지에는 `public_id`만 나간다. 내부 `id`는 응답에 넣지 않고, 토큰은 입장과 복구 응답에만 넣는다.

### 14.3 도배 방지 (Q68)
| 대상 | 기기 하나당 한도 |
|---|---|
| 게시물 | 1분에 5개 |
| 댓글 | 1분에 20개 |
| 스크린샷 | 1분에 3장 |
| 링크 미리보기 | 1분에 20번 |
| 파일 업로드 | 1분에 20개 |
| 입장 | IP 하나당 1분에 120번 (한 연수장의 30명이 IP를 공유해도 막히지 않게, Q103) |

- 강사에게는 적용하지 않는다.
- 구현: 게시물, 댓글, 스크린샷, 파일 업로드는 D1에서 최근 1분 개수를 조회한다.
- 입장, 링크 미리보기, 브라우저 오류 보고는 저장된 기록이 없으므로 키마다 Durable Object(`RateLimiter`)의 저장소로 1분 창을 센다. Workers Rate Limiting 바인딩은 2026-11-02 미리보기 배포에서 3초에 250번을 보내도 막지 않아 쓰지 않는다. Hibernation에서 사라지는 메모리 카운터는 쓰지 않는다.
- 넘으면 `429`와 "잠시 후 다시 시도해 주세요".

### 14.4 콘텐츠 안전
- 본문은 평문으로 저장하고, 화면에서 링크만 자동으로 `<a>`로 바꾼다. HTML을 그대로 렌더링하지 않는다.
- 업로드 MIME은 서버에서 다시 확인하고, 내려받을 때 `Content-Disposition: attachment`를 기본으로 한다(이미지, PDF, 동영상 미리보기만 inline).
- CSP는 `public/_headers`에 다음 범위로 둔다.
  - `default-src 'self'`
  - `script-src`: 자기 출처, Cloudflare Insights
  - `style-src`: 자기 출처, `'unsafe-inline'`, jsDelivr
  - `font-src`: jsDelivr
  - `img-src`: 자기 출처, `data:`, `blob:`, `https:` (링크 미리보기 이미지)
  - `media-src`: `blob:`, R2 (`<ACCOUNT_ID>.r2.cloudflarestorage.com`)
  - `connect-src`: 자기 출처, 같은 호스트의 `wss:`, R2, Cloudflare Insights
  - `frame-src`: YouTube nocookie만
  - `worker-src`: 자기 출처, `blob:` (pdf.js)
  - `frame-ancestors 'none'`
- PDF는 프레임이 아니라 pdf.js로 캔버스에 그린다.
- 스크린샷 파일은 강사만 내려받을 수 있다.

---

## 15. Classly 연동 (Q37, Q39, Q40, Q41, Q42, Q94~Q99)

> 세부 구현은 코딩할 때 Classly 코드 전체를 참고해 확정한다. 이 장은 넣을 기능과 기본 방향만 정한다.

### 15.1 확인된 사실 (2026-11-01 classly.kr 확인)
- Classly는 Next.js 정적 내보내기(`output: "export"`)이고 Cloudflare Pages에서 서비스된다. 서버 미들웨어를 쓸 수 없다.
- 사용 중인 첫 단계 주소: `/me`, `/tools/...`, `/play/...`, `/s/...`, `/share/...`, `/privacy`, 한글 별칭(`/뉴스` 등). 없는 주소는 정적 404 페이지(`src/app/not-found.tsx`).
- `public/_redirects`는 Classly 빌드 스크립트(`scripts/build-assets.mjs`)가 다시 만든다.
- 2026-11-01 임시 Worker로 시험한 결과, `classly.kr/board/*` Worker 경로는 Pages 도메인보다 먼저 동작했다. `/board/`와 하위 경로, 한글 경로는 Worker가 받았고 `/`, `/me`, `/s/news`, `/뉴스`, `/boardgame`, 없는 주소는 그대로 Classly가 받았다. 임시 Worker는 삭제했다.
- Classly도 Pretendard Variable을 쓰고, 애니메이션 시간 토큰(`--duration-press`, `--duration-base`, `--duration-page`, `--duration-rise`)을 정의해 두었다.

### 15.2 넣을 기능
1. **보드 경로 연결**: Cloudflare 설정에서 `classly.kr/board/*`를 보드 Worker로 보낸다. Classly 본체는 건드리지 않는다.
2. **`/보드`, `/board` 이동**: `classly.kr/보드`와 `classly.kr/board`로 들어오면 `/board/`로 보낸다. Classly의 `scripts/build-assets.mjs`가 만드는 `_redirects`에 규칙 두 줄을 추가한다 (Q112).
3. **과정 바로가기** (Q94, Q95): `classly.kr/1101연수`처럼 Classly가 모르는 첫 단계 주소가 들어오면, Classly가 보드에 그런 과정이 있는지 물어보고 있으면 `classly.kr/board/1101연수`로 이동시킨다.
   - 방식: Classly의 404 페이지(`src/app/not-found.tsx`)에서 스크립트로 `/board/api/shortlink/:slug`를 조회해, 있으면 `location.replace`로 이동한다 (Q106). 조회가 끝날 때까지 404 문구를 숨긴다.
   - Service Binding이 필요 없고, Classly의 일반 페이지 요청은 보드의 무료 한도를 쓰지 않는다.
   - 조회 결과는 응답 헤더로 1분 동안 캐시한다.
   - 보드 Worker를 Classly 앞에 두는 방식은 쓰지 않는다 (Classly 전체 트래픽이 보드 무료 한도를 쓰고, 보드 장애가 Classly로 번지기 때문).
4. **이름 충돌 방지** (Q96): Classly의 기존 첫 단계 주소 목록을 보드의 금지 목록으로 쓴다. Classly에 새 첫 단계 페이지가 생기면 그 페이지가 우선한다. 구현 시 Classly 라우트에서 목록을 자동으로 뽑아 보드에 공유하는 방법을 검토한다.
5. **Classly 로고 링크** (Q42): 보드 왼쪽 위 Classly 로고를 누르면 Classly 홈으로.

### 15.3 독립성
- 보드는 독립 프로젝트다. 저장소(`cyeons/classly_board`)와 배포가 Classly와 분리되어 있고, 보드를 고쳐도 Classly 본체에 영향이 없다.
- Classly 저장소의 규칙 문서(CLAUDE.md 등)는 보드에 적용하지 않는다. 보드의 기준 문서는 이 계획서다.
- Classly 코드는 15.2의 연동 지점과 4.2의 금지 주소 목록을 확정할 때만 본다. Classly 쪽에 필요한 수정은 Classly 저장소에 따로 커밋한다.
- 로그인은 보드 전용 비밀번호. Classly 계정 연동은 나중에 한다.

---

## 16. 비기능 요구

### 16.1 무료 한도 예산 (2026-11-01 공식 문서 확인)
| 리소스 | 무료 한도 | 예상 사용 (30명 강의 하루) |
|---|---|---|
| Workers 요청 | 하루 100,000 | 약 5,000~15,000 (파일 주소를 묶어서 받는 경우, 12.3) |
| Workers CPU | 요청당, Cron 실행당 10ms | 대부분 2ms 이하, 로그인, 파일 주소 서명, 복제가 가장 큼 |
| Cron Trigger | 계정당 5개 | 2개 |
| Workers Logs | 하루 200,000건, 3일 보관 | 요청당 1건 |
| D1 저장 | DB당 500MB, 계정 5GB | 글과 댓글 수만 건도 수십 MB |
| D1 읽기와 쓰기 | 하루 읽기 500만 행, 쓰기 10만 행 (인덱스 쓰기 포함) | 쓰기는 글, 댓글, 좋아요 정도 |
| R2 저장 | 10GB (넘으면 과금, 서버가 9GB에서 차단) | 강의 자료와 수강생 첨부. 과정 종료 후 정리 |
| R2 Class A (쓰기) | 월 100만 | 업로드 수천 건 |
| R2 Class B (읽기) | 월 1,000만 | 썸네일과 다운로드 |
| R2 다운로드 트래픽 | 요금 없음 | |
| Durable Objects 요청 | 하루 100,000 (수신 메시지 20개당 1요청, 송신은 무료) | 연결과 메시지 |
| Durable Objects 실행 시간 | 하루 13,000 GB-s | Hibernation으로 쉬는 동안 쓰지 않음 |
| Durable Objects SQL 저장 | 5GB | 거의 사용 안 함 (D1이 원본) |
| TURN | 월 1,000GB | 화면 공유 1명 30분에 약 300MB |

- 관리자 홈에 오늘 요청 수를 보여주지는 않는다. Cloudflare 대시보드의 사용량 알림을 켜 둔다.

### 16.2 성능 목표
- 첫 화면 표시: 4G 휴대폰에서 2.5초 이내. 첫 화면 경로의 JS 번들 gzip 250KB 이내 (2026-11-03 디자인 v2에서 200KB에서 올림, Q127). 실측으로 라이브러리만 약 155KB(Zod 제외)이므로 글쓰기 창, 카드 상세, 발표 모드, 화면 공유, 관리자 화면, PDF 뷰어는 나눠서 나중에 불러온다.
- 배포 뒤 옛 JS 조각을 불러오지 못하면(없는 파일에 HTML이 200으로 온다) 한 번 새로고침해서 새 버전을 받는다.
- 실시간 이벤트 반영: 1초 이내.
- 강의 페이지 카드 50개, 과제 게시물 300개에서도 스크롤이 끊기지 않는다 (게시물이 많으면 칼럼별 가상 스크롤).

### 16.3 지원 환경 (Q10, Q71, Q86)
- iPhone Safari, Android Chrome, 삼성 인터넷, 카카오톡 앱 안 브라우저
- iPad Safari, Android 태블릿 Chrome
- Windows Chrome, Edge
- Mac Safari, Chrome
- 각 기기의 가로와 세로 화면
- 각 브라우저의 최근 2개 메이저 버전

### 16.4 접근성
- 7.1의 대비 기준 준수.
- 모든 버튼에 키보드 포커스 표시. 카드, 게시물, 탭은 키보드로 이동 가능.
- 아이콘만 있는 버튼에 `aria-label`.
- "동작 줄이기" 설정 존중.

---

## 17. 단계별 작업 계획 (Q43)

각 단계는 미리보기 주소에서 확인한 뒤 실제 주소에 배포한다. 작업 항목 옆 괄호는 관련 결정 번호. 단계별로 쓸 스킬은 22장에 있다.

### 단계 0. 준비
| 작업 | 완료 기준 |
|---|---|
| `classly.kr/board/*`에 빈 Worker를 연결해 경로 동작 확인 (15.1) | 완료 (2026-11-01). 하위 경로가 Worker로 가고 Classly 다른 페이지는 그대로 |
| 스킬 설치 (22.1), 용어를 `CONTEXT.md`로 고정 | 완료. Cloudflare 스킬이 목록에 보이고 `CONTEXT.md`가 저장소에 있음 |
| 저장소 루트에 Vite + React + TS + Cloudflare Vite 플러그인 설정 | 완료 (2026-11-01). `npm run dev`로 로컬에서 `/board/`가 열리고 `/board/api/health`가 응답 (개발 서버는 끝 슬래시 없는 `/board`가 404이고, 빌드 결과는 `/board/`로 이동) |
| Hono 라우터, Hono RPC 타입 공유 | 완료 (2026-11-01). 화면에서 타입이 붙은 API 호출이 동작하고, 없는 API를 부르면 타입 오류 |
| D1, R2, Durable Object 바인딩 (미리보기, 실제 분리, `apac` 위치) | 두 환경 각각 리소스가 만들어지고 wrangler 설정의 최상위와 `previews` 블록에 반영 |
| Rate Limiting 바인딩의 무료 요금제 동작 확인 (14.3) | 완료 (2026-11-02). 막지 않아 Durable Object 카운터로 바꿈 |
| Drizzle 스키마와 첫 마이그레이션 (9장 전체) | 완료. 로컬과 미리보기 D1에 표가 생성됨 |
| 디자인 토큰 `tokens.css`, Tailwind 테마, Pretendard, 기본 부품 | 완료. 토큰 견본 페이지에서 색, 글꼴, 모서리, 그림자 확인 |
| Motion 프리셋 (`motion.ts`) | 완료. 견본 카드에서 마우스 올림, 눌림, 스크롤 등장 동작 확인 |
| Workers Builds 연결 (GitHub 푸시 → 자동 빌드, 브랜치 → Worker Previews) | 브랜치에 푸시하면 고정 이름의 미리보기 주소가 갱신되고, 미리보기에서 실시간 연결이 됨 |
| Workers Logs 켜기, 브라우저 오류 보고 | 완료. 일부러 낸 오류가 로그에서 보임 |
| 테스트 환경 (Vitest Workers 풀, Playwright) | 완료. 빈 테스트가 통과 |

### 단계 1. 보드 핵심과 스크린샷
**1-A. 강사 기반**
| 작업 | 완료 기준 |
|---|---|
| 강사 로그인, 쿠키, 잠금, 로그아웃 (Q18, Q57, Q102) | 완료. 같은 IP에서 5번 틀리면 그 IP만 10분 잠김. 30일 유지. 비밀번호 변경 시 모든 세션 해제. PBKDF2 반복 횟수를 실측해 확정 |
| 관리자 홈: 과정 목록, 새 과정, 이름 확인, 링크 복사 (Q77, Q96~Q99) | 한글 이름 과정을 만들고 사람이 읽을 수 있는 링크가 복사됨 |
| 과정 관리: 강의 목록, 새 강의(대표 그림 포함), 모둠 관리, 과정 설정 (Q17, Q45) | 강의 3개, 모둠 4개를 만들고 수정, 삭제 가능 |
| 카드 생성 API, 강의 시작과 종료 API, 시드 데이터 (화면은 1-D) | 완료. 시드로 강의, 카드, 모둠이 로컬과 미리보기에 생김. 1-B와 1-C를 이것으로 확인할 수 있음 |
| 파일 업로드 기반 (presign, complete, 묶음 주소 발급, 이미지 축소, 썸네일) (Q58, Q104, Q105) | 완료. 100MB 파일이 올라가고 원래 이름으로 내려받아짐. 101MB는 거절. 합계 9GB 초과 거절. 주소 50개 서명의 CPU를 측정해 묶음 크기 확정. `response-content-disposition` 동작 확인 |

**1-B. 수강생 보기**
| 작업 | 완료 기준 |
|---|---|
| `/board` 안내 화면 (Q83) | 완료. 이전에 들어간 과정 바로가기가 보임 |
| 첫 입장 화면, 토큰 발급, 복구 쿠키, 이름 칩 메뉴, 다른 사람으로 입장 (Q51, Q84, Q85, Q100) | 완료. 닉네임과 모둠을 바꾸면 이전 글에도 반영. localStorage를 지워도 같은 사람으로 돌아옴. 다른 사람으로 입장 후 이전 글 수정 불가, 복구도 안 됨 |
| 과정 홈: 오늘 강의, 다가오는 강의, 지난 강의 펼침 (Q6, Q45) | 날짜를 바꿔 가며 세 경우가 모두 맞게 나옴. 펼침 애니메이션 동작 |
| 강의 페이지: 공지, 세로 카드 스트림, 개수 배지, 새 글 점 (Q21, Q44, Q60) | 휴대폰부터 데스크톱까지 한 줄 스트림 유지 |
| 카드 상세: 확장 애니메이션, 자료 탭, 과제 탭(모둠 칼럼, 전체 보기, 정렬) (Q13, Q15, Q79, Q87) | 완료. 고유 주소로 바로 열림. 칼럼 머리 고정. 내 모둠으로 자동 스크롤 |

**1-C. 쓰기와 소통**
| 작업 | 완료 기준 |
|---|---|
| Padlet식 글쓰기 창: + 버튼, 끌어다 놓기, 붙여넣기, 여러 첨부, 임시 저장, 즉시 표시, 다시 시도 (Q78, Q88) | Padlet 조작감 점검표(18.3) 전 항목 통과 |
| 첨부 미리보기: 이미지 크게 보기, PDF, 동영상, YouTube, Google 링크, 일반 링크 (Q49, Q69) | 완료. 각 종류별 견본 게시물이 맞게 보임 |
| 게시물 수정, 삭제, 실행 취소, 늦은 제출 표시 (Q46, Q64) | 지우고 5초 안에 되살리기 가능 |
| 댓글 (Q48) | 완료. 카드 아래에서 바로 작성. 강사 댓글 배경 구분 |
| 좋아요, 누른 사람 목록, 강사 표시 (Q38) | 완료. 두 기기에서 동시에 눌러도 개수가 맞음 |
| 전체 내려받기 zip (Q49) | 완료. 자료 10개가 zip 하나로 받아짐 |

**1-D. 실시간과 강사 운영**
| 작업 | 완료 기준 |
|---|---|
| LectureRoom DO, 이벤트 방송, 재연결 (Q59) | 완료. 브라우저 두 개에서 글, 댓글, 좋아요, 카드 공개가 1초 안에 반영. 네트워크를 끊었다 붙여도 화면이 맞음 |
| 강사 모드 막대: 시작, 종료, 접속 현황, QR, 수강생으로 보기 (Q31, Q63, Q91, Q92) | 완료. 종료하면 수강생 쓰기 버튼이 즉시 사라짐 |
| 인라인 편집: 카드 추가, 수정, 드래그 순서, 숨김/공개, 공지 편집, 자료 게시물 순서 (Q22, Q24) | 수업 중 순서를 바꾸면 수강생 화면도 즉시 바뀜 |
| 게시물 고정 (Q89) | 고정 글이 칼럼 맨 위, 테두리 표시 |
| 앱 내 알림 (Q50) | 완료. 세 가지 알림이 해당 수강생에게만 뜸 |
| 자정 자동 종료 Cron, 삭제 정리 Cron (Q90, Q109) | 완료. 로컬에서 scheduled 핸들러를 실행하고 자동 테스트로 확인 (Cron은 프로덕션에서만 돌고 미리보기에서는 돌지 않는다) |
| 강의 복제, 과정 복제 (Q61, Q77) | 완료. 복제본에 수강생 글이 없고, 파일은 R2에서 다시 복사되지 않음. 큰 과정 복제의 CPU를 측정해 10ms 안인지 확인 |
| 도배 방지 (Q68) | 완료. 1분에 6번째 게시물이 거절됨 |

**1-E. 스크린샷과 도움 요청함**
| 작업 | 완료 기준 |
|---|---|
| 스크린샷 보내기: 컴퓨터 화면 캡처, 휴대폰 앨범 선택, 미리보기와 개인정보 안내, 메시지 (Q33, Q67) | 완료. 컴퓨터와 휴대폰에서 각각 보내짐 |
| HelpDesk DO, 도움 요청함 패널, 알림음, 확인함 처리 (Q34) | 완료. 보내고 2초 안에 강사 패널에 닉네임, 모둠, 메시지와 함께 뜸 |
| 강사 오프라인 중 요청 보관 | 완료. 강사가 나중에 들어와도 대기 요청이 알림과 함께 보임 |

**1-F. Classly 연결과 출시**
| 작업 | 완료 기준 |
|---|---|
| 단계 0에서 확인한 경로에 실제 배포 (Q39) | 실제 주소에서 보드가 열리고 Classly 다른 페이지는 그대로 |
| `/보드`, `/board` 이동 (Q40, Q112) | `classly.kr/보드`와 `classly.kr/board`가 `/board/`로 이동 |
| 과정 바로가기 (Classly 쪽 작업 포함) (Q94~Q98) | `classly.kr/1101연수` → `classly.kr/board/1101연수`. 옛 이름도 이동 |
| 웹 앱 매니페스트, 아이콘, 탭 제목 형식 (Q66, Q76) | 완료. 휴대폰 홈 화면에 추가 후 앱처럼 열림 |
| 카카오톡 앱 안 브라우저 대응 (Q86) | 완료. 보기, 글쓰기, 사진 첨부 동작. 화면 공유 누르면 외부 브라우저 안내 |
| 실제 기기 점검표 전체 (18.2) | 모든 항목 통과 |

### 단계 2. 실시간 화면 공유와 발표 모드
| 작업 | 완료 기준 |
|---|---|
| TURN 자격 증명 발급 API (Q107) | 완료. 2시간 수명 자격 증명 발급. 응답의 TLS 443 주소 확인 |
| 수강생 화면 보여주기, 대기 표시, "강사님이 보고 있어요" 띠, 중지 (Q53) | 완료. 컴퓨터에서만 버튼 활성화. 휴대폰은 스크린샷 안내 |
| 강사 보기, 한 명씩 전환, 자동 종료 (Q29) | 완료. 다른 사람을 보면 이전 공유가 끝남 |
| 연결 실패 대응, 스크린샷 요청 버튼 | 완료. 일부러 TURN을 막았을 때 안내가 뜸 |
| 서로 다른 네트워크(집, 학교, 휴대폰 핫스팟) 연결 테스트 | 세 조합 모두 연결 |
| 발표 모드 (Q91) | 완료. 화살표로 넘기기, Esc로 나가기 |

### 단계 3. 저장 공간 정리와 백업
| 작업 | 완료 기준 |
|---|---|
| 저장 공간 화면: 강의별, 종류별 사용량, 일괄 삭제, 스크린샷 전체 삭제 (Q35) | 완료. 지운 만큼 사용량 막대가 줄어듦 |
| 공유 파일 참조 확인 후 실제 삭제 | 완료. 복제본이 쓰는 파일은 원본 강의를 지워도 남음 |
| 데이터 백업 JSON(나눠 받아 브라우저에서 조립), 강의별 파일 zip (Q73) | 완료. 백업 JSON에 과정의 모든 강의, 카드, 글, 댓글이 들어 있음 |
| 과정 종료, 재개 (Q28) | 종료된 과정은 모든 강의가 읽기 전용 |
| D1 Time Travel 복구 절차 문서화 | 완료 (2026-11-02). 미리보기 DB에 시험 줄을 넣고 그 전 시점으로 되돌려 사라지는 것을 확인. 절차는 docs/operations.md |

---

## 18. 테스트 계획 (Q71)

### 18.1 자동 테스트
**서버 (Vitest + Workers 풀)**
- 권한: 수강생이 자료 탭에 쓰기 거절, 남의 글 수정 거절, 강사만 고정 가능
- 강의 상태: 시작 전과 종료 후 수강생 쓰기 거절, 강사는 허용
- 용량: 강사 100MB, 수강생 50MB 경계, 합계 9GB 초과 거절, 신고보다 큰 파일 삭제
- 도배 방지: 한도 경계, 같은 IP에서 30명 입장 허용
- 보기 규칙: 시작 전 강의, 숨긴 카드, 비공개 강의의 게시물, 댓글, 좋아요, 파일을 하나씩 조회해도 거절
- 파일 소유권: 남이 올린 `fileId`(스크린샷 포함)를 내 글에 첨부하면 거절
- 로그인 잠금: 한 IP의 실패가 다른 IP의 로그인을 막지 않음
- 과정 이름: 정규화, 금지어, 중복, 옛 이름 이동
- 공개 범위: `instructor_only` 카드에서 다른 수강생 글이 응답에 없고, 그 글의 댓글과 좋아요 이벤트도 다른 수강생에게 가지 않음
- 토큰: 폐기된 토큰 거절, 응답에 내부 ID 없음, 복구 쿠키로 같은 사람 복구, 다른 사람으로 입장 후 복구 불가
- 실시간 연결: 티켓 없는 연결과 만료된 티켓, 다른 출처의 연결 거절. `rtc.*` 신호가 당사자에게만 감
- 복제: 수강생 데이터 미포함, 파일 공유
- Cron: 자정 자동 종료, 삭제 정리의 참조 확인

**브라우저 (Playwright)**
- 입장 → 과제 작성(이미지 첨부) → 다른 브라우저에서 실시간 확인 → 댓글 → 좋아요
- 끌어다 놓기와 붙여넣기로 글쓰기
- 강사 편집: 카드 추가, 순서 변경, 공개 → 수강생 화면 반영
- 스크린샷 보내기 → 도움 요청함 표시
- 휴대폰 크기(375px)와 데스크톱 크기에서 위 흐름 반복

### 18.2 실제 기기 점검표
각 기기에서 가로와 세로로 확인한다.
| 기기 | 브라우저 |
|---|---|
| iPhone | Safari, 카카오톡 앱 안 브라우저 |
| Android 휴대폰 | Chrome, 삼성 인터넷, 카카오톡 앱 안 브라우저 |
| iPad | Safari |
| Android 태블릿 | Chrome |
| Windows | Chrome, Edge |
| Mac | Safari, Chrome |

점검 항목: 첫 입장, localStorage가 지워진 뒤 신원 복구(특히 iPhone Safari), 홈 세 경우, 카드 확장, 과제 칼럼 스와이프, 글쓰기(사진, 카메라, 파일), 댓글, 좋아요, 스크린샷, 홈 화면에 추가, 애니메이션 부드러움, 동작 줄이기 설정.

### 18.3 Padlet 조작감 점검표 (Q78)
Padlet을 써 본 연수생 2~3명에게 설명 없이 시켜 보고 확인한다.
- [ ] 오른쪽 아래 + 버튼을 바로 찾아 글을 쓴다
- [ ] 모둠 칼럼의 + 버튼으로 자기 모둠에 쓴다
- [ ] 파일을 끌어다 놓아 올린다
- [ ] 캡처한 이미지를 붙여넣어 올린다
- [ ] 글쓰기 창의 첨부 아이콘 줄을 망설임 없이 쓴다
- [ ] 카드 아래에서 바로 댓글을 단다
- [ ] 하트를 누르고 취소한다
- [ ] 게시물을 눌러 크게 본다
- [ ] 내 글을 점 세 개 메뉴로 고친다
- [ ] 글쓰기 시트를 손잡이로 끌어내려 닫는다
- [ ] 맨 위에서 당겨 새로고침한다
- [ ] 카드를 열고 닫을 때 원래 자리로 줄어드는 것이 자연스럽다
- [ ] "Padlet이랑 똑같네" 또는 그에 준하는 반응

---

## 19. 배포와 운영 (Q72, Q73, Q74)

### 19.1 배포 흐름
- `cyeons/classly_board`에 푸시하면 Cloudflare Workers Builds가 자동으로 빌드한다.
- 작업 브랜치는 Worker Previews(`npx wrangler preview --name staging`)로 workers.dev 미리보기 주소에 배포된다. Version URL은 Durable Object를 쓰는 Worker에 생성되지 않아 쓸 수 없다.
- 미리보기는 `previews` 블록의 별도 D1과 R2를 쓰고, Durable Object는 미리보기마다 따로 만들어진다. 비밀 설정은 Wrangler 명령으로 따로 넣는다.
- 미리보기 이름은 `staging` 하나로 고정한다. R2 CORS에 미리보기 주소를 등록해야 하기 때문이다.
- 미리보기 주소는 기본으로 공개되므로 실제 수강생 자료를 올리지 않는다. Cron과 경로 연결은 실제 환경에서만 동작한다.
- main에 합치면 실제 주소 `classly.kr/board`에 배포된다.
- D1 마이그레이션은 배포 전에 `wrangler d1 migrations apply`로 적용한다. 미리보기 DB는 `--config wrangler.preview-migrations.jsonc`를 붙인다. 되돌릴 수 없는 변경(열 삭제)은 두 번의 배포로 나눈다.

### 19.2 백업과 복구
- 데이터 백업: 관리자 화면에서 JSON 내려받기.
- 파일 백업: 강의별 zip.
- 마지막 안전망: D1 Time Travel로 지난 시점 복구 (무료 요금제 보관 기간 7일).

### 19.3 오류 확인
- Workers Logs 켜기(무료 요금제 보관 3일). 요청마다 경로, 상태 코드, 소요 시간, 과정 ID를 구조화 로그로 남긴다. 쿼리 문자열과 인증 정보는 남기지 않는다.
- 브라우저 오류는 `POST /client-errors`로 보내 같은 로그에 남긴다 (화면 주소, 브라우저, 메시지).
- 수업 뒤 "그때 왜 안 됐지?"를 시간대별로 찾을 수 있게 로그에 KST 시각도 함께 남긴다.

### 19.4 수업 전 점검 순서 (운영 습관)
1. 관리자 홈에서 남은 용량 확인
2. 강의 공개 여부와 카드 숨김 상태 확인
3. 수강생으로 보기로 화면 확인
4. 입장 QR 띄우기
5. **시작** 누르기

---

## 20. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| 무료 요금제 CPU 10ms 제한 | 로그인 해시, 링크 미리보기가 느리거나 실패 | 해시 반복 횟수 측정 후 조정, 미리보기 HTML 512KB 제한, 무거운 작업은 브라우저로 |
| R2 10GB 초과 | 자동 차단 없이 초과분 과금 가능 | 서버가 합계 9GB에서 업로드 거절, 업로드 횟수 한도, 사용량 막대, 이미지 자동 축소, 과정 종료 후 정리, 스크린샷 일괄 삭제 |
| Safari의 저장소 7일 제한 | 여러 주 연수에서 수강생이 새 사람이 됨 | 복구 쿠키 (14.2), 실제 iPhone 점검 |
| 카카오톡 앱 안 브라우저 제약 | 일부 기능 동작 안 함 | 기능 감지 후 외부 브라우저 안내, 실제 기기 점검 |
| 학교, 기관 방화벽에서 WebRTC 차단 | 화면 공유 실패 | TURN(TLS 443) 사용, 실패 시 스크린샷 요청으로 전환 |
| 공용 PC에서 신원 섞임 | 앞사람 이름으로 글 작성 | 다른 사람으로 입장하기(복구 쿠키까지 삭제), 첫 입장 시 닉네임 미리 채움은 같은 기기의 다른 과정에서만 |
| 링크 유출로 외부인 입장 | 원치 않는 글 | 강의 종료로 쓰기 차단, 강사 삭제, 도배 방지. 그 밖의 관리는 강사가 직접 (Q82) |
| Classly 주소와 과정 이름 충돌 | 바로가기 오동작 | 금지 목록, Classly 우선 원칙, 생성 시 즉시 확인 |
| 실시간 연결 끊김 | 화면이 최신이 아님 | 재연결 시 전체 쿼리 무효화, 연결 상태 작은 표시 |
| 동시 편집 충돌 (강사가 두 기기에서 편집) | 순서가 꼬임 | 마지막 저장 우선, 실시간 이벤트로 즉시 동기화 |

---

## 21. 나중에 할 것 (1차 이후 후보)
- Classly 계정 연동 로그인
- Padlet 자료 가져오기 도구
- 익명 글 옵션
- 그리기, 음성 녹음, 투표
- 여러 강사, 보조 강사 권한
- 휴대폰 푸시 알림
- 다크 모드
- 강사가 여러 수강생 화면을 격자로 동시에 보기
- 과정 이름 금지 목록을 Classly 라우트에서 자동 동기화

---

## 22. 스킬 사용 계획

Claude Code로 구현할 때 쓰는 스킬이다. 설치된 스킬은 이름 그대로 호출한다.

### 22.1 추가 설치 (단계 0)
| 스킬 | 필요도 | 설치 | 시점 |
|---|---|---|---|
| Cloudflare 플러그인 (`durable-objects`, `wrangler`, `workers-best-practices`, `workers-profiling`, `web-perf`) | 필수 | `/plugin marketplace add cloudflare/skills`, `/plugin install cloudflare@cloudflare` | 단계 0 시작 전 |

### 22.2 단계별 스킬
| 단계 | 스킬 | 용도 |
|---|---|---|
| 0 | `domain-modeling` | 과정, 강의, 카드, 게시물 용어를 `CONTEXT.md`로 고정 |
| 0 | `wrangler`, `workers-best-practices` | 바인딩, 미리보기와 실제 환경 분리, Worker 구조 |
| 0 | `design:design-system` | 기본 부품, 7장 토큰 연결 |
| 0 | `wizard` | Cloudflare 리소스 생성, 비밀 설정, R2 CORS, Workers Builds 연결처럼 직접 해야 하는 작업 |
| 1-A | `tdd`, `security-review` | 로그인, 잠금, 세션, 업로드 용량 경계 |
| 1-A | `workers-profiling` | PBKDF2 반복 횟수 측정 (목표: 로그인 1회 CPU 8ms 이하) |
| 1-B | `frontend-design`, `design:ux-copy` | 입장, 과정 홈, 강의 페이지, 카드 상세 화면과 문구 |
| 1-B | `prototype` | 카드 확장 애니메이션을 본 구현 전에 검증 |
| 1-C | `frontend-design`, `prototype` | 글쓰기 창과 게시물 카드의 Padlet 조작감 |
| 1-C | `tdd`, `security-review` | 권한과 공개 범위, 링크 미리보기의 내부 주소 차단, MIME 확인 |
| 1-D | `durable-objects` | LectureRoom, WebSocket Hibernation, 이벤트 방송 |
| 1-D | `tdd` | 복제, Cron, 도배 방지 |
| 1-E | `durable-objects`, `frontend-design` | HelpDesk, 도움 요청함 패널 |
| 1-F | `wizard` | 실제 배포, Classly 쪽 바로가기와 `/보드` 이동 반영 |
| 1-F | `web-perf`, `design:accessibility-review`, `design:design-critique` | 16.2 성능 목표, 16.4 접근성, 18.3 점검 전 화면 검토 |
| 2 | `durable-objects`, `frontend-design`, `diagnosing-bugs` | 신호 교환, 화면 공유 화면, 연결 실패 원인 추적 |
| 2 | `security-review` | TURN 자격 증명 발급, 화면 공유 권한 |
| 3 | `tdd`, `wrangler`, `frontend-design` | 파일 참조 확인 후 삭제, D1 Time Travel 실습, 저장 공간 화면 |

### 22.3 공통 규칙
- **각 단계 끝:** `run`으로 실제 앱에서 확인하고 `code-review`, `simplify` 순서로 정리한 뒤 미리보기에 배포한다.
- **화면 작업:** 모두 `frontend-design`을 쓰되, 색, 글꼴, 모양, 애니메이션 수치는 7장을 따른다. 임의로 새 시안을 만들지 않는다.
- **문제가 생기면:** 재현하기 어려운 오류와 성능 저하는 `diagnosing-bugs`로 추적한다.
- **쓰지 않는 스킬:** `impeccable`(사용자 결정), `superdesign`, `inhabited-design`(디자인이 7장에 확정되어 시안 탐색이 필요 없다).

---

## 23. 구현 상태 (2026-11-03)

17장의 "완료"는 로컬 환경(Miniflare의 D1, R2, Durable Object와 실제 Chrome)에서 자동 테스트로 확인했다는 뜻이다. 실제 Cloudflare에 만들고 배포하는 일은 `bash scripts/cloudflare-setup.sh`로 직접 진행하고, 실제 환경에서만 확인할 수 있는 항목은 `docs/operations.md`의 배포 후 점검표에 있다. 아직 끝나지 않은 17장 작업은 다음과 같다.

- 단계 0: Workers Builds 연결 (D1, R2, 미리보기와 실제 배포는 2026-11-02 완료)
- 단계 1-F: 실제 기기 점검표 (실제 배포와 Classly 쪽 커밋은 2026-11-02 완료)
- 단계 2: 서로 다른 네트워크 연결 테스트

2026-11-03 디자인 v2(7장, Q113~Q128)를 `ui-v2` 브랜치에서 적용했다. 대상은 다음과 같다.
- 디자인 토큰
- 시트와 메뉴
- 화면 이동과 카드 상세 닫힘
- 뼈대 화면과 미리 받기
- 즉시 반영
- 당겨서 새로고침
- 화면별 다듬기

미리보기에서 휴대폰으로 확인한 뒤 main에 합친다.

22.3의 `code-review`와 `simplify`는 2026-11-02에 돌렸다. 고친 것:
- 확인을 마친 파일을 같은 올리기 주소로 덮어쓰는 문제 (`If-None-Match: *` 서명)
- 썸네일 크기 확인
- SVG 형식 이름 변형
- 동시에 몰린 로그인 시도가 잠금을 우회하는 문제
- 실시간 글에 섞인 "내가 누름"
- 복제할 때 과제 마감을 옮기지 않던 문제와 카드마다 하던 조회(D1 쿼리 50개 한도)
- 공지 첨부의 순서와 소유권 확인
- 오래된 순서로 옮길 때 500 오류
- 공개한 카드의 개수 0 표시

계획과 다르게 구현한 것: shadcn CLI 대신 Radix를 직접 감싼 부품을 쓴다(토큰과 번들 크기를 직접 다루기 위해서다). 칼럼 가상 스크롤 대신 CSS `content-visibility`를 쓴다(게시물 300개에서 스크롤 프레임 중앙값 16.7ms). 카드 복제 API(`POST /admin/cards/:id/duplicate`)와 `GET /cards/:id`를 추가했다.

---

## 부록 A. 결정 기록 (grill-me Q1~Q99, 구현 전 검증 Q100~Q112)

| 번호 | 결정 |
|---|---|
| Q1 | 강사는 1명 |
| Q2 | 강사 전용 로그인 페이지, 비밀번호로 입장 |
| Q3 | 자료는 강사만 작성. 과제 카테고리는 수강생이 자유롭게 글과 댓글. 모둠별 확인 |
| Q4 | 위에서 아래로 쌓이는 카드, 누르면 자세한 자료 |
| Q5 | 과제는 기본 전원 공개, 카드별로 강사만 보기 전환 가능 |
| Q6 | 오늘 강의가 없으면 다가오는 강의를 크게. 큰 카드 왼쪽에 연한 강의 그림, 오른쪽에 내용. 미래 강의는 공개 전까지 숨김 |
| Q7 | 화면 공유는 1:1 대기열 방식. 스크린샷은 강사만 보는 비공개 |
| Q8 | 백엔드는 Cloudflare |
| Q9 | 폰트 Pretendard (배색은 Q75로 대체). 다크 모드 없음 |
| Q10 | 한국어 UI. 노트북, 데스크톱, 태블릿, 휴대폰 모두, 가로와 세로 모두 |
| Q11 | (Q77로 대체) |
| Q12 | 홈 → 강의 페이지 → 카드 → 상세. 카드 순서는 수강생이 확인할 순서 |
| Q13 | 카드 상세는 App Store식 확장 애니메이션, 상세마다 고유 주소 |
| Q14 | 상세 안에 자료, 과제 탭. 공지는 강의 페이지 맨 위 고정 카드 |
| Q15 | 모둠은 칼럼 보기와 전체 보기. 닉네임과 모둠은 중간에 변경 가능 |
| Q16 | 과제 글에 텍스트, 링크, 이미지, 파일 모두 첨부 |
| Q17 | 강의 대표 그림은 강사가 강의 추가 시 업로드. 관리자 편집기 필요 |
| Q18 | 8자 이상 비밀번호, 5번 실패 10분 잠금, 30일 유지, 주소 `/admin` |
| Q19 | 새 댓글과 글은 새로고침 없이 실시간, 떠오르며 등장 |
| Q20 | (Q21로 대체) |
| Q21 | 모든 화면에서 한 줄에 카드 하나, 최대 폭 720px. 모둠 칼럼은 가로, 휴대폰은 스와이프 |
| Q22 | 편집은 강의 페이지에서 바로. 강의 목록은 관리자 홈 |
| Q23 | 편집기는 Padlet 참고 (Q32로 구체화) |
| Q24 | 카드마다 숨김/공개 스위치, 공개 시 실시간 등장 |
| Q25 | 신원은 기기별 고유 ID. 닉네임 변경 시 이전 글도 반영. 기기를 바꾸면 새 사람 |
| Q26 | 입장 코드 없음. 링크만으로 입장. 강의를 시작하면 열고 끝나면 닫음 |
| Q27 | 강사 100MB, 수강생 50MB. 과정 종료 후 강사가 정리 |
| Q28 | 과정 종료 시 읽기 전용, 데이터는 강사가 지울 때까지 보관, 백업 기능 |
| Q29 | 화면만 공유, 음성 없음, 보기만. 대기열과 알림음. 스크린샷은 보낸 사람을 바로 확인 |
| Q30 | React + Vite + Hono + D1/Drizzle + R2 + Durable Objects + WebRTC/TURN + Tailwind/shadcn/Motion |
| Q31 | 시작, 종료 버튼. 시작 전 "곧 시작해요". 종료 후 읽기 전용, 지난 강의에서 다시 보기 |
| Q32 | 자료와 과제를 같은 게시물 형태로 통일. 같은 글쓰기 창 |
| Q33 | 스크린샷: 컴퓨터는 화면 캡처, 휴대폰은 앨범 선택, 메시지 한 줄 |
| Q34 | 강사 화면 오른쪽 도움 요청함 패널, 알림음, 확인함 처리 |
| Q35 | 저장 공간 화면, 일괄 삭제, 스크린샷 전체 삭제 |
| Q36 | 좋아요 넣음 |
| Q37 | 배포 주소는 Classly 안 (`classly.kr/board`) |
| Q38 | 좋아요는 게시물만, 기기당 1번, 실시간 개수, 누른 사람 목록, 강사 표시 |
| Q39 | Cloudflare에서 `classly.kr/board/*` 경로 연결 (Classly가 Cloudflare에 있음을 확인) |
| Q40 | 실제 주소 `/board`, `/보드`로 오면 이동 |
| Q41 | 독립 저장소 `cyeons/classly_board`, 따로 배포 (처음 결정한 Classly 저장소 안 폴더를 대체) |
| Q42 | 보드 전용 로그인, Classly 로고 링크 |
| Q43 | 1단계 보드 핵심과 스크린샷, 2단계 화면 공유, 3단계 저장 공간과 백업 |
| Q44 | 카드에 이모지, 제목, 한 줄 설명, 자료와 과제 개수, 새 글 점 |
| Q45 | 강의에 시작 시각. 같은 날 여러 강의는 시간순 큰 카드, 진행 중을 맨 위 |
| Q46 | 과제 마감 선택 사항, 마감 뒤에는 늦은 제출 표시만 |
| Q47 | 자기 모둠 칼럼에만 작성, 모둠을 바꿔도 이전 글은 원래 칼럼, 미지정 칼럼 |
| Q48 | 댓글은 게시물에만, 한 단계, 강사 댓글 배경 구분 |
| Q49 | 이미지 크게 보기, PDF 미리보기, 동영상 재생, 전체 내려받기(브라우저 압축) |
| Q50 | 앱을 열어 둔 동안만 알림: 새 카드, 강사 댓글, 강사 좋아요 |
| Q51 | 첫 입장은 닉네임(2~12자)과 모둠을 묻는 카드 한 장, 아바타 색 자동 |
| Q52 | 애니메이션 수치 (7.5) |
| Q53 | 공유 중 "강사님이 보고 있어요" 띠와 중지 버튼, 다음 사람으로 넘어가면 자동 종료 |
| Q54 | 화면과 주소 목록 (4.1) |
| Q55 | 데이터 구조 (9장) |
| Q56 | 비밀 토큰과 공개 ID 분리 |
| Q57 | 비밀번호 해시, HttpOnly 쿠키, D1 잠금 기록, 변경 시 전체 로그아웃 |
| Q58 | presigned 직접 업로드, 이미지 2560px 축소, 1시간 임시 다운로드 주소 |
| Q59 | D1 원본, 강의별 실시간 방, 과정별 도움 데스크, 재연결 시 전체 갱신 |
| Q60 | 새 글 표시 기록은 브라우저에 저장 |
| Q61 | 강의 복제 (수강생 데이터 제외, 파일 공유) |
| Q62 | 강사 표시 이름과 강사 배지 |
| Q63 | 접속 현황은 강사에게만 |
| Q64 | 삭제 후 5초 실행 취소, 강의 삭제는 제목 입력 확인 |
| Q65 | (Q75로 대체) |
| Q66 | 앱 이름 Classly 보드, 홈 화면에 추가 지원 |
| Q67 | 스크린샷 개인정보 안내, 화면 공유 시 창 하나 고르기 권장 |
| Q68 | 도배 방지: 게시물 1분 5개, 댓글 20개, 스크린샷 3장 |
| Q69 | 링크 미리보기, YouTube 바로 재생, Google 링크 아이콘 |
| Q70 | (Q80으로 대체) |
| Q71 | 서버 자동 테스트, 브라우저 자동 테스트, 실제 기기 점검표 |
| Q72 | GitHub 푸시 자동 빌드, 브랜치는 미리보기, main은 실제. DB와 저장소 분리 |
| Q73 | 데이터 백업과 강의별 파일 백업 분리, D1 Time Travel |
| Q74 | Workers Logs와 브라우저 오류 기록 |
| Q75 | Classly 배색 (7.1) |
| Q76 | 가운뎃점 사용 안 함. 탭 제목 `Classly 보드 \| 강의 제목` |
| Q77 | 과정 여러 개, 과정별 주소, 과정 복제 |
| Q78 | Padlet식 조작 (5.5, 5.6, 5.7) |
| Q79 | Padlet 추가 기능 중 정렬만 |
| Q80 | 강사는 컴퓨터 위주. 휴대폰과 태블릿은 시작, 종료, 도움 요청함만 |
| Q81 | Padlet 자료 가져오기 없음 |
| Q82 | 주소에 무작위 글자 없음. 외부인 관리는 강사가 직접 |
| Q83 | `/board`는 안내 화면 |
| Q84 | 과정별 신원, 닉네임 미리 채움 |
| Q85 | 다른 사람으로 입장하기 |
| Q86 | 카카오톡 앱 안 브라우저 대응, 삼성 인터넷 포함 |
| Q87 | 모둠 칼럼 300px, 가로 스크롤, 머리 고정, 내 모둠 자동 스크롤 |
| Q88 | 글쓰기 임시 저장, 게시 즉시 작성자 화면에 표시 (Q101로 구체화), 업로드 다시 시도 |
| Q89 | 강사가 게시물 고정 |
| Q90 | 종료 안 한 강의는 자정 자동 종료 |
| Q91 | 입장 QR(1단계), 발표 모드(2단계) |
| Q92 | 수강생으로 보기 스위치 |
| Q93 | 익명 글 없음 |
| Q94 | 바로가기는 Classly 쪽에서 판단 (구현 시 Classly 코드 보고 확정) |
| Q95 | 바로가기는 `/board/과정이름`으로 이동 |
| Q96 | Classly 기존 주소는 과정 이름으로 금지, Classly 우선 |
| Q97 | 링크 복사와 QR은 읽을 수 있는 한글 주소 |
| Q98 | 이름을 바꿔도 옛 주소 연결 유지 |
| Q99 | 한글, 영문, 숫자, 하이픈, 최대 30자, 공백은 하이픈, 대소문자 구분 없음 |
| Q100 | 사용자 결정: 수강생 신원은 HttpOnly 복구 쿠키로 되살린다. Safari가 localStorage를 지워도 같은 브라우저면 같은 사람 |
| Q101 | 사용자 결정: 첨부가 있는 글은 작성자 화면에 바로 뜨고, 업로드가 끝나면 저장되어 그때 전원에게 보인다 |
| Q102 | 검증 후 기본값: 로그인 잠금은 IP별 (전역 잠금은 아무나 강사 로그인을 막을 수 있다) |
| Q103 | 검증 후 기본값: 입장 한도 IP당 1분 120번, 파일 업로드 한도 1분 20개 |
| Q104 | 검증 후 기본값: R2 합계 9GB에서 서버가 업로드 거절 |
| Q105 | 검증 후 기본값: 업로드할 때 브라우저에서 긴 변 480px 썸네일 생성, 파일 주소는 묶어서 발급 |
| Q106 | 검증 후 기본값: 과정 바로가기는 Classly 404 페이지의 스크립트로 처리, Service Binding 안 씀 |
| Q107 | 검증 후 기본값: TURN 자격 증명 수명 2시간 |
| Q108 | 검증 후 기본값: Zod는 서버에서만 사용 |
| Q109 | 검증 후 기본값: 종료된 강의는 댓글 수정과 좋아요까지 막는다. 지난 날짜의 시작 안 한 강의는 자정에 종료. 오늘 종료된 강의는 다음 날까지 오늘 영역에 표시 |
| Q110 | 검증 후 기본값: 제목 100자, 본문 5000자, 도움 요청 메시지 200자, 글당 첨부 10개 |
| Q111 | 검증 후 기본값: 미리보기는 Worker Previews, 이름은 `staging`으로 고정. 실시간 연결은 60초 티켓 |
| Q112 | 실측 후 결정: Worker 경로는 `classly.kr/board/*` 하나만 등록. 끝 슬래시 없는 `/board`는 Classly `_redirects`에서 `/board/`로 이동 |
| Q113 | 2026-11-03 UI/UX 개편: "딱딱한 웹 페이지 느낌"을 없앤다. 모든 화면을 같은 비중으로 고친다 |
| Q114 | 문제는 전체 디자인: 버튼, 상자가 일반 웹 같고, 반응 애니메이션과 전환이 부족함 |
| Q115 | Padlet을 바탕으로, 반응과 애니메이션은 토스와 iOS처럼 |
| Q116 | 시각 디자인까지 전면 개편. 토스식 담백함: 연회색 바탕, 테두리 없는 흰 카드, 큰 굵은 제목, 꽉 찬 알약 버튼, 옅은 그림자 |
| Q117 | 포인트 색은 Classly 블루 계열을 밝힌 `#1877C0` |
| Q118 | 화면 이동은 섞어서: 카드는 커지고 줄어들기, 과정에서 강의는 옆에서 밀려 들어오기, 글쓰기와 메뉴는 아래 시트 |
| Q119 | 미리 받기와 뼈대 화면. 다시 열 때는 이전 화면을 보여 주며 새로 받음 |
| Q120 | 거의 모든 동작을 즉시 반영하고 실패하면 되돌림 |
| Q121 | 제스처: 시트 끌어내려 닫기, 당겨서 새로고침, 왼쪽 끝 쓸어 뒤로(홈 화면 앱에서만) |
| Q122 | Android에서 좋아요, 게시 성공 때 짧은 진동. 동작 줄이기에서는 끔 |
| Q123 | 게시물은 흰 카드, 색은 모둠 칼럼과 카드 아이콘에만 |
| Q124 | 이모지는 Tossface |
| Q125 | 컴퓨터 화면은 지금 구조에 새 스타일. 강사 도구 막대는 화면 아래에 떠 있게 |
| Q126 | 다크 모드는 이번에도 제외 |
| Q127 | 첫 화면 JS 기준을 gzip 250KB로 올림. 시트, 제스처는 새 라이브러리 없이 Motion으로 |
| Q128 | 견본을 먼저 미리보기에 올려 휴대폰으로 확인한 뒤 전체에 적용 (2026-11-03 확정) |
