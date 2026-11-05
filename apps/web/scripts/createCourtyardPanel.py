"""A1 architectural panel made only from issued native CAD views and BRep cuts."""
from pathlib import Path
import json, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg

ROOT=Path(__file__).resolve().parents[3]
ASSETS=ROOT/'output/projects/courtyard-pavilion'
OUT=ROOT/'output/pdf/courtyard-pavilion-A1.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('Malgun','C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunBold','C:/Windows/Fonts/malgunbd.ttf'))
W,H=841*mm,594*mm
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('바람의 뜰 | Courtyard Pavilion - A1 architectural concept')
c.setAuthor('Agent WebCAD')
INK='#243c36'; MUTED='#68736a'; PAPER='#f3f0e8'; ACCENT='#a47845'
def rect(x,y,w,h,color):
 c.setFillColor(HexColor(color));c.rect(x*mm,y*mm,w*mm,h*mm,fill=1,stroke=0)
def txt(x,y,s,size=12,font='Malgun',color=INK):
 c.setFont(font,size);c.setFillColor(HexColor(color));c.drawString(x*mm,y*mm,s)
def rule(x,y,w,color='#b7beb2',thick=.5):
 c.setStrokeColor(HexColor(color));c.setLineWidth(thick);c.line(x*mm,y*mm,(x+w)*mm,y*mm)
def image(name,x,y,w,h):
 c.drawImage(ImageReader(str(ASSETS/name)),x*mm,y*mm,width=w*mm,height=h*mm,preserveAspectRatio=True,anchor='c',mask='auto')
def paragraph(x,y,lines,size=14,leading=8,color=INK):
 for line in lines:txt(x,y,line,size,color=color);y-=leading
def caption(x,y,n,title,subtitle):
 txt(x,y,n,11,'MalgunBold',ACCENT);txt(x+14,y,title,17,'MalgunBold');txt(x+14,y-9,subtitle,10,color=MUTED)
rect(0,0,841,594,PAPER)
rect(26,548,3,23,INK)
txt(36,553,'바람의 뜰',41,'MalgunBold')
txt(37,539,'COURTYARD PAVILION',12,'MalgunBold',MUTED)
txt(540,562,'하늘을 비우고, 그늘을 두르는 작은 공공의 장소',19,'MalgunBold')
txt(540,550,'낮은 진입부에서 높은 처마 아래로 걷고, 열린 뜰을 바라보며 머문다.',12)
txt(540,538,'개념설계 / 22 m × 17 m 내외의 조경 기단 / 18 m 길이의 두 캐노피',11,color=MUTED)
rule(26,526,789)

# The large drawing is a lit view of the exact issued CAD tessellation.
rect(26,263,493,250,'#e9e7e0');image('exterior.png',26,263,493,250)
txt(35,274,'01  전체 공간 - 얇은 지붕 / 노출 프레임 / 열린 뜰',11,'MalgunBold')
rect(540,366,275,147,'#e9e7e0');image('arrival.png',540,366,275,147)
txt(548,373,'02  서측 진입 - 눈높이 2.25 m의 실제 모델 뷰',10)

txt(540,348,'FORM FOLLOWS A WALK',11,'MalgunBold',ACCENT)
paragraph(540,335,['한 장의 덩어리 대신, 서로 다른 높이의 두 지붕이',
                   '뜰을 감싼다. 서측은 열고 동측은 연결하여',
                   '들어옴 - 그늘 산책 - 앉아 머묾이 이어진다.'],14,8)
rule(540,307,275)
txt(540,296,'01   비워 둔 중심',13,'MalgunBold')
txt(540,287,'중앙 수공간 위로 하늘이 열리고 시선이 통과한다.',11)
txt(540,276,'02   몸으로 읽는 높이',13,'MalgunBold')
txt(540,267,'낮은 처마에서 중앙의 높은 공간으로 단면이 변한다.',11)

