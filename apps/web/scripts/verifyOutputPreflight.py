"""Read-only independent PDF/vector QA for downloaded preflight outputs."""
import hashlib,json,subprocess,zipfile
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw
from pypdf import PdfReader
root=Path(__file__).resolve().parents[3]
output=root/'output/verification/output-preflight'
renderer=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
source=json.loads((root/'output/projects/courtyard-commons/issued-r5/courtyard-commons.webcad.json').read_text(encoding='utf-8'))['document']
boards=[b for b in source['artboards'].values() if b['visible']]
report={'method':'pypdf structure + independent Poppler 72 dpi render + Pillow image checks','pdfs':[]}
images=[]
sets=list(dict.fromkeys(s['publication']['setId'] for s in source['modelPresentation']['sheets'].values()))
expected_sets=[(f'output-preflight-r5-{i+1}.pdf',[source['artboards'][s['artboardId']] for s in source['modelPresentation']['sheets'].values() if s['publication']['setId']==set_id]) for i,set_id in enumerate(sets)]
for name,expected in expected_sets+[('output-preflight-repaired.pdf',[{'size':[210,297]}])]:
 path=root/'output/pdf'/name;reader=PdfReader(path);assert len(reader.pages)==len(expected)
 prefix=output/name.removesuffix('.pdf')
 subprocess.run([str(renderer),'-r','72','-png',str(path),str(prefix)],check=True,capture_output=True)
 pages=[]
 for i,(page,board) in enumerate(zip(reader.pages,expected),1):
  size=[float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72]
  assert all(abs(a-b)<.05 for a,b in zip(size,board['size'])),(name,i,size)
  png=sorted(output.glob(name.removesuffix('.pdf')+'-*.png'))[i-1]
  image=Image.open(png).convert('RGB');difference=ImageChops.difference(image,Image.new('RGB',image.size,'white')).convert('L');bbox=difference.point(lambda v:255 if v>25 else 0).getbbox();assert bbox,(name,i,'blank page')
  pages.append({'page':i,'sizeMm':size,'pixels':image.size,'inkBounds':bbox})
  images.append((name+f' page {i}',image.copy()))
 report['pdfs'].append({'file':str(path.relative_to(root)),'pages':pages,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
with zipfile.ZipFile(output/'r5-vector.zip') as archive:
 names=archive.namelist();assert sum(n.endswith('.svg') for n in names)==10;assert sum(n.endswith('.dxf') for n in names)==10
 for name in names:
  text=archive.read(name).decode('utf-8');assert '<svg' in text if name.endswith('.svg') else 'ENTITIES' in text
 report['r5Vectors']={'svg':10,'dxf':10,'files':names}
document=json.loads((output/'repaired.webcad.json').read_text(encoding='utf-8'))['document']
note=next(f for f in document['features'].values() if f['output']=='note')
assert note['params']['modelNote']['point']==[100,160]
assert len(document['modelPresentation']['sheets'])==1
assert '<svg' in (output/'repaired.svg').read_text(encoding='utf-8')
assert 'ENTITIES' in (output/'repaired.dxf').read_text(encoding='utf-8')
contact=Image.new('RGB',(1120,360*((len(images)+1)//2)),'#dedede');draw=ImageDraw.Draw(contact)
for i,(label,image) in enumerate(images):
 image.thumbnail((540,325));x=10+(i%2)*560;y=25+(i//2)*360;contact.paste(image,(x,y));draw.text((x,y-18),label,fill='black')
contact.save(output/'independent-contact.png')
report['status']='passed';(output/'independent-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(f"Passed: 11 independently rendered PDF pages, 20 R5 vector pages, repaired portable document.")
