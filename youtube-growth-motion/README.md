# 채널 성장 기록 2017—2026 · Data Motion Graphic

25초, 120 BPM, 1920×1080 · 30fps 데이터 모션그래픽입니다. 같은 채널 데이터를 캔들 그래프로 보여 주는 [기존 페이지](https://jtech-co.github.io/Youtube-Stats/)와 별개로, 수치를 박자에 맞춰 움직이는 오브젝트로 풀어낸 영상형 버전입니다.

- 데이터: [`dataset/채널데이터_전체기간_병합.csv`](dataset/채널데이터_전체기간_병합.csv) (2017-11-26 ~ 2026-09-27, 3,228일)
- 기획: [`prompt/STORYBOARD.md`](prompt/STORYBOARD.md)
- 프롬프트: [`prompt/Channel Prompt.txt`](<prompt/Channel Prompt.txt>) (Motion Graphic Template Prompt를 채운 것)
- 렌더된 영상: [`out/channel-growth-2017-2026.mp4`](out/channel-growth-2017-2026.mp4)

## 실행

빌드 과정도, 외부 의존성도 없습니다. 이 폴더만 다른 저장소로 옮겨도 그대로 동작합니다.

- **로컬**: `index.html`을 브라우저로 엽니다(`file://`로도 동작).
- **GitHub Pages**: 저장소 Settings → Pages에서 브랜치를 지정하면 `…/youtube-growth-motion/` 경로에서 재생됩니다.

오디오는 브라우저 정책상 처음 클릭한 뒤에 재생됩니다(`PLAY · SPACE`).

### 컨트롤

| 입력 | 동작 |
|---|---|
| `Space` | 재생 / 정지 |
| `←` `→` | 1프레임 이동 (`Shift`: 1박) |
| `[` `]` | 이전 / 다음 씬 |
| `Home` `End` | 처음 / 끝 |
| `G` | 박 그리드 오버레이 |
| `M` | 음소거 |
| 하단 바 | 스크럽(씬 구간 + 박 눈금), 씬 점프, WAV 내보내기 |

URL 파라미터: `?t=12.5`(시작 시각), `?grid`(그리드 켜기), `?capture`(1:1 무대, 컨트롤 숨김)

## 데이터 갱신

화면의 모든 숫자는 CSV에서 계산합니다. 새 데이터를 받으면 CSV를 같은 이름으로 바꾸고 다음을 실행합니다.

```bash
node tools/build-data.mjs
```

`js/data.js`가 다시 만들어지고, 계산한 값의 요약이 터미널에 출력됩니다. 씬이 다루는 기간(2023년 여름, 2023년 8월, 2024~2025년, 2025년 6~7월, 2026년)은 이 채널의 이야기에 맞춰 `tools/build-data.mjs`에 정해 두었고, CSV를 갱신하면 그 기간의 숫자와 전체 합계·최신 구독자 수가 다시 계산됩니다.

## MP4 렌더

```bash
node tools/render.mjs
```

`out/channel-growth-2017-2026.mp4`와 `.wav`가 생성됩니다(WAV와 `out/stills/`는 git에서 제외). 필요한 것: Node 22 이상, Chrome 또는 Edge, PATH에 있는 ffmpeg. npm 패키지는 필요 없습니다. Node 내장 `WebSocket`으로 Chrome DevTools Protocol을 직접 호출해 `seek(i/30)` → 캡처를 반복하고, 페이지 안에서 `OfflineAudioContext`로 렌더한 WAV와 ffmpeg로 합칩니다.

```bash
node tools/render.mjs --from 8 --to 12
node tools/render.mjs --stills 1.2,5.9,23.5
node tools/render.mjs --wav
```

환경 변수 `CHROME_PATH`, `FFMPEG_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## 구조

```
index.html              무대, 레이어, 스크립트 로드 순서
dataset/                원본 CSV (일별 구독자·누적 구독자·유효 조회수·조회수·시청 시간)
prompt/                 채운 프롬프트 (Channel Prompt.txt) + 스토리보드 (STORYBOARD.md)
out/                    렌더 결과 (channel-growth-2017-2026.mp4, poster.jpg)
css/
  tokens.css            팔레트, 폰트 스택(local() 우선, 시스템 폰트 폴백)
  stage.css             뷰포트 맞춤, 레이어, 캡처 모드, 박 그리드
  hud.css               크롭마크, 씬 번호·진행바, 박 인디케이터, 날짜 눈금자
  scenes.css            공용 컴포넌트와 씬별 스타일
  controls.css          플레이어 UI
js/
  core/util.js          수학, 이징, 시드 난수, DOM/SVG 빌더
  core/timeline.js      BPM → 박 → 프레임 (정수 박 기준이라 누적 오차 없음)
  data.js               DATA: tools/build-data.mjs가 CSV에서 생성 (씬은 여기만 참조)
  ui/components.js      헤드라인, 타이핑 캡션, 카운터, 도장, 칩, 날짜 변환
  fx/textures.js        하프톤 점 필드, 그레인, 도장 잉크 마스크
  hud.js                상시 HUD (누적 구독자 스파크라인이 들어간 날짜 눈금자)
  scenes/01…12-*.js     씬별 build() + update(lt)
  transitions.js        아이리스, 링 버스트, 스트립 셔터, 모션블러 슬라이드, 슬라이스 글리치, RGB 분리
  engine.js             render(t): 씬 활성화, 전환 창, HUD
  audio.js              WebAudio 트랙 + OfflineAudioContext WAV
  controls.js           재생, 스크럽, 씬 점프, 그리드, 사운드, WAV
  main.js               부트스트랩, window.seek(t)
tools/build-data.mjs    CSV → js/data.js
tools/render.mjs        무의존 MP4 렌더러 (CDP + ffmpeg)
```

`render(t)`는 순수 함수입니다. 모든 상태를 `t`에서 계산하고, 실시간 타이머에 기대지 않으며, 난수는 시드를 고정합니다. 그래서 `window.seek(t)` 한 번으로 어떤 프레임이든 똑같이 재현됩니다.

## 폰트

외부 요청을 하지 않도록 웹폰트 CDN을 쓰지 않습니다. 시스템에 설치된 Pretendard Black / JetBrains Mono를 먼저 찾고, 없으면 Noto Sans KR · Apple SD Gothic Neo · Malgun Gothic / Cascadia Mono · Consolas 순서로 대체합니다.

## 표기 원칙

- 모든 수치는 CSV에서 계산합니다. 파생값(합계, 기간, 변화율, 중앙값)의 계산 규칙은 스토리보드의 데이터 사용표에 있습니다.
- 반올림은 화면 표기에서만 하고 원값을 라벨에 함께 둡니다(예: 헤드라인 2,410시간, 라벨 2,409.74 HOURS).
- 변화율은 기존 캔들 페이지와 같은 규칙입니다: 소수 첫째 자리, 상승 ▲ 초록, 하락 ▼ 빨강. 캔들도 상승은 초록 채움, 하락은 빨강 빈 몸통입니다.
- 차트 축은 0에서 시작합니다. 07 씬은 축 눈금과 함께 스케일을 바꿔, 평소 조회수와 최고 조회수를 모두 보여 줍니다.
- "60명에서 3년": 60명 도달일(2020-05-27)부터 59~69명 구간을 처음 벗어나기 전날(2023-07-17)까지 1,147일입니다.
- 채널명, 로고, 플랫폼 공식 로고는 쓰지 않았습니다.
