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
    if b<len(text) and text[b] in '.!?':b+=1
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
        # A plan-specific price only applies to amounts stated in the same sentence as that plan.
        matched=[m for m in matched if literal_spans(text[slice(*sentence_bounds(text,*m.span()))],cfg['plan'])]
    return matched

def supported_by(rule,source):
    if rule.kind=='number':return bool(re.search(r'(?<![\d.])'+re.escape(ungroup(rule.value))+r'(?![\d.])',ungroup(source.excerpt)))
    return rule.value.casefold() in source.excerpt.casefold()

def conflict_key(rule):
    cfg=rule.config or {}
    return (rule.subject,cfg.get('metric'),cfg.get('qualifier',''),cfg.get('plan',''))

CLAIM=re.compile(r"\b(?:guarantee\w*|fastest|best|leading|No\.\s?1\b|number one)\b|#1\b|\b\d+(?:\.\d+)?\s?%|\b\d+\s?x\s+(?:faster|more|better)\b",re.I)

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
                if cfg.get('qualifier') and cfg['qualifier'].casefold() not in text.casefold():
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
