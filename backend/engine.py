"""Deterministic checks and citation validation; model output never establishes truth."""
import hashlib
import re
from datetime import datetime, timezone

def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def current(source):
    return source.status == 'approved' and (not source.review_date or source.review_date >= datetime.now(timezone.utc).date().isoformat())
def applies(rule, subject, channel):
    return rule.active and rule.subject.casefold() in (subject.casefold(), '*') and (not rule.config.get('channels') or channel in rule.config['channels'])
def literal_spans(text, value):
    return [(m.start(),m.end()) for m in re.finditer(re.escape(value),text,re.I)] if value else []
def scan(text,subject,channel,rules,sources,hypothetical=()):
    findings=[]; dependencies={}; mapped_guarantees=[]
    def add(rule,span,outcome,title,message,suggestion='',severity='high'):
        source=sources.get(rule.source_id) if rule else None
        start,end=span
        finding={'id':digest(f'{rule.id if rule else "unknown"}:{text}:{start}:{end}:{outcome}')[:20], 'rule_id':rule.id if rule else '', 'rule_code':rule.code if rule else 'REVIEW', 'outcome':outcome,'title':title,'message':message,'suggestion':suggestion,'severity':severity,'start':start,'end':end,'span':text[start:end], 'engine':'Rule engine', 'resolved':False,
                 'evidence':{'source_id':source.id,'title':source.title,'version':source.version,'excerpt':source.excerpt,'owner':source.owner,'rule_value':rule.value} if source else None}
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
            patterns={'price':r'(?:₹|INR\s*|Rs\.?\s*)(\d+(?:\.\d+)?)(?:\s*/(?:month|year)|\s+per\s+(?:month|year))?','trial':r'\b(\d+)\s*[- ]?day(?:s)?\b'}
            matched=list(re.finditer(patterns.get(cfg.get('metric'),r'(?!)'),text,re.I))
            if cfg.get('metric')=='trial':
                matched=[m for m in matched if re.search(r'\b(trial|try|free)\b',re.split(r'[.!?]',text[:m.start()])[-1]+' '+re.split(r'[.!?]',text[m.end():])[0],re.I)]
            relevant=matched
        elif kind=='substantiation':
            matched=[span for term in cfg.get('unsupported_terms',[]) for span in literal_spans(text,term)];relevant=matched
            mapped_guarantees.extend(matched)
        elif kind=='banned': matched=literal_spans(text,rule.value);relevant=matched
        elif kind=='required': relevant=not cfg.get('trigger') or bool(literal_spans(text,cfg['trigger']))
        else: continue
        if not relevant: continue
        if source is None or not current(source):
            add(rule,(0,min(len(text),80)),'Low Confidence','Source needs review','The applicable source is missing, withdrawn or past its review date. Ask its owner to update it.');continue
        supported=bool(re.search(r'(?<![\d.])'+re.escape(rule.value)+r'(?![\d.])',source.excerpt)) if kind=='number' else rule.value.casefold() in source.excerpt.casefold()
        if kind in ('number','term','required') and not supported and rule.id not in hypothetical:
            add(rule,(0,min(len(text),80)),'Low Confidence','Source needs review','The registered value is not present in the approved excerpt. Correct the source or mapping before a factual verdict.');continue
        # Register exact dependencies even when the content is already correct.
        dependencies[rule.id]={'rule_id':rule.id,'source_id':source.id,'source_version':source.version}
        if kind=='term':
            for span in matched:add(rule,span,'Verified Contradiction','Use the approved name',f'The approved term is “{rule.value}”.',rule.value)
        elif kind=='number':
            for m in matched:
                if float(m.group(1))!=float(rule.value):
                    replacement=m.group().replace(m.group(1),rule.value,1)
                    add(rule,m.span(),'Verified Contradiction',f'Check the {cfg.get("metric","value")}',f'Approved {cfg.get("metric","value")}: {rule.value}. Applies to {rule.subject}.',replacement)
                if cfg.get('qualifier') and cfg['qualifier'].casefold() not in text.casefold():
                    add(rule,m.span(),'Verified Contradiction','A condition is missing',f'This value requires “{cfg["qualifier"]}”.',m.group()+', '+cfg['qualifier'])
        elif kind=='substantiation':
            for span in matched:add(rule,span,'Evidence Gap','This claim needs evidence','The approved support register maps this claim as unsupported. This is Unverified, not a verdict that it is false. Supply approved evidence or remove the claim.')
        elif kind=='banned':
            for span in matched:add(rule,span,'Verified Contradiction','Restricted wording',f'The approved rule prohibits “{rule.value}”.',cfg.get('replacement',''))
        elif kind=='required' and rule.value.casefold() not in text.casefold():
            add(rule,(len(text),len(text)),'Verified Contradiction','Required message missing',f'Include the approved message “{rule.value}”.',rule.value)
    # Unknown quantified guarantees get uncertainty, never an inferred false verdict.
    for m in re.finditer(r'\b(?:guarantee\w*|fastest|best|#1)\b[^.!?]{0,90}',text,re.I):
        if not any(a<=m.start()<b for a,b in mapped_guarantees):
            add(None,m.span(),'Low Confidence','Confirm this claim’s support','This claim has no confirmed mapping in the checked register. A reviewer must establish its support. No factual verdict is made.')
    # Conflicting applicable approved facts invalidate deterministic factual verdicts.
    groups={}
    for rule in rules:
        if applies(rule,subject,channel) and rule.kind=='number' and current(sources[rule.source_id]):
            groups.setdefault((rule.subject,rule.config.get('metric'),rule.config.get('qualifier','')),[]).append(rule)
    for group in groups.values():
        if len({r.value for r in group})>1:
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
