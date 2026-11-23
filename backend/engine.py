"""Deterministic checks and citation validation; model output never establishes truth."""
import hashlib
import re
from datetime import datetime, timezone

def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def current(source):
    return source.status == 'approved' and (not source.review_date or source.review_date >= datetime.now(timezone.utc).date().isoformat())
def applies(rule, subject, channel):
    return rule.active and rule.subject.casefold() in (subject.casefold(), '*') and (not rule.config.get('channels') or channel in rule.config['channels'])

# Typographic quotes are folded one-for-one, so match offsets stay valid in the original text.
QUOTES=str.maketrans({'‘':"'",'’':"'",'‛':"'",'′':"'",'“':'"','”':'"','„':'"'})
def fold(text): return text.translate(QUOTES)
def literal_spans(text, value):
    return [(m.start(),m.end()) for m in re.finditer(re.escape(fold(value)),fold(text),re.I)] if value else []

# Amounts may use Indian (1,00,000) or international (100,000) digit grouping.
AMOUNT=r'(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)'
PATTERNS={'price':r'(?:₹\s?|INR\s*|Rs\.?\s*)'+AMOUNT+r'(?:\s*/\s*(?:month|year|mo)|\s+(?:per|a)\s+(?:month|year))?','trial':r'\b(\d+)\s*[- ]?day(?:s)?\b'}
def amount(value): return float(str(value).replace(',',''))
def ungroup(text): return re.sub(r'(?<=\d),(?=\d)','',text)
def group_like(original,value):
    """Write an approved value in the digit grouping the content already uses."""
    if ',' not in original:return value
    whole,_,decimals=ungroup(value).partition('.')
    if not re.search(r',\d{3},',original):  # rupee amounts default to Indian grouping
        head,tail=whole[:-3],whole[-3:]
        head=re.sub(r'(?<=\d)(?=(\d{2})+$)',',',head)
        grouped=(head+','+tail) if head else tail
    else:grouped=f'{int(whole):,}'
    return grouped+('.'+decimals if decimals else '')

def sentence_bounds(text,start,end):
    """The sentence containing [start,end). 'No. 1' and decimals are not sentence breaks."""
    def boundary(i):
        ch=text[i]
        if ch in '!?\n':return True
        if ch!='.':return False
        if i+1<len(text) and not text[i+1].isspace():return False
        return not re.search(r'(?:^|[^A-Za-z])(?:No|no|Rs|vs|approx)$',text[max(0,i-7):i])
    a=start
    while a>0 and not boundary(a-1):a-=1
    b=end
    while b<len(text) and not boundary(b):b+=1
    while b<len(text) and text[b] in '.!?':b+=1  # keep runs such as '!!' or '?!' with their sentence
    while a<b and text[a].isspace():a+=1
    while b>a and text[b-1].isspace():b-=1
    return a,b

def evidence(rule,source):
    return {'source_id':source.id,'title':source.title,'version':source.version,'excerpt':source.excerpt,'owner':source.owner,'rule_value':rule.value}

def number_matches(text,rule):
    cfg=rule.config or {}
    matched=list(re.finditer(PATTERNS.get(cfg.get('metric'),r'(?!)'),text,re.I))
    if cfg.get('metric')=='trial':
        matched=[m for m in matched if re.search(r'\b(trial|try|free)\b',re.split(r'[.!?]',text[:m.start()])[-1]+' '+re.split(r'[.!?]',text[m.end():])[0],re.I)]
    if cfg.get('plan'):
        # A plan-specific price applies to amounts stated with that plan: the same sentence, or the same clause
        # when the sentence states several amounts (e.g. "Professional: 1,999, Starter: 1,099").
        amounts=[x.start() for x in re.finditer(PATTERNS[cfg['metric']],text,re.I)] if cfg.get('metric') in PATTERNS else []
        def scope(m):
            a,b=sentence_bounds(text,*m.span())
            return clause(text,*m.span(),a,b) if sum(a<=x<b for x in amounts)>1 else (a,b)
        matched=[m for m in matched if literal_spans(text[slice(*scope(m))],cfg['plan'])]
    return matched

CLAUSE=re.compile(r'[;·|]|,(?!\d)|\s(?:and|but|while|whereas)\s',re.I)
def clause(text,start,end,a,b):
    lo,hi=a,b
    for m in CLAUSE.finditer(text,a,b):
        if m.end()<=start:lo=m.end()
        elif m.start()>=end:hi=m.start();break
    return lo,hi

