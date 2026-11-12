#!/usr/bin/env python3
# Zweiter Durchgang Pässe: kommt das Sportwagen Profil auf beiden Seiten vom Pass weg?
import json, math, urllib.request, urllib.error, concurrent.futures as cf
GH='http://localhost:8989'
def hav(a,b):
    la1,lo1,la2,lo2=map(math.radians,(a[0],a[1],b[0],b[1])); h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 12742000*math.asin(math.sqrt(h))
def brg(a,b):
    la1,lo1,la2,lo2=map(math.radians,(a[0],a[1],b[0],b[1])); y=math.sin(lo2-lo1)*math.cos(la2); x=math.cos(la1)*math.sin(la2)-math.sin(la1)*math.cos(la2)*math.cos(lo2-lo1)
    return math.degrees(math.atan2(y,x))%360
def post(body):
    req=urllib.request.Request(GH+'/route',json.dumps(body).encode(),{'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        try: return json.load(e)
        except Exception: return {}
    except Exception: return {}
def exits(p, prof):
    pt=(p['lat'],p['lon']); out=[]
    for R in (6000, 12000):
        for k in range(8):
            a=math.radians(k*45); t=(pt[0]+R*math.cos(a)/111320, pt[1]+R*math.sin(a)/(111320*math.cos(math.radians(pt[0]))))
            j=post({'profile':prof,'points':[[pt[1],pt[0]],[t[1],t[0]]],'points_encoded':False,'instructions':False,'ch.disable':True})
            if 'paths' not in j: continue
            c=[(q[1],q[0]) for q in j['paths'][0]['points']['coordinates']]
            if hav(c[-1],t)>3000 or j['paths'][0]['distance']<800: continue
            d=0; q=c[0]
            for i in range(1,len(c)):
                d+=hav(c[i-1],c[i]); q=c[i]
                if d>=300: break
            out.append(brg(c[0],q))
    cl=[]
    for b in out:
        if not any(min(abs(b-x),360-abs(b-x))<70 for x in cl): cl.append(b)
    return len(cl), len(out)
def one(p):
    s=exits(p,'sportwagen'); r={'id':p['id'],'name':p['name'],'tier':p['tier'],'sport':s}
    if s[0]<2: r['auto']=exits(p,'auto')
    return r
P=json.load(open('passes.json'))
with cf.ThreadPoolExecutor(8) as ex: res=list(ex.map(one,P))
json.dump(res,open('result2.json','w'),ensure_ascii=False)
for r in res:
    if r['sport'][0]<2: print(r['tier'],'|',r['name'],'| sport',r['sport'],'| auto',r.get('auto'))