caption(26,244,'03','GROUND / ROOF PLAN','동일 CAD 모델의 정투영 뷰 - 좌: 지붕을 숨긴 지상 공간 / 우: 지붕 평면')
image('ground-plan.png',26,67,276,158)
image('roof-plan.png',299,132,93,81)
txt(305,123,'두 캐노피의 사이',11,'MalgunBold')
txt(305,115,'열린 하늘과 진입축',10,color=MUTED)
paragraph(305,97,['지상 공간', '석재 기단 · 수공간', '곡선 벤치 3곳', '앉는 높이 450 mm'],11,7)
# Small, explicitly diagrammatic circulation arrow, over the true orthographic view.
c.setStrokeColor(HexColor(ACCENT));c.setFillColor(HexColor(ACCENT));c.setLineWidth(1.4)
c.line(38*mm,141*mm,64*mm,141*mm)
p=c.beginPath();p.moveTo(64*mm,141*mm);p.lineTo(60*mm,143*mm);p.lineTo(60*mm,139*mm);p.close();c.drawPath(p,fill=1,stroke=0)
txt(34,132,'WEST / ENTRY',9,'MalgunBold',ACCENT)

caption(414,244,'04','SECTION A-A','X=0 실제 BRep 횡단면 - 지붕과 목재 프레임, 기단의 관계')
section=svg2rlg(str(ASSETS/'courtSection.svg'))
assert section and section.width>0 and section.height>0
scale=min(400*mm/section.width,112*mm/section.height)
def readable_section_lines(node):
 if hasattr(node,'strokeColor') and node.strokeColor is not None:
  node.strokeColor=HexColor(INK)
  node.strokeWidth=.65/scale
 for child in getattr(node,'contents',[]):readable_section_lines(child)
readable_section_lines(section)
section.scale(scale,scale)
renderPDF.draw(section,c,414*mm+(400*mm-section.width*scale)/2,105*mm+(112*mm-section.height*scale)/2)
txt(563,204,'열린 하늘 / SKY COURT',12,'MalgunBold')
txt(414,107,'기단 ±0.00 m',10,color=MUTED)
txt(721,211,'최고 지붕 약 +5.6 m',10,color=MUTED)
rule(414,96,401)
swatches=[(414,'#b9b4a4','01  연속 석재 기단'),(551,'#b18b5b','02  집성목 프레임'),(689,'#81918e','03  회녹색 금속 지붕')]
for x,color,label in swatches:rect(x,80,7,7,color);txt(x+11,81,label,11,'MalgunBold')
txt(414,67,'프레임 단면 120 × 320 mm  /  지붕 수직 단면 높이 140 mm  /  1.78 m 인체 스케일',10,color=MUTED)

rule(26,53,789)
txt(26,41,'AGENT WEBCAD  /  ARCHITECTURAL CONCEPT STUDY',10,'MalgunBold')
txt(26,32,'실제 CAD 형상으로 제작한 투시도·정투영·단면. 개념설계 단계이며 구조 및 접합 상세 설계 전.',9,color=MUTED)
txt(540,41,'REFERENCE  /  공간 원리 참고 - 형상 복제 없음',9,'MalgunBold')
txt(540,33,'Junya Ishigami, Serpentine Pavilion 2019 - roof as landscape',8,color=MUTED)
txt(540,26,'Diébédo Francis Kéré, Serpentine Pavilion 2017 - community / open centre',8,color=MUTED)
c.linkURL('https://www.serpentinegalleries.org/whats-on/serpentine-pavilion-2019-designed-junya-ishigami/',(540*mm,31*mm,814*mm,39*mm),relative=0,thickness=0)
c.linkURL('https://www.serpentinegalleries.org/whats-on/serpentine-pavilion-2017-designed-francis-kere/',(540*mm,24*mm,814*mm,31*mm),relative=0,thickness=0)
txt(785,16,'A1 / 01',9,'MalgunBold',MUTED)
c.showPage();c.save()
print(json.dumps({'output':str(OUT),'pages':1,'paperMm':[841,594],'images':'Original CAD BRep tessellation with source finishes','section':'Exact issued BRep section SVG'},ensure_ascii=False))