def supported_by(rule,source):
    if rule.kind=='number':return bool(re.search(r'(?<![\d.])'+re.escape(ungroup(rule.value))+r'(?![\d.])',ungroup(source.excerpt)))
    return rule.value.casefold() in source.excerpt.casefold()

def conflict_key(rule):
    cfg=rule.config or {}
    return (rule.subject,cfg.get('metric'),cfg.get('qualifier',''),cfg.get('plan',''))

CLAIM=re.compile(r"\b(?:guarantee\w*|fastest|best|leading|No\.\s?1\b|number one)\b|#1\b|\b\d+(?:\.\d+)?\s?%|\b\d+\s?x\s+(?:faster|more|better)\b|\b\d{1,3}(?:,\d{2,3})+\+|\b\d+\+(?=\s)",re.I)

def cited(source,phrase):
    """The exact words of an approved excerpt that a tone or accessibility finding cites, or '' when absent."""
    if not phrase:return ''
    i=fold(source.excerpt).casefold().find(fold(phrase).casefold())
    return source.excerpt[i:i+len(phrase)] if i>=0 else ''

def sentences(text):
    """Sentence spans in reading order, using the same boundaries as sentence_bounds."""
    out=[];i=0
    while i<len(text):
        if text[i].isspace():i+=1;continue
        a,b=sentence_bounds(text,i,i)
        if b<=i:b=i+1
        if b>a:out.append((a,b))
        i=b
    return out

def word_pattern(term):
    """Whole-word match; single words also match simple inflections (magic → magical)."""
    body=re.escape(fold(term))
    return re.compile(r'(?<!\w)'+body+(r'(?:s|d|ed|al|ally|ing)?' if ' ' not in term and '-' not in term else '')+r'(?!\w)',re.I)

CAPS=re.compile(r'\b[A-Z]{4,}\b(?:[ \t]+\b[A-Z]{2,}\b)*')
def tone_checks(text,rule,source,channel=''):
    """Brand-voice checks. Each yields (span, title, message, suggestion, cited words); nothing is reported without citable approved words."""
    cfg=rule.config or {};folded=fold(text);out=[]
    for key,title,label in (('avoid','Off-brand wording','hype or pressure wording'),('messaging','Off-message promise','a promise the brand voice guide rules out')):
        for term,replacement in (cfg.get(key) or {}).items():
            words=cited(source,term)
            if not words:continue
            for m in word_pattern(term).finditer(folded):
                found=text[m.start():m.end()];fixed=replacement[:1].upper()+replacement[1:] if replacement and found[:1].isupper() else replacement
                out.append((m.span(),title,f'“{found}” is {label}. The brand voice guide says to avoid “{words}”.',fixed,words))
    for term,replacement in (cfg.get('preferred') or {}).items():
        words=cited(source,term)
        if not words:continue
        for m in word_pattern(term).finditer(folded):
            found=text[m.start():m.end()];fixed=replacement[:1].upper()+replacement[1:] if found[:1].isupper() else replacement
            out.append((m.span(),'Use the preferred term',f'The brand voice guide prefers “{replacement}” to “{words}”.',fixed,words))
    cite=cfg.get('cite') or {}
    limit=cfg.get('max_exclamations')
    words=cited(source,cite.get('exclamations',''))
    if isinstance(limit,int) and words and text.count('!')>limit:
        marks=[m.start() for m in re.finditer('!',text)][limit:]
        for a,b in sentences(text):
            if any(a<=p<b for p in marks):
                out.append(((a,b),'Too many exclamation marks',f'This content uses {text.count("!")} exclamation marks. The brand voice guide says to use {words}.',re.sub(r'!+','.',text[a:b]),words))
    words=cited(source,cite.get('shouting',''))
    # Capitals are a body-copy rule: labels on ads and banners are layout, so shouting_channels can scope it.
    if cfg.get('shouting') and words and (not cfg.get('shouting_channels') or channel in cfg['shouting_channels']):
        allowed={w.upper() for w in cfg.get('allow_caps') or []}
        for m in CAPS.finditer(text):
            caps=[w for w in re.findall(r'[A-Z]{2,}',m.group()) if w not in allowed]
            if not caps or not any(len(w)>=4 for w in caps):continue
            start=sentence_bounds(text,m.start(),m.end())[0]
            fixed=' '.join(w if w in allowed else w.lower() for w in m.group().split(' '))
            if m.start()==start:fixed=fixed[:1].upper()+fixed[1:]
            out.append((m.span(),'Words written in capitals',f'“{m.group()}” reads as shouting. The brand voice guide says: {words}.',fixed,words))
    limit=cfg.get('max_sentence_words');words=cited(source,cite.get('sentences',''))
    if isinstance(limit,int) and words:
        for a,b in sentences(text):
            count=len(re.findall(r"[\w₹'’%-]+",text[a:b]))
            if count>limit:out.append(((a,b),'Sentence is too long',f'This sentence has {count} words. The brand voice guide says: {words}.','',words))
    return out

