from pathlib import Path
p=Path(__file__).resolve().parents[1]/'app/page.tsx'
s=p.read_text(encoding='utf-8')
for old,new in [
 ("source?'Publish a source revision'", "source?.id?'Publish a source revision'"),
 ("source?'Publish revision'", "source?.id?'Publish revision'"),
 ("(source?'/'+source.id:'')", "(source?.id?'/'+source.id:'')"),
 ("source?'PUT':'POST'", "source?.id?'PUT':'POST'"),
 ('{manager&&<button className="button" onClick={()=>sourceForm()}><Plus size={16}/>Register source</button>}', '{manager&&<div className="editor-actions" style={{marginTop:0}}><button className="button" onClick={()=>setModal({title:"Import approved material",body:<DocumentImport onExtract={r=>sourceForm({...r,id:"",code:"",owner:data.user.name,status:"approved",review_date:""})}/>})}><Upload size={16}/>Import document</button><button className="button" onClick={()=>sourceForm()}><Plus size={16}/>Register source</button></div>}')
]:
    assert old in s,old
    s=s.replace(old,new)
s+='''
function DocumentImport({onExtract}:{onExtract:(record:Row)=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><p className="form-note">Extract text from a PDF, DOCX, TXT or Markdown file, then review it before approval. Maximum 5 MB, 20 PDF pages and 12,000 extracted characters. Scanned PDFs need OCR, which is not enabled.</p><label className="upload-zone"><Upload size={28}/><b>{busy?'Reading document…':'Choose a document'}</b><span>Files are processed locally by your API and are not retained.</span><input type="file" accept=".pdf,.docx,.txt,.md" aria-label="Document to extract" disabled={busy} onChange={async e=>{if(!e.target.files?.[0])return;setBusy(true);setError('');const body=new FormData();body.append('file',e.target.files[0]);try{onExtract(await api('/sources/extract','POST',body))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}/></label>{error&&<div className="error" role="alert">{error}</div>}</div>
}
'''
p.write_text(s,encoding='utf-8')
print('Document import connected to source review.')
