"""포스터 자동 부착 — Interpark(NOL) 검색 페이지(서버 렌더링)에서 상품 포스터를 찾아 tickets.seats 블롭의 poster에 기록.
사용: python tools/posters.py            (poster 없는 티켓만)
      python tools/posters.py --all      (전부 다시 찾기)
      python tools/posters.py --dry      (쓰지 않고 매칭 결과만 출력)
브라우저에서 못 하는 이유: tickets.interpark.com은 CORS 헤더가 없어 정적 웹앱(GitHub Pages)이 직접 읽을 수 없음. 서버 쪽(이 스크립트/인식 루틴)에서만 가능."""
import json, re, sys, difflib, urllib.request, urllib.parse
BASE='https://ydqabdlwzseommowiupw.supabase.co/rest/v1'
KEY='sb_publishable_t5MlvS1Ea8ftD7IkfzqaiA_BCrzU80J'
H={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}
UA={'User-Agent':'Mozilla/5.0 (Linux; Android 13) Chrome/120'}
ALL='--all' in sys.argv; DRY='--dry' in sys.argv

def get(url,headers):
    return urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=25).read().decode('utf-8','ignore')

def norm(s):
    s=re.sub(r'[〈〉<>\[\]()（）:：\-–—·,&]',' ',s or '')
    s=re.sub(r'\b(뮤지컬|콘서트|연극|한국 초연|초연|내한|공연|the musical|musical)\b',' ',s,flags=re.I)
    return re.sub(r'\s+',' ',s).strip().lower()

def keyword(name):
    n=norm(name)
    n=re.sub(r'\b20\d\d\b','',n).strip()
    return (n.split()[0] if n else name)[:20]   # 첫 단어(공연명 핵심)로 넓게 검색

def search(kw):
    h=get('https://tickets.interpark.com/contents/search?keyword='+urllib.parse.quote(kw),UA)
    items=[]
    for blk in h.split('data-prd-no="')[1:]:
        no=blk[:blk.index('"')]
        name=re.search(r'data-prd-name="([^"]*)"',blk); img=re.search(r'src="(https://ticketimage\.interpark\.com/[^"]+)"',blk); place=re.search(r'placeName__\w+">([^<]*)<',blk)
        if name and img: items.append({'no':no,'name':name.group(1),'img':img.group(1),'place':place.group(1) if place else ''})
    return items

def region(s):
    m=re.search(r'[-–—]\s*([가-힣]{2,3})\s*$',(s or '').strip())
    return m.group(1) if m else ''

def score(tn,it_name):
    a=difflib.SequenceMatcher(None,tn,norm(it_name)).ratio()
    toks=[x for x in tn.split() if len(x)>1]; itn=norm(it_name)
    b=sum(1 for x in toks if x in itn)/len(toks) if toks else 0
    if len(toks)<2: b=0.9 if (toks and itn.startswith(toks[0])) else 0   # 한 단어 제목은 상품명이 그 단어로 시작할 때만
    return max(a,b*0.9)

def pick(t,items):
    if not items: return None
    tn=norm(t['name']); venue=(t.get('venue') or '')
    treg=region(t['name']); best=None
    for it in items:
        ireg=region(it['name'])
        if treg and ireg and treg!=ireg: s_pen=0.3
        else: s_pen=0
        s=score(tn,it['name'])-s_pen
        if not treg and ireg: s-=0.15          # 지역 공연은 보통 서울 본공연과 별개 (없으면 같은 작품 지방공연 포스터로 대체)
        if treg and not ireg: s-=0.1
        for g in ('뮤지컬','콘서트','연극'):
            if g in t['name'] and g not in it['name']: s-=0.5
        if s>=0.5 and venue and it['place'] and (it['place'][:4] in venue or venue[:4] in it['place']): s+=0.3   # 이름이 맞을 때만 공연장 가산
        if best is None or s>best[0]: best=(s,it)
    return best[1] if best and best[0]>=0.5 else None

def blob(r):
    b=r['seats']
    if isinstance(b,str):
        try: b=json.loads(b)
        except Exception: b={}
    if isinstance(b,list): b={'seats':b}
    return b if isinstance(b,dict) else {}

rows=json.loads(get(BASE+'/tickets?select=id,name,vendor,memo,seats&order=show_date.asc',H))
cache={}; done=0
for r in rows:
    b=blob(r)
    if b.get('poster') and not ALL: continue
    t={'name':r['name'],'venue':b.get('venue','') or (r.get('memo') or '')}
    kw=keyword(r['name'])
    items=cache.get(kw)
    if items is None: items=cache[kw]=search(kw)
    hit=pick(t,items)
    print(f"{r['name'][:36]:38} → {(hit['name'][:36]+' @'+hit['place']) if hit else '없음'}")
    if DRY or (not hit and not b.get('poster')): continue
    b['poster']=hit['img'] if hit else ''   # --all 재검색에서 못 찾으면 잘못 붙은 것 제거
    if not b.get('venue') and hit['place']: b['venue']=hit['place']
    req=urllib.request.Request(f"{BASE}/tickets?id=eq.{r['id']}",data=json.dumps({'seats':b},ensure_ascii=False).encode(),headers={**H,'Prefer':'return=minimal'},method='PATCH')
    urllib.request.urlopen(req,timeout=25); done+=1
print(f"업데이트 {done}건")