def contrast_ratio(fg,bg):
    def lum(color):
        rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
        return sum(w*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4) for v,w in zip(rgb,(.2126,.7152,.0722)))
    a,b=sorted((lum(fg),lum(bg)));return round((b+.05)/(a+.05),2)

def passing_colour(fg,bg,target):
    """The nearest darker or lighter text colour that meets the target ratio, for the reviewer's fix note."""
    rgb=[int(fg[i:i+2],16) for i in (1,3,5)]
    for towards in (0,255):
        for step in range(1,21):
            mixed='#%02x%02x%02x'%tuple(round(c+(towards-c)*step/20) for c in rgb)
            if contrast_ratio(mixed,bg)>=target:return mixed
    return ''

GENERIC_ALT=re.compile(r'^(?:an?\s+)?(?:image|picture|photo|graphic|banner|img|screenshot|ad|advert|creative|logo|untitled|dsc|slide)?[\s_\-\d.]*(?:\.(?:png|jpe?g|webp|gif))?$',re.I)
def lab(rgb):
    """sRGB (0-255) to CIE Lab (D65)."""
    def lin(v):
        v/=255;return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    r,g,b=(lin(v) for v in rgb[:3])
    x,y,z=(r*.4124+g*.3576+b*.1805)/.95047,(r*.2126+g*.7152+b*.0722),(r*.0193+g*.1192+b*.9505)/1.08883
    f=lambda t:t**(1/3) if t>.008856 else 7.787*t+16/116
    fx,fy,fz=f(x),f(y),f(z)
    return (116*fy-16,500*(fx-fy),200*(fy-fz))
def hex_lab(h):return lab([int(h[i:i+2],16) for i in (1,3,5)])
def delta_e(a,b):return sum((p-q)**2 for p,q in zip(a,b))**.5

def palette(colours,rules,sources,subject,channel,logos=()):
    """Off-palette colours on a creative or page, against the approved palette. A judgement call, not a verdict:
    photography may legitimately use other colours, so the finding asks a reviewer to decide."""
    findings=[];deps=[]
    for rule in rules:
        if rule.kind!='palette' or not applies(rule,subject,channel):continue
        source=sources.get(rule.source_id)
        if source is None or not current(source):continue
        cfg=rule.config or {};approved=cfg.get('colours') or {}
        words=cited(source,(cfg.get('cite') or {}).get('palette',''))
        # Evidence-gated: every approved colour and the cited sentence must be in the approved source.
        if not words or not approved or any(h.casefold() not in source.excerpt.casefold() for h in approved.values()):continue
        deps.append({'rule_id':rule.id,'source_id':source.id,'source_version':source.version})
        tolerance=float(cfg.get('tolerance',20));minimum=float(cfg.get('min_share',0.015))
        refs=[(name,h.lower(),hex_lab(h)) for name,h in approved.items()]
        pages={}
        for m in colours:
            if m['share']<minimum:continue
            if any(m.get('page',0)==l.get('page',0) and l.get('box') and overlaps(m['box'],l['box']) for l in logos):continue
            here=hex_lab(m['hex']);gap=min(delta_e(here,r[2]) for r in refs)
            if gap<=tolerance:continue
            # Suggest a saturated brand colour for a saturated colour (an orange button becomes violet, not cream).
            chroma=lambda l:(l[1]**2+l[2]**2)**.5
            pool=[r for r in refs if chroma(r[2])>30] if chroma(here)>40 else refs
            name,h,_=min(pool or refs,key=lambda r:delta_e(here,r[2]))
            pages.setdefault(m.get('page',0),[]).append({**m,'nearest':name,'nearest_hex':h,'delta_e':round(gap,1)})
        for page,off in pages.items():
            off.sort(key=lambda o:-o['delta_e']*o['share'])  # the most off-brand area is marked first
            listed='; '.join(f"{o['hex']} ({o['share']*100:.1f}% of the {'page' if len(pages)>1 or page else 'creative'}, ΔE {o['delta_e']} from the closest approved colour; suggested {o['nearest']} {o['nearest_hex']})" for o in off[:4])
            findings.append({'id':digest(f"palette:{rule.id}:{page}:{','.join(o['hex'] for o in off)}")[:20],'rule_id':rule.id,'rule_code':rule.code,'outcome':'Low Confidence','title':'Colours outside the approved palette',
                'message':f'Measured colours not in the approved palette: {listed}. A reviewer decides whether they are acceptable here (for example in photography); otherwise use approved colours and upload the revision.',
                'suggestion':'','severity':'medium','start':0,'end':0,'span':'','kind':'visual','page':page,'box':off[0]['box'],'measure':{'colours':off[:4],'approved':[{'name':n,'hex':h} for n,h,_ in refs]},
                'engine':'Colour check · measured','resolved':False,'evidence':{**evidence(rule,source),'rule_value':words}})
    return findings,deps

