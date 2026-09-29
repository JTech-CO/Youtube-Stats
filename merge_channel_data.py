"""연도별 채널 데이터를 이어 붙여 전체 기간 일별 파일 + 주간·월간 집계 파일을 만든다.

입력: `연도별 채널데이터/*.csv` — 계정 생성일(2017-11-26)부터 매년 11-26 기준 1년 단위로 겹치지 않게
      나눈 일별 파일(마지막 파일은 데이터가 끝나는 날까지). 파일 하나에 모든 지표가 들어 있다.
      컬럼: 날짜, 구독자, 유효 조회수, 조회수, 시청 시간(단위: 시간), 평균 시청 지속 시간.
- 원본 YouTube Studio 내보내기(총계·표 데이터, 채널데이터·DBS770 두 세트)를 하나로 합쳐 만든 파일이다.
  합칠 때 겹치는 일자의 값은 모두 같았고, 원본 '합계' 행과 일별 합이 일치함을 확인했다.
- 원본 표 데이터는 모든 값이 0인 날을 생략했으므로 그런 날은 0으로 채워져 있다.
  평균 시청 지속 시간은 조회가 없으면 정의되지 않아 빈칸이다.
- 구독자는 일별 순증감(신규 - 해지)이며 비율이 아니다.
- 누적 구독자 = 개설일부터의 구독자 누계.
- 변화율(%) = (이번 - 이전) / 이전 * 100. 소수점 첫째 자리까지, 그 아래는 반올림(5는 올림).
  구독자는 누적 구독자 기준, 나머지는 그 기간 값 기준. 이전 값이 0이면 정의할 수 없어 빈칸.
  일별 파일은 전일 대비, 주간 파일은 전주 대비, 월간 파일은 전월 대비.

주간(월요일~일요일)·월간(달력 월) 집계:
- 구독자·유효 조회수·조회수·시청 시간은 합, 누적 구독자는 주말 값.
- 평균 시청 지속 시간은 원본과 같은 정의(시청 시간 / 유효 조회수, 초 단위 버림)로 다시 계산한다.
  일별 평균을 평균내면 조회수 가중이 깨진다.
- 데이터가 기간 일부만 덮는 주/월(첫 기간, 마지막 월)은 '집계 일수'로 구분한다.
  일수가 다른 기간끼리 비교한 변화율은 그만큼 왜곡되므로 집계 일수를 함께 봐야 한다.

그래프 페이지(index.html)가 읽는 js/channel-data.js에는 일별 원자료만 넣는다.
기간 집계와 변화율은 페이지(js/model.js)가 같은 규칙으로 계산한다.
"""
import csv
import json
import sys
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "연도별 채널데이터"
OUT_DAILY = ROOT / "채널데이터_전체기간_병합.csv"
OUT_WEEKLY = ROOT / "채널데이터_주간집계.csv"
OUT_MONTHLY = ROOT / "채널데이터_월간집계.csv"
OUT_VIZ = ROOT / "js" / "channel-data.js"
HEADER = ["날짜", "구독자", "유효 조회수", "조회수", "시청 시간(단위: 시간)", "평균 시청 지속 시간"]


def pct(cur, prev):
    """변화율(%)을 소수점 첫째 자리 반올림 문자열로. 이전 값이 0이면 빈칸."""
    prev = Decimal(prev)
    if not prev:
        return ""
    q = ((Decimal(cur) - prev) / prev * 100).quantize(Decimal("0.1"), ROUND_HALF_UP)
    return format(abs(q) if q == 0 else q, "f")  # -0.0 방지


def trim(x):
    """시청 시간을 소수 4자리로 맞추되 원본처럼 끝의 0은 뺀다."""
    return format(x.quantize(Decimal("0.0001")).normalize(), "f")


