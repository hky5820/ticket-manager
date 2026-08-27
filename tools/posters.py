"""포스터 자동 부착 — tickets.seats 블롭의 poster 채우기.
사용: python tools/posters.py            (poster 없는 티켓만)
      python tools/posters.py --all      (전부 다시 찾기; 못 찾으면 비움)
      python tools/posters.py --dry      (쓰지 않고 매칭 결과만)
      python tools/posters.py --dry --name "뮤지컬 베토벤"   (이름 하나 테스트)

소스 순서 (앞에서 찾으면 끝):
  1. NOL 인터파크 검색 페이지(서버 렌더링, 판매 중인 공연) — 상품명·공연장 매칭
  2. 네이버 통합검색 '공연' 카드 (끝난 공연도 있음, csearch-phinf 포스터)
  3. 네이버 이미지검색 (제목에 공연명+장르 포함, 세로 비율만) — 최후 수단
브라우저에서 못 하는 이유: 이 사이트들은 CORS 헤더가 없어 정적 웹앱(GitHub Pages)이 직접 읽을 수 없음.
예매처 자체 사이트(티켓링크·멜론·YES24·세종·LG아트센터)는 JS 렌더링/차단이라 서버에서도 검색 불가 → 위 3단계로 대체."""
import json, re, sys, io, difflib, urllib.request, urllib.parse
BASE='https://ydqabdlwzseommowiupw.supabase.co/rest/v1'
KEY='sb_publishable_t5MlvS1Ea8ftD7IkfzqaiA_BCrzU80J'
H={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}
UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36','Accept-Language':'ko-KR,ko;q=0.9'}
ALL='--all' in sys.argv; DRY='--dry' in sys.argv
ONE=sys.argv[sys.argv.index('--name')+1] if '--name' in sys.argv else None
q=urllib.parse.quote

def get(url,headers=None,raw=False):
    r=urllib.request.urlopen(urllib.request.Request(url,headers=headers or UA),timeout=25); b=r.read()
    return b if raw else b.decode('utf-8','ignore')

def norm(s):
    s=re.sub(r'[〈〉<>\[\]()（）:：\-–—·,&『』「」]',' ',s or '')
    s=re.sub(r'\b(뮤지컬|콘서트|연극|한국 초연|초연|내한|공연|the musical|musical)\b',' ',s,flags=re.I)
    return re.sub(r'\s+',' ',s).strip().lower()
def core(name):
    n=re.sub(r'\b20\d\d\b','',norm(name)).strip()
    return (n.split()[0] if n else name)[:20]
def genre(name):
    for g in ('뮤지컬','콘서트','연극'):
        if g in name: return g
    return ''
def clean(name): return re.sub(r'\s+',' ',re.sub(r'[〈〉<>\[\]『』「」()（）]',' ',name or '')).strip()
def region(s):
    m=re.search(r'[-–—]\s*([가-힣]{2,3})\s*$',(s or '').strip()); return m.group(1) if m else ''

def portrait(url,minw=300):
    """이미지 받아서 세로 비율(1.2~1.8)·너비 minw 이상이면 True"""
    try:
        from PIL import Image
        im=Image.open(io.BytesIO(get(url,raw=True))); w,h=im.size
        return w>=minw and 1.2<=h/w<=1.8
    except Exception: return False

# ---- 1. 인터파크
def interpark(t):
    h=get('https://tickets.interpark.com/contents/search?keyword='+q(core(t['name'])))
    items=[]
    for blk in h.split('data-prd-no="')[1:]:
        name=re.search(r'data-prd-name="([^"]*)"',blk); img=re.search(r'src="(https://ticketimage\.interpark\.com/[^"]+)"',blk); place=re.search(r'placeName__\w+">([^<]*)<',blk)
        if name and img: items.append({'name':name.group(1),'img':img.group(1),'place':place.group(1) if place else ''})
    tn=norm(t['name']); treg=region(t['name']); best=None
    for it in items:
        itn=norm(it['name']); a=difflib.SequenceMatcher(None,tn,itn).ratio()
        toks=[x for x in tn.split() if len(x)>1]
        b=(0.9 if (toks and itn.startswith(toks[0])) else 0) if len(toks)<2 else sum(1 for x in toks if x in itn)/len(toks)*0.9
        s=max(a,b)
        ireg=region(it['name'])
        if treg and ireg and treg!=ireg: s-=0.3
        if not treg and ireg: s-=0.15
        if treg and not ireg: s-=0.1
        g=genre(t['name'])
        if g and g not in it['name']: s-=0.5
        if s>=0.5 and t['venue'] and it['place'] and (it['place'][:4] in t['venue'] or t['venue'][:4] in it['place']): s+=0.3
        if best is None or s>best[0]: best=(s,it)
    if best and best[0]>=0.5: return best[1]['img'], best[1]['name']+' @'+best[1]['place'], best[1]['place']
    return None

