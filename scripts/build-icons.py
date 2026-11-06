"""Build the full locally available Asura icon archive; never fabricate missing textures."""
from pathlib import Path
import argparse, base64, collections, gzip, hashlib, io, json, zipfile
import xml.etree.ElementTree as ET
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('--datacenter',required=True,type=Path)
p.add_argument('--collection',required=True,type=Path)
p.add_argument('--client-icons',required=True,type=Path)
p.add_argument('--report',required=True,type=Path,help='Private build report outside the module')
a=p.parse_args();root=Path(__file__).resolve().parents[1]
if root==a.report.resolve() or root in a.report.resolve().parents:raise SystemExit('Report must be outside module')
classes=['Warrior','Lancer','Slayer','Berserker','Sorcerer','Archer','Priest','Mystic','Soulless','Engineer','Fighter','Assassin','Glaiver']
names={};blank=[];conflicts=set()
def rows(table):
 for f in sorted((a.datacenter/table).glob('*.xml')):
  for _,e in ET.iterparse(f,events=('end',)):
   if e.attrib:yield dict(e.attrib)
   e.clear()
def add(key,name):
 if not name:blank.append(key);return
 name=name.lower()
 if key in names and names[key]!=name:conflicts.add(key)
 names[key]=name
for r in rows('AbnormalityIconData'):
 if 'abnormalityId'in r:add('abonormality__'+r['abnormalityId'],r.get('iconName'))
for r in rows('ItemData'):
 if 'id'in r:add('item__'+r['id'],r.get('icon'))
for r in rows('SkillIconData'):
 if 'skillId'in r:
  job=str(classes.index(r['class'])) if r['class']in classes else 'common'
  add('skill_'+job+'_'+r['skillId'],r.get('iconName'))
# Different race-specific common skills can share an ID; do not pick arbitrarily.
for key in conflicts:names.pop(key,None)
# Cyclone reset reports the stage ID, while the metadata lists its base skill.
names['skill_3_101110']=names['skill_3_101100']
old=json.loads((root/'ui/icons.json').read_text())
images=dict(old['images']);mapping={};missing={};dimensions={}
z=zipfile.ZipFile(a.collection)
zipnames={Path(n).stem.lower():n for n in z.namelist()if n.lower().endswith('.png')}
local={f.stem.lower():f for f in a.client_icons.glob('*.png')}
resolved={}
for name in sorted(set(names.values())):
 data=local[name].read_bytes()if name in local else z.read(zipnames[name])if name in zipnames else None
 if data is None:continue
 im=Image.open(io.BytesIO(data));im.load()
 if im.format!='PNG' or im.width<1 or im.height<1 or im.width>2048 or im.height>2048:raise ValueError(name)
 key=hashlib.sha256(data).hexdigest()[:20]
 if key in images and images[key]!='data:image/png;base64,'+base64.b64encode(data).decode():raise ValueError('Hash collision')
 images[key]='data:image/png;base64,'+base64.b64encode(data).decode();resolved[name]=key;dimensions[key]=im.size
for key,name in sorted(names.items()):
 if name in resolved:mapping[key]=resolved[name]
 else:missing[key]=name
mapping.update(old['map'])
missing={k:v for k,v in missing.items()if k not in mapping}
known_absent={'icon_status.electriccharge12_tex','icon_status.icon_resonance_common1_tex','icon_status.icon_resonance_common2_tex'}
unexpected=set(missing.values())-known_absent
if unexpected:raise ValueError('Unresolved new textures: '+', '.join(sorted(unexpected)))
assert all(k in images for k in mapping.values())
packs=root/'ui/icon-packs';packs.mkdir(exist_ok=True)
for prefix in '0123456789abcdef':
 subset={k:v for k,v in images.items()if k.startswith(prefix) and k not in old['images']}
 (packs/(prefix+'.json.gz')).write_bytes(gzip.compress(json.dumps(subset,separators=(',',':')).encode(),mtime=0))
payload={'map':mapping,'images':old['images'],'packs':1}
(root/'ui/icons.json').write_text(json.dumps(payload,separators=(',',':'))+'\n',encoding='utf-8')
report={'source':'Local Asura datacenter extraction 2026-10-28 and installed client textures',
 'mappingCount':len(mapping),'imageCount':len(images),'mappedByType':dict(collections.Counter(k.split('_')[0]for k in mapping)),
 'metadataKeys':len(names),'missingTextureMappings':missing,'blankMetadataKeys':sorted(set(blank)),
 'ambiguousCommonSkillKeys':sorted(conflicts),'bytes':(root/'ui/icons.json').stat().st_size,
 'aliases':{'skill_3_101110':'skill_3_101100'},'validatedPNGCount':len(dimensions),
 'packBytes':sum(f.stat().st_size for f in packs.glob('*.json.gz'))}
a.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items()if k not in ['missingTextureMappings','blankMetadataKeys']}))
print('Missing textures:',len(set(missing.values())),'covering',len(missing),'metadata keys; blank source rows:',len(set(blank)))