def overlaps(box,other,share=0.5):
    """True when at least `share` of box lies inside other (both [y0,x0,y1,x1] on a 0-1000 grid)."""
    y0,x0,y1,x1=box;a,b,c,d=other
    inter=max(0,min(y1,c)-max(y0,a))*max(0,min(x1,d)-max(x0,b))
    return inter>=share*max(1,(y1-y0)*(x1-x0))

def access(regions,images,rules,sources,subject,channel,logos=()):
    """Accessibility findings from measured text regions and images, each citing the approved accessibility standard.
    Text inside a logo is exempt from contrast, as in WCAG (logotypes have no contrast requirement)."""
    findings=[];deps=[]
    for rule in rules:
        if rule.kind!='accessibility' or not applies(rule,subject,channel):continue
        source=sources.get(rule.source_id)
        if source is None or not current(source):continue
        cfg=rule.config or {};cite=cfg.get('cite') or {}
        def add(key,span,page,title,message,box=None,suggestion='',measure=None):
            start,end,text=span
            findings.append({'id':digest(f'access:{rule.id}:{key}:{page}:{start}:{end}:{title}:{message}')[:20],'rule_id':rule.id,'rule_code':rule.code,'outcome':'Accessibility','title':title,'message':message,'suggestion':suggestion,'severity':'medium',
                'start':start,'end':end,'span':text,'kind':'access','page':page,'box':box,'measure':measure or {},'engine':'Accessibility check · measured','resolved':False,'evidence':{**evidence(rule,source),'rule_value':cited(source,cite.get(key,''))}})
        deps.append({'rule_id':rule.id,'source_id':source.id,'source_version':source.version})
        normal,large=float(cfg.get('contrast_normal',4.5)),float(cfg.get('contrast_large',3))
        if cited(source,cite.get('contrast','')):
            for r in regions:
                c=r.get('contrast')
                if not c or not r.get('text'):continue
                if any(r.get('page',0)==l.get('page',0) and overlaps(r['box'],l['box']) for l in logos if l.get('box')):continue
                pt=r.get('size_pt') or (r.get('px',0)*0.75)
                big=pt>=float(cfg.get('large_pt',18)) or (r.get('bold') and pt>=float(cfg.get('large_bold_pt',14)))
                target=large if big else normal
                if c['ratio']>=target:continue
                better=passing_colour(c['fg'],c['bg'],target)
                add('contrast_large' if big and cite.get('contrast_large') else 'contrast',(r['start'],r['end'],r['text']),r.get('page',0),'Low text contrast',f'Measured contrast {c["ratio"]}:1 ({c["fg"]} text on {c["bg"]}, {c.get("method","measured")}). {"Large" if big else "Normal-size"} text needs at least {target:g}:1.'+(f' Text colour {better} would pass.' if better else ''),measure={**c,'target':target,'large':bool(big),'size_pt':round(pt,1)})
        if cited(source,cite.get('size','')):
            for r in regions:
                if r.get('size_pt') and r.get('text') and r['size_pt']<float(cfg.get('min_pt',9)):
                    add('size',(r['start'],r['end'],r['text']),r.get('page',0),'Very small text',f'This text is set at {r["size_pt"]:g} pt. The accessibility standard asks for at least {float(cfg.get("min_pt",9)):g} pt.',measure={'size_pt':r['size_pt']})
        if cited(source,cite.get('alt','')):
            for img in images:
                alt=' '.join(str(img.get('alt') or '').split());name=str(img.get('name') or '')
                stem=name.rsplit('.',1)[0].casefold()
                if not alt:title,why='Alt text missing','This image has no alt text, so screen-reader users get nothing.'
                elif GENERIC_ALT.match(alt) or alt.casefold() in (name.casefold(),stem) or len(alt.split())<3:title,why='Alt text is not helpful',f'“{alt}” does not describe the image or its purpose.'
                else:continue
                add('alt',(0,0,''),img.get('page',0),title,why,box=img.get('box'),suggestion=img.get('suggestion',''),measure={'alt':alt,'image':img.get('label') or name})
    return findings,deps