# ---- 2. 네이버 통합검색 공연 카드 (카드 안의 인터파크 상품 링크 → CDN 원본, 없으면 카드 썸네일)
def naver_card(t):
    h=get('https://search.naver.com/search.naver?query='+q(clean(t['name'])))
    i=h.find('개요')
    while i>=0:
        seg=h[max(0,i-8000):i+3000]
        if '기간' in re.sub(r'<[^>]+>',' ',seg):
            useg=urllib.parse.unquote(seg)
            gid=re.search(r'tickets\.interpark\.com/goods/(\d{6,9})',useg)
            if gid:
                u=f"https://ticketimage.interpark.com/Play/image/large/{gid.group(1)[:2]}/{gid.group(1)}_p.gif"
                if portrait(u): return u, '네이버 공연카드 → 인터파크 '+gid.group(1), ''
            m=re.search(r'src=(https?%3A%2F%2Fcsearch-phinf\.pstatic\.net[^"&]*image_url[^"&]*)',seg)   # marketing_banner 말고 포스터(image_url)만
            if m:
                img=urllib.parse.unquote(m.group(1))
                if portrait(img,200): return img, '네이버 공연카드 썸네일(226px)', ''
        i=h.find('개요',i+2)
    return None

# ---- 3. 네이버 이미지검색
def naver_image(t):
    kw=clean(t['name'])+' 포스터'
    h=get('https://search.naver.com/search.naver?where=image&query='+q(kw))
    c=core(t['name']); g=genre(t['name'])
    for m in re.finditer(r'"originalUrl":"(http[^"]+)"',h):
        u=m.group(1).replace('\\/','/'); tail=h[m.end():m.end()+2500]; tm=re.search(r'"title":"([^"]*)"',tail); title=tm.group(1) if tm else ''
        if 'creensh' in u or '캡처' in title: continue
        if c in norm(title) and (not g or g in title) and portrait(u): return u, '네이버 이미지: '+title[:40], ''
    return None

def blob(r):
    b=r['seats']
    if isinstance(b,str):
        try: b=json.loads(b)
        except Exception: b={}
    if isinstance(b,list): b={'seats':b}
    return b if isinstance(b,dict) else {}

def find(t):
    for fn in (interpark,naver_card,naver_image):
        try:
            r=fn(t)
            if r: return r
        except Exception as e:
            print('   !',fn.__name__,str(e)[:60])
    return None

if ONE:
    r=find({'name':ONE,'venue':''}); print(ONE,'→',r); sys.exit()

rows=json.loads(get(BASE+'/tickets?select=id,name,vendor,memo,seats&order=show_date.asc',H))
cache={}; done=0
for r in rows:
    b=blob(r)
    if b.get('poster') and not ALL: continue
    t={'name':r['name'],'venue':b.get('venue','') or (r.get('memo') or '')}
    hit=cache.get(r['name'])
    if hit is None: hit=cache[r['name']]=find(t) or False
    print(f"{r['name'][:36]:38} → {hit[1] if hit else '없음'}")
    if DRY or (not hit and not b.get('poster')): continue
    b['poster']=hit[0] if hit else ''
    if hit and hit[2] and not b.get('venue'): b['venue']=hit[2]
    req=urllib.request.Request(f"{BASE}/tickets?id=eq.{r['id']}",data=json.dumps({'seats':b},ensure_ascii=False).encode(),headers={**H,'Prefer':'return=minimal'},method='PATCH')
    urllib.request.urlopen(req,timeout=25); done+=1
print(f"업데이트 {done}건")