def duration(hours, valid):
    """시청 시간(시간) / 유효 조회수를 H:MM:SS(초 버림)로. 유효 조회수 0이면 빈칸."""
    if not valid:
        return ""
    s = int(hours * 3600 / valid)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def write_period(path, key_header, prev, groups):
    """기간별(주/월) 집계 파일. groups: {기간 키: 그 기간에 속한 일별 행}, prev: '전주'/'전월'."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow([
            key_header, "집계 일수", "구독자", "누적 구독자", f"구독자 {prev} 대비 변화율(%)",
            "유효 조회수", f"유효 조회수 {prev} 대비 변화율(%)",
            "조회수", f"조회수 {prev} 대비 변화율(%)",
            "시청 시간(단위: 시간)", f"시청 시간 {prev} 대비 변화율(%)", "평균 시청 지속 시간",
        ])
        cum = prev_valid = prev_views = prev_hours = 0
        for key, rows in groups.items():
            subs = sum(int(r[1]) for r in rows)
            valid = sum(int(r[2]) for r in rows)
            views = sum(int(r[3]) for r in rows)
            hours = sum(Decimal(r[4]) for r in rows)
            prev_cum, cum = cum, cum + subs
            w.writerow([
                key, len(rows), subs, cum, pct(cum, prev_cum),
                valid, pct(valid, prev_valid),
                views, pct(views, prev_views),
                trim(hours), pct(hours, prev_hours), duration(hours, valid),
            ])
            prev_valid, prev_views, prev_hours = valid, views, hours


# (일자, 구독자, 유효 조회수, 조회수, 시청 시간, 평균 시청 지속 시간) 문자열 행
daily = []
for path in sorted(SRC.glob("*.csv")):
    with open(path, encoding="utf-8", newline="") as f:
        header, *rows = csv.reader(f)
    if header != HEADER:
        sys.exit(f"헤더가 다름: {path.name}")
    daily += rows

first = date.fromisoformat(daily[0][0])
if [r[0] for r in daily] != [(first + timedelta(i)).isoformat() for i in range(len(daily))]:
    sys.exit("날짜가 연속이 아니거나 연도 파일 간에 겹침")

with open(OUT_DAILY, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow([
        "날짜", "구독자", "누적 구독자", "구독자 전일 대비 변화율(%)",
        "유효 조회수", "유효 조회수 전일 대비 변화율(%)",
        "조회수", "조회수 전일 대비 변화율(%)",
        "시청 시간(단위: 시간)", "시청 시간 전일 대비 변화율(%)", "평균 시청 지속 시간",
    ])
    cum = prev_valid = prev_views = prev_hours = "0"
    for day, subs, valid, views, hours, avg in daily:
        prev_cum, cum = cum, str(int(cum) + int(subs))
        w.writerow([
            day, subs, cum, pct(cum, prev_cum),
            valid, pct(valid, prev_valid),
            views, pct(views, prev_views),
            hours, pct(hours, prev_hours), avg,
        ])
        prev_valid, prev_views, prev_hours = valid, views, hours

weeks, months = {}, {}  # 월요일 / 연월 -> 그 기간에 속한 일별 행
for row in daily:
    d = date.fromisoformat(row[0])
    weeks.setdefault((d - timedelta(days=d.weekday())).isoformat(), []).append(row)
    months.setdefault(row[0][:7], []).append(row)

write_period(OUT_WEEKLY, "주 시작일(월)", "전주", weeks)
write_period(OUT_MONTHLY, "연월", "전월", months)


def hours_e4(hours):
    """시청 시간(소수 4자리)을 1만 배 정수로. 페이지가 정수 연산으로 CSV와 같은 값을 내게 한다."""
    x = Decimal(hours) * 10000
    if x != int(x):
        sys.exit(f"시청 시간이 소수 4자리를 넘음: {hours}")
    return int(x)


def seconds(hms):
    h, m, s = map(int, hms.split(":"))
    return h * 3600 + m * 60 + s


viz = {
    "start": daily[0][0],
    "subs": [int(r[1]) for r in daily],
    "valid": [int(r[2]) for r in daily],
    "views": [int(r[3]) for r in daily],
    "hoursE4": [hours_e4(r[4]) for r in daily],
    "avgSec": [seconds(r[5]) if r[5] else None for r in daily],
}
OUT_VIZ.parent.mkdir(exist_ok=True)
OUT_VIZ.write_text(
    "// merge_channel_data.py가 생성하는 파일. 직접 고치지 말 것.\n"
    f"window.CHANNEL_DATA = {json.dumps(viz, separators=(',', ':'))};\n",
    encoding="utf-8",
    newline="\n",
)

print(f"{OUT_DAILY.name}: {len(daily)}일 ({daily[0][0]} ~ {daily[-1][0]})")
print(f"{OUT_WEEKLY.name}: {len(weeks)}주 ({min(weeks)} ~ {max(weeks)} 시작)")
print(f"{OUT_MONTHLY.name}: {len(months)}개월 ({min(months)} ~ {max(months)})")
print(f"{OUT_VIZ.relative_to(ROOT).as_posix()}: 그래프용 일별 데이터 {len(daily)}일")