def scan(text,subject,channel,rules,sources,hypothetical=()):
    findings=[]; dependencies={}; mapped_guarantees=[]
    def add(rule,span,outcome,title,message,suggestion='',severity='high'):
        source=sources.get(rule.source_id) if rule else None
        start,end=span
        finding={'id':digest(f'{rule.id if rule else "unknown"}:{text}:{start}:{end}:{outcome}')[:20], 'rule_id':rule.id if rule else '', 'rule_code':rule.code if rule else 'REVIEW', 'outcome':outcome,'title':title,'message':message,'suggestion':suggestion,'severity':severity,'start':start,'end':end,'span':text[start:end], 'engine':'Rule engine', 'resolved':False,
                 'evidence':evidence(rule,source) if source else None}
        findings.append(finding)
    for rule in rules:
        if not applies(rule,subject,channel): continue
        source=sources.get(rule.source_id)
        cfg=rule.config or {}; kind=rule.kind; matched=[]
        if kind=='term':
            for term in cfg.get('variants',[]):
                matched.extend(literal_spans(text,term))
            relevant=matched or literal_spans(text,rule.value)
        elif kind=='number':
            matched=number_matches(text,rule)
            relevant=matched
        elif kind=='substantiation':
            matched=[(term,span) for term in cfg.get('unsupported_terms',[]) for span in literal_spans(text,term)];relevant=matched
            mapped_guarantees.extend(span for _,span in matched)
        elif kind=='banned': matched=literal_spans(text,rule.value);relevant=matched
        elif kind=='required': relevant=not cfg.get('trigger') or bool(literal_spans(text,cfg['trigger']))
        elif kind=='tone':
            if source is None or not current(source):continue
            checks=tone_checks(text,rule,source,channel)
            dependencies[rule.id]={'rule_id':rule.id,'source_id':source.id,'source_version':source.version}
            for span,title,message,suggestion,words in checks:
                add(rule,span,'Tone Issue',title,message,suggestion,'medium')
                findings[-1]['evidence']['rule_value']=words
            continue
        else: continue
        if not relevant: continue
        if source is None or not current(source):
            add(rule,(0,min(len(text),80)),'Low Confidence','Source needs review','The applicable source is missing, withdrawn or past its review date. Ask its owner to update it.');continue
        supported=supported_by(rule,source)
        if kind in ('number','term','required') and not supported and rule.id not in hypothetical:
            add(rule,(0,min(len(text),80)),'Low Confidence','Source needs review','The registered value is not present in the approved excerpt. Correct the source or mapping before a factual verdict.');continue
        # Register exact dependencies even when the content is already correct.
        dependencies[rule.id]={'rule_id':rule.id,'source_id':source.id,'source_version':source.version}
        if kind=='term':
            for span in matched:add(rule,span,'Verified Contradiction','Use the approved name',f'The approved term is “{rule.value}”.',rule.value)
        elif kind=='number':
            label=cfg.get('plan','') and cfg['plan']+' plan '
            for m in matched:
                fixed=m.group()
                if amount(m.group(1))!=amount(rule.value):
                    fixed=m.group().replace(m.group(1),group_like(m.group(1),rule.value),1)
                    add(rule,m.span(),'Verified Contradiction',f'Check the {label}{cfg.get("metric","value")}',f'Approved {label}{cfg.get("metric","value")}: {rule.value}. Applies to {rule.subject}.',fixed)
                # qualifier_channels limits where the condition must be shown (a clarified rule can exclude a channel).
                if cfg.get('qualifier') and (not cfg.get('qualifier_channels') or channel in cfg['qualifier_channels']) and cfg['qualifier'].casefold() not in text.casefold():
                    if cfg.get('qualifier_review'):
                        add(rule,m.span(),'Low Confidence','Check the pricing qualification',f'The approved policy attaches “{cfg["qualifier"]}” to this price. A reviewer must decide whether this placement has to show it.',fixed+' '+cfg.get('qualifier_text',cfg['qualifier']),'medium')
                    else:add(rule,m.span(),'Verified Contradiction','A condition is missing',f'This value requires “{cfg["qualifier"]}”.',fixed+', '+cfg['qualifier'])
        elif kind=='substantiation':
            for term,span in matched:add(rule,span,'Evidence Gap','This claim needs evidence','The approved support register maps this claim as unsupported. This is Unverified, not a verdict that it is false. Supply approved evidence or remove the claim.',(cfg.get('replacements') or {}).get(term,''))
        elif kind=='banned':
            for span in matched:add(rule,span,'Verified Contradiction','Restricted wording',f'The approved rule prohibits “{rule.value}”.',cfg.get('replacement',''))
        elif kind=='required' and rule.value.casefold() not in text.casefold():
            add(rule,(len(text),len(text)),'Verified Contradiction','Required message missing',f'Include the approved message “{rule.value}”.',rule.value)
    # Unmapped superlatives and quantified claims get uncertainty, never an inferred false verdict.
    reviewed=[]
    for m in CLAIM.finditer(text):
        if any(a<=m.start()<b for a,b in mapped_guarantees+reviewed):continue
        span=sentence_bounds(text,*m.span());reviewed.append(span)
        if any(a<span[1] and span[0]<b for a,b in mapped_guarantees):continue
        add(None,span,'Low Confidence','Confirm this claim’s support','This claim has no confirmed mapping in the checked register. A reviewer must establish its support. No factual verdict is made.')
    # Conflicting applicable approved facts invalidate deterministic factual verdicts.
    groups={}
    for rule in rules:
        if applies(rule,subject,channel) and rule.kind=='number' and current(sources[rule.source_id]):
            groups.setdefault(conflict_key(rule),[]).append(rule)
    for group in groups.values():
        if len({amount(r.value) for r in group})>1:
            ids={r.id for r in group}
            findings=[f for f in findings if f['rule_id'] not in ids]
            add(group[0],(0,min(len(text),80)),'Low Confidence','Approved sources disagree','Conflicting active values require an owner decision before a factual verdict.')
    for finding in findings:
        if finding['rule_id'] in hypothetical:
            finding['hypothetical']=True
            finding['engine']='Dry-run rule engine'
            if finding['outcome']=='Verified Contradiction':finding['outcome']='Projected Contradiction'
            if finding['evidence']:finding['evidence']['hypothetical_rule_value']=True
    return findings,list(dependencies.values())

