"""Turn a chroma-key sprite sheet into a transparent, uniform strip.
   Kept as a script so a new sheet is one command, not a rebuild."""
from PIL import Image
import numpy as np, statistics, os, json, sys

def key(path):
    im=Image.open(path).convert("RGB")
    a=np.asarray(im).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    k=a[5,5]                                     # the corner IS the key colour
    dist=np.sqrt(((a-k)**2).sum(axis=2))
    alpha=np.clip((dist-60)/50.0,0,1)            # soft edge, so fur keeps its fringe
    out=a.copy()
    spill=np.minimum(r,b)-g                      # despill: kill the pink halo on the fur
    m=spill>0
    lim=g+np.maximum(0,spill)*0.25
    out[...,0]=np.where(m&(r>lim),lim,r)
    out[...,2]=np.where(m&(b>lim),lim,b)
    return Image.fromarray(np.dstack([np.clip(out,0,255).astype(np.uint8),(alpha*255).astype(np.uint8)]),"RGBA")

def build(path, out_png, target_h=300, colors=96):
    img=key(path)
    A=np.asarray(img)[...,3]
    on=(A>24).sum(axis=0)>3
    g=[];s=None
    for i,v in enumerate(on):
        if v and s is None: s=i
        if not v and s is not None:
            if i-s>30: g.append((s,i))
            s=None
    if s is not None: g.append((s,len(on)))
    med=statistics.median(b-a for a,b in g)
    sp=[]
    for a,b in g:                                # two cats touching still split cleanly
        n=max(1,round((b-a)/med)); w=(b-a)/n
        for i in range(n): sp.append((int(a+i*w),int(a+(i+1)*w)))
    cuts=[]
    for x0,x1 in sp:
        sub=img.crop((x0,0,x1,img.height)); bb=sub.getbbox()
        cuts.append(sub.crop(bb) if bb else sub)
    W=max(c.width for c in cuts); H=max(c.height for c in cuts)
    frames=[]
    for c in cuts:                               # feet on the floor, centred: no sliding
        f=Image.new("RGBA",(W,H),(0,0,0,0))
        f.paste(c,((W-c.width)//2,H-c.height),c)
        frames.append(f)
    strip=Image.new("RGBA",(W*len(frames),H),(0,0,0,0))
    for i,f in enumerate(frames): strip.paste(f,(i*W,0),f)
    scale=target_h/H
    strip=strip.resize((round(strip.width*scale),target_h), Image.LANCZOS)
    fw=round(W*scale)
    strip.quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG).save(out_png, optimize=True)
    return {"frames":len(frames),"fw":fw,"fh":target_h,"kb":os.path.getsize(out_png)//1024}

if __name__=="__main__":
    print(json.dumps(build(sys.argv[1], sys.argv[2])))
