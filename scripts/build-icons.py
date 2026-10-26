from pathlib import Path
from PIL import Image, ImageDraw
out=Path('src/static/tabs');out.mkdir(parents=True,exist_ok=True)
for name in ['home','records','stats','about']:
 for active in [False,True]:
  im=Image.new('RGBA',(288,288));d=ImageDraw.Draw(im);c='#237859' if active else '#84918B';w=13
  def line(points):d.line([(x*4,y*4) for x,y in points],fill=c,width=w,joint='curve')
  def rect(box,r=4):d.rounded_rectangle(tuple(v*4 for v in box),radius=r*4,outline=c,width=w)
  if name=='home':
   line([(10,33),(36,11),(62,33)]);line([(17,30),(17,59),(55,59),(55,30)]);line([(30,58),(30,42),(42,42),(42,58)])
  elif name=='records':
   rect((17,11,57,61));line([(25,25),(47,25)]);line([(25,36),(47,36)]);line([(25,47),(39,47)]);line([(11,22),(20,22)]);line([(11,47),(20,47)])
  elif name=='stats':
   line([(12,12),(12,60),(61,60)]);rect((23,36,29,53),1);rect((37,25,43,53),1);rect((51,13,57,53),1)
  else:
   d.ellipse((25*4,10*4,47*4,32*4),outline=c,width=w);d.arc((13*4,37*4,59*4,81*4),180,360,fill=c,width=w);line([(13,58),(59,58)])
  im.resize((72,72),Image.Resampling.LANCZOS).save(out/(name+('-active' if active else '')+'.png'))
print('Generated 8 navigation icons')