def verified(text,subject,channel,rules,sources):
    """Spans that match an applicable, current approved value. Shown green; never a substitute for review."""
    spans=[]
    for rule in rules:
        source=sources.get(rule.source_id)
        if not applies(rule,subject,channel) or source is None or not current(source) or not supported_by(rule,source):continue
        found=[]
        if rule.kind=='number':
            found=[m.span() for m in number_matches(text,rule) if amount(m.group(1))==amount(rule.value)]
        elif rule.kind=='term':
            found=[(m.start(),m.end()) for m in re.finditer(re.escape(rule.value),text)]
        elif rule.kind=='required' and rule.value:
            found=literal_spans(text,rule.value)
        for start,end in found:
            spans.append({'id':digest(f'verified:{rule.id}:{start}:{end}:{text}')[:20],'rule_id':rule.id,'rule_code':rule.code,'title':rule.title,'span':text[start:end],'start':start,'end':end,'evidence':evidence(rule,source)})
    return spans

def validate_ai(proposals,text,rules,sources):
    """Only traceable, applicable suggestions survive, always as human-review uncertainty."""
    valid=[];hidden=0;lookup={r.id:r for r in rules}
    for p in proposals[:20]:
        try:
            r=lookup[p['rule_id']];s=sources[r.source_id];start=int(p['start']);end=int(p['end'])
            if not current(s) or not 0<=start<end<=len(text) or text[start:end]!=p['span'] or p['excerpt'] not in s.excerpt or len(p['excerpt'])<8 or p['source_id']!=s.id or p['source_version']!=s.version:raise ValueError()
            valid.append({'id':digest(str(p))[:20],'rule_id':r.id,'rule_code':r.code,'outcome':'Low Confidence','title':'Suggested semantic review','message':str(p['message'])[:800],'suggestion':str(p.get('suggestion',''))[:800],'severity':'medium','span':p['span'],'start':start,'end':end,'engine':'AI-assisted','resolved':False,'evidence':{'source_id':s.id,'title':s.title,'version':s.version,'excerpt':p['excerpt'],'owner':s.owner,'rule_value':r.value}})
        except (ValueError,KeyError,TypeError):hidden+=1
    return valid,hidden
