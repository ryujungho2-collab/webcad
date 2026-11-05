"""Independent inspection of browser-exported cafe PDF and native task artifacts."""
import json,subprocess,hashlib
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw
from pypdf import PdfReader
root=Path(__file__).resolve().parents[3]
out=root/'output/projects/large-cafe'
renderer=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
source=json.loads((out/'large-cafe.webcad.json').read_text(encoding='utf-8'))['document']
report=json.loads((out/'report.json').read_text(encoding='utf-8'))
pdf=PdfReader(out/'large-cafe.pdf');assert len(pdf.pages)==12
subprocess.run([str(renderer),'-r','96','-png',str(out/'large-cafe.pdf'),str(out/'pdf-page')],check=True,capture_output=True)
images=[];pages=[]
for i,(page,expected) in enumerate(zip(pdf.pages,report['pages']),1):
 size=[float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72]
 assert all(abs(a-b)<.01 for a,b in zip(size,expected['size']))
 png=sorted(out.glob('pdf-page-*.png'))[i-1];im=Image.open(png).convert('RGB')
 ink=ImageChops.difference(im,Image.new('RGB',im.size,'white')).convert('L').point(lambda p:255 if p>35 else 0).getbbox();assert ink
 svg=(out/(expected['id'].split(':')[0].replace('cafe-','')+'.svg')).read_text(encoding='utf-8');assert '<svg' in svg and 'R0 / 2026-10-20' in svg
 pages.append({'number':i,'id':expected['id'],'paperMm':size,'pixels':list(im.size),'inkBounds':ink});images.append((expected['id'].split(':')[0],im))
assert report['pages'][0]['id'].startswith('cafe-G000')
assert len(source['blocks'])==20
placements=json.loads((out/'placements.json').read_text(encoding='utf-8'))
assert [sum(p['seats'] for p in placements if p['floor']==i) for i in [1,2]]==[40,60]
assets=json.loads((out/'cafe-assets.webcad.json').read_text(encoding='utf-8'))['document'];assert len(assets['blocks'])==20
assert all(i in source['objects'] for f in source['features'].values() for i in f['inputs'])
contact=Image.new('RGB',(1500,400*((len(images)+2)//3)),'#dedede');draw=ImageDraw.Draw(contact)
for i,(name,im) in enumerate(images):
 im.thumbnail((480,365));x=(i%3)*500+10;y=(i//3)*400+25;contact.paste(im,(x,y));draw.text((x,y-18),name,fill='black')
contact.save(out/'overview.png')
result={'status':'passed','method':'pypdf + independent Poppler 96dpi render + Pillow; native source/counted placement inspection','pages':pages,'blocks':20,'seats':[40,60],'missingInputs':0,'sha256':hashlib.sha256((out/'large-cafe.pdf').read_bytes()).hexdigest(),'limits':'Geometry and artifact verification; no building-code, fire, structural or equipment-specification certification.'}
(out/'independent-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'passed','pdfPages':12,'blocks':20,'seats':[40,60]}))
