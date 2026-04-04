// ─── INSTALLATION ────────────────────────────────────────────────
// npm install @supabase/supabase-js
// Variables Vercel : VITE_SUPABASE_URL  /  VITE_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── DESIGN TOKENS ───────────────────────────────────────────────
const C = {
  bg:"#06060a", surf:"#0e0e14", card:"#13131a", card2:"#18181f",
  border:"#1e1e28", border2:"#26262f", red:"#e8392a", redDim:"#b82e20",
  orange:"#f07320", green:"#16a34a", greenL:"#22c55e",
  blue:"#2563eb", blueL:"#3b82f6", purple:"#7c3aed", purpleL:"#a855f7",
  yellow:"#ca8a04", yellowL:"#eab308",
  text:"#e8e6e1", text2:"#a8a5a0", muted:"#5e5b56", faint:"#1c1c24",
};
const CAT_COLORS = ["#e8392a","#f07320","#eab308","#22c55e","#3b82f6","#a855f7"];
const LABELS = ["A","B","C","D"];
const DOC_TYPES = [
  { key:"source",     label:"Sources",     icon:"🔗", color:C.blueL },
  { key:"fiche_memo", label:"Fiches mémo", icon:"📋", color:C.purpleL },
];
const EXAM_COUNTS = [10, 20, 30, 50];
const TIMER_DEFAULT = 30; // secondes par question

// ─── TRADUCTION ERREURS AUTH ──────────────────────────────────────
const AUTH_ERRORS = {
  "Invalid login credentials":"Email ou mot de passe incorrect.",
  "Email not confirmed":"Confirmez votre email avant de vous connecter.",
  "User already registered":"Un compte existe déjà avec cet email.",
  "Password should be at least 6 characters":"Mot de passe trop court (min. 6 caractères).",
  "Unable to validate email address: invalid format":"Format d'email invalide.",
  "signup is disabled":"Les inscriptions sont désactivées.",
  "Email rate limit exceeded":"Trop de tentatives. Réessayez dans quelques minutes.",
  "New password should be different from the old password":"Le nouveau mot de passe doit être différent de l'ancien.",
};
const tr = msg => AUTH_ERRORS[msg] || msg;

// ─── HELPERS ─────────────────────────────────────────────────────
const fmtDate = ts => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const timeAgo = ts => {
  const s = Math.floor((Date.now()-new Date(ts).getTime())/1000);
  if(s<60) return "À l'instant";
  if(s<3600) return `il y a ${Math.floor(s/60)} min`;
  if(s<86400) return `il y a ${Math.floor(s/3600)}h`;
  return `il y a ${Math.floor(s/86400)}j`;
};
const pct2col = p => p>=70 ? C.greenL : p>=50 ? C.orange : C.red;
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));

// ─── SYSTÈME DE BADGES ───────────────────────────────────────────
const BADGES = [
  { id:"first",     icon:"🔰", name:"Recrue",         desc:"1er questionnaire complété",          color:"#6b7280", check:(s)=>s.total>=1 },
  { id:"quiz5",     icon:"📋", name:"Stagiaire",       desc:"5 questionnaires complétés",          color:"#a8966a", check:(s)=>s.total>=5 },
  { id:"quiz20",    icon:"🎖️", name:"Sapeur",          desc:"20 questionnaires complétés",         color:"#b45309", check:(s)=>s.total>=20 },
  { id:"quiz50",    icon:"🏅", name:"Caporal",         desc:"50 questionnaires complétés",         color:"#94a3b8", check:(s)=>s.total>=50 },
  { id:"quiz100",   icon:"⭐", name:"Sergent",         desc:"100 questionnaires complétés",        color:"#eab308", check:(s)=>s.total>=100 },
  { id:"c100",      icon:"✅", name:"Centurion",       desc:"100 bonnes réponses au total",        color:"#22c55e", check:(s)=>s.correct>=100 },
  { id:"c500",      icon:"🎯", name:"Tireur d'élite",  desc:"500 bonnes réponses au total",        color:"#16a34a", check:(s)=>s.correct>=500 },
  { id:"avg70",     icon:"📈", name:"Compétent",       desc:"Moyenne générale ≥ 70%",              color:"#3b82f6", check:(s)=>s.avg>=70&&s.total>=3 },
  { id:"avg85",     icon:"🔥", name:"Expert",          desc:"Moyenne générale ≥ 85%",              color:"#f07320", check:(s)=>s.avg>=85&&s.total>=5 },
  { id:"avg95",     icon:"💎", name:"Maître",          desc:"Moyenne générale ≥ 95%",              color:"#e8392a", check:(s)=>s.avg>=95&&s.total>=10 },
  { id:"perfect",   icon:"🏆", name:"Sans faute",      desc:"Score parfait 100% sur un examen",   color:"#eab308", check:(s)=>s.perfect },
  { id:"poly",      icon:"🌐", name:"Polyvalent",      desc:"Examen dans toutes les catégories",   color:"#a855f7", check:(s,cats)=>cats.length>0&&s.uniqueCats>=cats.length },
];

const computeStats = results => ({
  total:    results.length,
  correct:  results.reduce((a,r)=>a+(r.score||0),0),
  avg:      results.length ? Math.round(results.reduce((a,r)=>a+r.pct,0)/results.length) : 0,
  perfect:  results.some(r=>r.pct===100),
  uniqueCats: new Set(results.map(r=>r.cat_id).filter(Boolean)).size,
});
const getUnlocked = (results, cats) => {
  const s = computeStats(results);
  return BADGES.filter(b=>b.check(s, cats));
};

// ─── COMPOSANTS UI ───────────────────────────────────────────────
const FL = ({children}) => (
  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,fontFamily:"'Barlow',sans-serif"}}>{children}</label>
);

const Field = ({value,onChange,placeholder,type="text",rows,onKeyDown,autoFocus,disabled}) => {
  const s = {width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"11px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none",boxSizing:"border-box",transition:"border-color 0.2s",opacity:disabled?0.6:1};
  if(rows) return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} disabled={disabled} style={{...s,resize:"vertical"}}/>;
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus} disabled={disabled} style={s}/>;
};

const Btn = ({onClick,children,color=C.red,disabled,full,ghost,sm,danger}) => {
  const bg = danger ? "#3a0e0a" : ghost ? "transparent" : disabled ? "#16161c" : color;
  const col = danger ? C.red : ghost ? C.muted : disabled ? "#40404a" : (color===C.greenL||color===C.green?"#000":"#fff");
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:full?"100%":undefined, background:bg, color:col,
      border:ghost?`1px solid ${C.border2}`:danger?`1px solid #5a1e18`:"none",
      borderRadius:4, padding:sm?"5px 14px":"11px 24px",
      cursor:disabled?"default":"pointer", fontWeight:700, fontSize:sm?12:14,
      fontFamily:"'Barlow',sans-serif", transition:"all 0.15s",
      boxShadow:(!ghost&&!disabled&&!danger)?`0 2px 12px ${color}33`:"none",
      display:"inline-flex", alignItems:"center", gap:6,
    }}>{children}</button>
  );
};

const ScorePill = ({pct,lg}) => {
  const col = pct2col(pct);
  return <span style={{fontSize:lg?26:13,padding:lg?"8px 18px":"3px 10px",color:col,border:`1px solid ${col}44`,borderRadius:4,fontFamily:"Oswald,sans-serif",fontWeight:700,background:col+"14"}}>{pct}%</span>;
};

const Topbar = ({title,back,right}) => (
  <div style={{background:C.surf+"ee",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:56,position:"sticky",top:0,zIndex:100,backdropFilter:"blur(12px)"}}>
    <div style={{display:"flex",alignItems:"center",gap:12}}>
      {back&&<button onClick={back} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:"4px 8px 4px 0",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>←</button>}
      <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,letterSpacing:3,textTransform:"uppercase"}}>{title}</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8}}>{right}</div>
  </div>
);

const Wrap = ({children}) => <div style={{fontFamily:"'Barlow',sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>{children}</div>;

const ErrBox = ({msg}) => msg?<div style={{color:"#fca5a5",fontSize:13,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.25)",borderRadius:4,padding:"10px 14px",marginBottom:12,lineHeight:1.5}}>{msg}</div>:null;
const OkBox  = ({msg}) => msg?<div style={{color:"#86efac",fontSize:13,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.25)",borderRadius:4,padding:"10px 14px",marginBottom:12}}>{msg}</div>:null;

const StatCard = ({label,value,sub,color=C.text}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"18px 20px",textAlign:"center"}}>
    <div style={{fontFamily:"Oswald,sans-serif",fontSize:32,fontWeight:700,color,lineHeight:1}}>{value}</div>
    {sub&&<div style={{color:C.muted,fontSize:11,marginTop:4}}>{sub}</div>}
    <div style={{color:C.text2,fontSize:12,marginTop:6}}>{label}</div>
  </div>
);

const BadgeCard = ({badge,unlocked}) => (
  <div title={badge.desc} style={{background:unlocked?C.card:C.surf,border:`1px solid ${unlocked?badge.color+"44":C.border}`,borderRadius:6,padding:"14px",textAlign:"center",opacity:unlocked?1:0.4,transition:"all 0.2s",position:"relative",overflow:"hidden"}}>
    {unlocked&&<div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 0%, ${badge.color}18 0%, transparent 60%)`}}/>}
    <div style={{fontSize:28,marginBottom:8}}>{badge.icon}</div>
    <div style={{fontSize:11,fontWeight:700,color:unlocked?badge.color:C.muted,fontFamily:"Oswald,sans-serif",letterSpacing:1,textTransform:"uppercase"}}>{badge.name}</div>
    <div style={{fontSize:10,color:C.muted,marginTop:4,lineHeight:1.4}}>{badge.desc}</div>
    {unlocked&&<div style={{marginTop:8,width:6,height:6,borderRadius:"50%",background:badge.color,margin:"8px auto 0",boxShadow:`0 0 8px ${badge.color}`}}/>}
  </div>
);

// ─── FORMULAIRES ─────────────────────────────────────────────────
function QForm({initial,cats,qs,onSave,onCancel,saving,saveErr}) {
  const [q,setQ] = useState(initial);
  const valid = q.text?.trim()&&q.catId&&q.opts?.every(o=>o?.trim());
  return (
    <div style={{maxWidth:700}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onCancel} style={{background:C.card,border:`1px solid ${C.border2}`,color:C.text2,cursor:"pointer",width:34,height:34,borderRadius:4,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:18,letterSpacing:2,textTransform:"uppercase",margin:0}}>{qs.some(x=>x.id===initial?.id)?"Éditer la question":"Nouvelle question"}</h2>
      </div>
      <ErrBox msg={saveErr}/>
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div><FL>Catégorie *</FL>
          <select value={q.catId} onChange={e=>setQ(x=>({...x,catId:e.target.value}))} style={{width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"11px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none"}}>
            {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><FL>Intitulé de la question *</FL><Field value={q.text||""} onChange={e=>setQ(x=>({...x,text:e.target.value}))} placeholder="Saisissez votre question..." rows={3}/></div>
        <div>
          <FL>Options — cliquez la lettre pour définir la bonne réponse *</FL>
          {(q.opts||[]).map((opt,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}>
              <button onClick={()=>setQ(x=>({...x,correct:i}))} style={{width:36,height:36,flexShrink:0,border:`2px solid ${q.correct===i?C.greenL:C.border2}`,borderRadius:4,background:q.correct===i?"#0a2214":"transparent",color:q.correct===i?C.greenL:C.muted,fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.15s"}}>{LABELS[i]}</button>
              <input value={opt||""} onChange={e=>{const o=[...q.opts];o[i]=e.target.value;setQ(x=>({...x,opts:o}));}} placeholder={`Réponse ${LABELS[i]}`} style={{flex:1,background:C.surf,border:`1px solid ${q.correct===i?"#1a4a28":C.border2}`,borderRadius:4,color:C.text,padding:"10px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none"}}/>
            </div>
          ))}
        </div>
        <div><FL>Explication (optionnel)</FL><Field value={q.expl||""} onChange={e=>setQ(x=>({...x,expl:e.target.value}))} placeholder="Affichée après la réponse..." rows={2}/></div>
        <div style={{display:"flex",gap:12}}><Btn onClick={()=>valid&&onSave(q)} disabled={!valid||saving} color={C.greenL}>{saving?"Enregistrement...":"✓ Enregistrer"}</Btn><Btn onClick={onCancel} ghost>Annuler</Btn></div>
      </div>
    </div>
  );
}

function CatForm({initial,cats,onSave,onCancel,saving,saveErr}) {
  const [cat,setCat] = useState(initial);
  const valid = cat.name?.trim();
  return (
    <div style={{maxWidth:500}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onCancel} style={{background:C.card,border:`1px solid ${C.border2}`,color:C.text2,cursor:"pointer",width:34,height:34,borderRadius:4,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:18,letterSpacing:2,textTransform:"uppercase",margin:0}}>{cats.some(c=>c.id===initial?.id)?"Éditer":"Nouvelle catégorie"}</h2>
      </div>
      <ErrBox msg={saveErr}/>
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div><FL>Nom *</FL><Field value={cat.name||""} onChange={e=>setCat(x=>({...x,name:e.target.value}))} placeholder="Ex : Sécurité incendie"/></div>
        <div><FL>Description</FL><Field value={cat.desc||""} onChange={e=>setCat(x=>({...x,desc:e.target.value}))} placeholder="Courte description..."/></div>
        <div><FL>Couleur</FL>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {CAT_COLORS.map(col=><div key={col} onClick={()=>setCat(x=>({...x,color:col}))} style={{width:40,height:40,borderRadius:6,background:col,cursor:"pointer",border:cat.color===col?"3px solid #fff":"3px solid transparent",boxSizing:"border-box",transition:"all 0.15s",boxShadow:cat.color===col?`0 0 12px ${col}88`:"none"}}/>)}
          </div>
        </div>
        <div style={{display:"flex",gap:12}}><Btn onClick={()=>valid&&onSave(cat)} disabled={!valid||saving} color={C.greenL}>{saving?"Enregistrement...":"✓ Enregistrer"}</Btn><Btn onClick={onCancel} ghost>Annuler</Btn></div>
      </div>
    </div>
  );
}

function DocForm({initial,cats,docs,onSave,onCancel,saving,saveErr}) {
  const [d,setD]   = useState(initial);
  const [file,setFile] = useState(null);
  const [upl,setUpl]   = useState(false);
  const fileRef = useRef();
  const valid = d.title?.trim()&&d.catId&&d.type;
  return (
    <div style={{maxWidth:600}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onCancel} style={{background:C.card,border:`1px solid ${C.border2}`,color:C.text2,cursor:"pointer",width:34,height:34,borderRadius:4,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:18,letterSpacing:2,textTransform:"uppercase",margin:0}}>{docs.some(x=>x.id===initial?.id)?"Éditer le document":"Nouveau document"}</h2>
      </div>
      <ErrBox msg={saveErr}/>
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div><FL>Catégorie *</FL>
          <select value={d.catId} onChange={e=>setD(x=>({...x,catId:e.target.value}))} style={{width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"11px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none"}}>
            {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><FL>Type *</FL>
          <div style={{display:"flex",gap:10}}>
            {DOC_TYPES.map(t=>(
              <button key={t.key} onClick={()=>setD(x=>({...x,type:t.key}))} style={{flex:1,background:d.type===t.key?t.color+"20":"transparent",color:d.type===t.key?t.color:C.muted,border:`1px solid ${d.type===t.key?t.color:C.border2}`,borderRadius:4,padding:"10px 14px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,transition:"all 0.15s"}}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <div><FL>Titre *</FL><Field value={d.title||""} onChange={e=>setD(x=>({...x,title:e.target.value}))} placeholder="Ex : Référentiel national secours"/></div>
        <div><FL>Description (optionnel)</FL><Field value={d.description||""} onChange={e=>setD(x=>({...x,description:e.target.value}))} placeholder="Courte description..." rows={2}/></div>
        <div><FL>Fichier ou lien</FL>
          <div onClick={()=>fileRef.current.click()} style={{border:`2px dashed ${file?C.greenL:C.border2}`,borderRadius:4,padding:"18px",textAlign:"center",cursor:"pointer",marginBottom:12,background:file?"#081e1044":"transparent",transition:"all 0.2s"}}>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={e=>{const f=e.target.files[0];if(f){setFile(f);setD(x=>({...x,url:""}));}}} style={{display:"none"}}/>
            {file?<span style={{color:C.greenL,fontSize:13}}>📄 {file.name}</span>:<span style={{color:C.muted,fontSize:13}}>📁 Cliquer pour uploader un fichier (PDF, image…)</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:12}}>ou</span><div style={{flex:1,height:1,background:C.border}}/></div>
          <Field value={d.url||""} onChange={e=>{setD(x=>({...x,url:e.target.value}));setFile(null);}} placeholder="Coller un lien (Google Drive, site web…)"/>
        </div>
        <div style={{display:"flex",gap:12}}><Btn onClick={()=>valid&&onSave(d,file,setUpl)} disabled={!valid||saving||upl} color={C.greenL}>{upl?"Upload en cours...":(saving?"Enregistrement...":"✓ Enregistrer")}</Btn><Btn onClick={onCancel} ghost>Annuler</Btn></div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ───────────────────────────────────────────────
export default function App() {
  const [page,setPage]           = useState("boot");
  const [user,setUser]           = useState(null);
  const [isAdmin,setIsAdmin]     = useState(false);
  const [pseudo,setPseudo]       = useState("");

  const [cats,setCats]           = useState([]);
  const [qs,setQs]               = useState([]);
  const [docs,setDocs]           = useState([]);
  const [myResults,setMyResults] = useState([]);
  const [allResults,setAllResults] = useState([]);
  const [wrongIds,setWrongIds]   = useState(new Set()); // IDs questions ratées

  // Auth
  const [authMode,setAuthMode] = useState("login");
  const [aEmail,setAEmail]     = useState("");
  const [aPw,setAPw]           = useState("");
  const [aPseudo,setAPseudo]   = useState("");
  const [aErr,setAErr]         = useState("");
  const [aBusy,setABusy]       = useState(false);

  // Admin
  const [adminTab,setAdminTab]       = useState("qs");
  const [editQ,setEditQ]             = useState(null);
  const [editCat,setEditCat]         = useState(null);
  const [editDoc,setEditDoc]         = useState(null);
  const [delConfirm,setDelConfirm]   = useState(null);
  const [saving,setSaving]           = useState(false);
  const [saveErr,setSaveErr]         = useState("");
  const [classFilter,setClassFilter] = useState("all");

  // Resources
  const [resCat,setResCat] = useState("all");

  // Settings
  const [newPseudo,setNewPseudo] = useState(""); const [pseudoOk,setPseudoOk] = useState(false);
  const [newPw,setNewPw]         = useState(""); const [newPw2,setNewPw2] = useState("");
  const [pwOk,setPwOk]           = useState(false); const [pwErr,setPwErr] = useState("");

  // Exam
  const [examCat,setExamCat]     = useState(null);
  const [examMode,setExamMode]   = useState("cat");   // "cat" | "all" | "revision"
  const [examList,setExamList]   = useState([]);
  const [examIdx,setExamIdx]     = useState(0);
  const [picked,setPicked]       = useState(null);
  const [shown,setShown]         = useState(false);
  const [log,setLog]             = useState([]);
  const answersRef               = useRef([]);

  // Pre-exam config
  const [preExam,setPreExam]     = useState(null);  // { cat, mode }
  const [examCount,setExamCount] = useState(20);
  const [timerOn,setTimerOn]     = useState(false);
  const [timeLeft,setTimeLeft]   = useState(TIMER_DEFAULT);
  const timerRef                 = useRef(null);

  // New badges after exam
  const [newBadges,setNewBadges] = useState([]);

  // ── BOOT ─────────────────────────────────────────────────────
  useEffect(()=>{
    // Fonts
    if(!document.querySelector("#gf-sp")){
      const l=document.createElement("link");l.id="gf-sp";l.rel="stylesheet";
      l.href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@300;400;500;600;700&display=swap";
      document.head.appendChild(l);
    }
    // ① Vérifier session existante d'abord (corrige le bug "toujours sur auth")
    sb.auth.getSession().then(({data:{session}})=>{
      if(session?.user) onSession(session.user);
      else setPage("auth");
    });
    // ② Écouter les changements ensuite
    const {data:{subscription}} = sb.auth.onAuthStateChange(async(event,session)=>{
      if(event==="SIGNED_OUT"){ setUser(null);setIsAdmin(false);setPseudo("");setPage("auth"); }
      else if(event==="SIGNED_IN"&&session?.user){ await onSession(session.user); }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  // Timer
  useEffect(()=>{
    if(page!=="exam"||!timerOn||shown) return;
    setTimeLeft(TIMER_DEFAULT);
    timerRef.current = setInterval(()=>{
      setTimeLeft(t=>{
        if(t<=1){ clearInterval(timerRef.current); if(picked===null) setPicked(-1); return 0; }
        return t-1;
      });
    },1000);
    return ()=>clearInterval(timerRef.current);
  },[examIdx,page,timerOn]);

  useEffect(()=>{
    if(timerOn&&shown) clearInterval(timerRef.current);
  },[shown]);

  // Auto-validate quand timer expire
  useEffect(()=>{
    if(timerOn&&timeLeft===0&&!shown) doValidate(-1);
  },[timeLeft]);

  // Avertissement quitter examen
  useEffect(()=>{
    if(page==="exam"){
      const h = e=>{ e.preventDefault(); e.returnValue=""; };
      window.addEventListener("beforeunload",h);
      return ()=>window.removeEventListener("beforeunload",h);
    }
  },[page]);

  // ── SESSION ──────────────────────────────────────────────────
  const onSession = async u=>{
    setUser(u);
    const {data:prof} = await sb.from("profiles").select("*").eq("id",u.id).single();
    if(prof){ setIsAdmin(prof.is_admin); setPseudo(prof.pseudo||u.email.split("@")[0]); }
    await Promise.all([loadData(),loadMyResults(u.id)]);
    setPage("home");
  };

  const loadData = async()=>{
    const [cR,qR,dR] = await Promise.all([
      sb.from("categories").select("*").order("created_at"),
      sb.from("questions").select("*").order("created_at"),
      sb.from("documents").select("*").order("created_at"),
    ]);
    if(cR.data) setCats(cR.data.map(c=>({id:c.id,name:c.name,desc:c.description,color:c.color})));
    if(qR.data) setQs(qR.data.map(q=>({id:q.id,catId:q.cat_id,text:q.text,opts:q.options,correct:q.correct_index,expl:q.explanation})));
    if(dR.data) setDocs(dR.data.map(d=>({id:d.id,catId:d.cat_id,title:d.title,type:d.type,description:d.description,url:d.url})));
  };

  const loadMyResults = async uid=>{
    const {data} = await sb.from("results").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(data) setMyResults(data);
    // Charger les questions ratées depuis localStorage
    try{
      const stored = JSON.parse(localStorage.getItem(`wrong_${uid}`)||"[]");
      setWrongIds(new Set(stored));
    }catch{}
  };

  const loadAllResults = async()=>{
    const {data} = await sb.from("results").select("*").order("created_at",{ascending:false}).limit(500);
    if(data) setAllResults(data);
  };

  // ── AUTH ─────────────────────────────────────────────────────
  const doAuth = async()=>{
    setAErr(""); setABusy(true);
    try{
      if(authMode==="login"){
        const {error} = await sb.auth.signInWithPassword({email:aEmail,password:aPw});
        if(error) setAErr(tr(error.message));
      } else {
        if(!aPseudo.trim()){setAErr("Veuillez entrer un prénom ou pseudo.");setABusy(false);return;}
        const {data,error} = await sb.auth.signUp({email:aEmail,password:aPw,options:{data:{pseudo:aPseudo.trim()}}});
        if(error) setAErr(tr(error.message));
        else if(!data.session) setAErr("✓ Compte créé ! Connectez-vous maintenant.");
      }
    }catch(e){setAErr(tr(e.message));}
    setABusy(false);
  };

  const doLogout = ()=>sb.auth.signOut();

  // ── CRUD ─────────────────────────────────────────────────────
  const saveCat = async data=>{
    setSaving(true);setSaveErr("");
    const payload={name:data.name,description:data.desc||"",color:data.color};
    if(cats.some(c=>c.id===data.id)){
      const {error} = await sb.from("categories").update(payload).eq("id",data.id);
      if(!error){setCats(p=>p.map(c=>c.id===data.id?{...c,...data}:c));setEditCat(null);}
      else setSaveErr(error.message);
    } else {
      const {data:nc,error} = await sb.from("categories").insert(payload).select().single();
      if(!error&&nc){setCats(p=>[...p,{id:nc.id,name:nc.name,desc:nc.description,color:nc.color}]);setEditCat(null);}
      else setSaveErr(error?.message||"Erreur");
    }
    setSaving(false);
  };
  const deleteCat = async id=>{
    const {error} = await sb.from("categories").delete().eq("id",id);
    if(!error){setCats(p=>p.filter(c=>c.id!==id));setQs(p=>p.filter(q=>q.catId!==id));setDocs(p=>p.filter(d=>d.catId!==id));setDelConfirm(null);}
  };
  const saveQ = async data=>{
    setSaving(true);setSaveErr("");
    const payload={cat_id:data.catId,text:data.text,options:data.opts,correct_index:data.correct,explanation:data.expl||""};
    if(qs.some(q=>q.id===data.id)){
      const {error} = await sb.from("questions").update(payload).eq("id",data.id);
      if(!error){setQs(p=>p.map(q=>q.id===data.id?{...q,...data}:q));setEditQ(null);}
      else setSaveErr(error.message);
    } else {
      const {data:nq,error} = await sb.from("questions").insert(payload).select().single();
      if(!error&&nq){setQs(p=>[...p,{id:nq.id,catId:nq.cat_id,text:nq.text,opts:nq.options,correct:nq.correct_index,expl:nq.explanation}]);setEditQ(null);}
      else setSaveErr(error?.message||"Erreur");
    }
    setSaving(false);
  };
  const deleteQ = async id=>{
    const {error} = await sb.from("questions").delete().eq("id",id);
    if(!error){setQs(p=>p.filter(q=>q.id!==id));setDelConfirm(null);}
  };
  const saveDoc = async(data,file,setUploading)=>{
    setSaving(true);setSaveErr("");
    let finalUrl=data.url||"";
    if(file){
      setUploading(true);
      const ext=file.name.split(".").pop();
      const path=`${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const {data:up,error:upErr} = await sb.storage.from("documents").upload(path,file);
      if(upErr){setSaveErr("Erreur upload : "+upErr.message);setSaving(false);setUploading(false);return;}
      const {data:{publicUrl}} = sb.storage.from("documents").getPublicUrl(up.path);
      finalUrl=publicUrl;setUploading(false);
    }
    const payload={cat_id:data.catId,title:data.title,type:data.type,description:data.description||"",url:finalUrl};
    if(docs.some(d=>d.id===data.id)){
      const {error} = await sb.from("documents").update(payload).eq("id",data.id);
      if(!error){setDocs(p=>p.map(d=>d.id===data.id?{...d,...data,url:finalUrl}:d));setEditDoc(null);}
      else setSaveErr(error.message);
    } else {
      const {data:nd,error} = await sb.from("documents").insert(payload).select().single();
      if(!error&&nd){setDocs(p=>[...p,{id:nd.id,catId:nd.cat_id,title:nd.title,type:nd.type,description:nd.description,url:nd.url}]);setEditDoc(null);}
      else setSaveErr(error?.message||"Erreur");
    }
    setSaving(false);
  };
  const deleteDoc = async id=>{
    const {error} = await sb.from("documents").delete().eq("id",id);
    if(!error){setDocs(p=>p.filter(d=>d.id!==id));setDelConfirm(null);}
  };

  // ── EXAM ─────────────────────────────────────────────────────
  const openPreExam = (cat,mode="cat")=>{ setPreExam({cat,mode}); setExamCount(20); setTimerOn(false); };

  const startExam = ()=>{
    if(!preExam) return;
    const {cat,mode} = preExam;
    let pool = [];
    if(mode==="cat")      pool = qs.filter(q=>q.catId===cat.id);
    else if(mode==="all") pool = [...qs];
    else if(mode==="revision") pool = qs.filter(q=>wrongIds.has(q.id));

    if(!pool.length) return;
    const shuffled = pool.sort(()=>Math.random()-0.5).slice(0,examCount);
    answersRef.current=[];
    setExamCat(cat); setExamMode(mode); setExamList(shuffled);
    setExamIdx(0); setPicked(null); setShown(false); setLog([]);
    setPreExam(null);
    setPage("exam");
  };

  const doValidate = (forcePick=null)=>{
    const choice = forcePick!==null ? forcePick : picked;
    if(choice===null) return;
    const isCorrect = choice===examList[examIdx].correct;
    const entry={correct:isCorrect,picked:choice,qId:examList[examIdx].id};
    answersRef.current=[...answersRef.current,entry];
    setLog([...answersRef.current]);
    setShown(true);
    clearInterval(timerRef.current);
  };

  const validate = ()=>doValidate();

  const nextQ = async()=>{
    if(examIdx+1>=examList.length){
      // Calcul résultat
      const answers=answersRef.current;
      const sc=answers.filter(x=>x.correct).length;
      const pct=Math.round((sc/examList.length)*100);
      // Sauvegarder mauvaises réponses dans localStorage
      const newWrong = new Set(wrongIds);
      answers.forEach(a=>{ if(!a.correct) newWrong.add(a.qId); else newWrong.delete(a.qId); });
      setWrongIds(newWrong);
      try{ localStorage.setItem(`wrong_${user.id}`,JSON.stringify([...newWrong])); }catch{}
      // Sauvegarder en DB
      await sb.from("results").insert({
        user_id:user.id, pseudo,
        cat_id: examMode==="all" ? null : examCat?.id,
        cat_name: examMode==="all" ? "Toutes catégories" : examMode==="revision" ? "Mode révision" : examCat?.name,
        color: examMode==="all" ? "#e8392a" : examCat?.color,
        score:sc, total:examList.length, pct
      });
      // Détecter nouveaux badges
      const oldBadges = getUnlocked(myResults,cats).map(b=>b.id);
      const newRes = [...myResults,{score:sc,total:examList.length,pct,cat_id:examCat?.id}];
      const newUnlocked = getUnlocked(newRes,cats).filter(b=>!oldBadges.includes(b.id));
      setNewBadges(newUnlocked);
      await loadMyResults(user.id);
      setPage("results");
    } else {
      setExamIdx(i=>i+1); setPicked(null); setShown(false);
    }
  };

  // ── SETTINGS ─────────────────────────────────────────────────
  const savePseudo = async()=>{
    if(!newPseudo.trim()) return;
    const {error} = await sb.from("profiles").update({pseudo:newPseudo.trim()}).eq("id",user.id);
    if(!error){setPseudo(newPseudo.trim());setNewPseudo("");setPseudoOk(true);setTimeout(()=>setPseudoOk(false),3000);}
  };
  const savePw = async()=>{
    setPwErr("");
    if(newPw.length<6){setPwErr("Minimum 6 caractères.");return;}
    if(newPw!==newPw2){setPwErr("Les mots de passe ne correspondent pas.");return;}
    const {error} = await sb.auth.updateUser({password:newPw});
    if(!error){setNewPw("");setNewPw2("");setPwOk(true);setTimeout(()=>setPwOk(false),3000);}
    else setPwErr(tr(error.message));
  };

  // ─────────────────────────────────────────────────────────────
  //  PAGES
  // ─────────────────────────────────────────────────────────────

  if(page==="boot") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16,filter:"drop-shadow(0 0 20px rgba(232,57,42,0.6))"}}>🔥</div>
        <div style={{fontFamily:"Oswald,sans-serif",color:C.red,letterSpacing:4,fontSize:14}}>CHARGEMENT...</div>
      </div>
    </div>
  );

  // ── AUTH ───────────────────────────────────────────────────
  if(page==="auth") return (
    <Wrap>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:`radial-gradient(ellipse at 50% 0%, rgba(232,57,42,0.08) 0%, transparent 60%)`}}>
        <div style={{width:"100%",maxWidth:380}}>
          <div style={{textAlign:"center",marginBottom:40}}>
            <div style={{fontSize:60,marginBottom:16,filter:"drop-shadow(0 0 28px rgba(232,57,42,0.5))"}}>🔥</div>
            <h1 style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(24px,6vw,48px)",fontWeight:700,letterSpacing:5,textTransform:"uppercase",margin:"0 0 10px",color:C.text}}>SAPEURS-POMPIERS</h1>
            <div style={{fontFamily:"Oswald,sans-serif",color:C.red,letterSpacing:5,textTransform:"uppercase",fontSize:11}}>Plateforme QCM · Formation</div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${C.red}`,borderRadius:8,padding:"36px 32px",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{display:"flex",background:C.surf,borderRadius:6,padding:3,marginBottom:28}}>
              {[["login","Connexion"],["register","Inscription"]].map(([m,l])=>(
                <button key={m} onClick={()=>{setAuthMode(m);setAErr("");}} style={{flex:1,background:authMode===m?C.red:"transparent",color:authMode===m?"#fff":C.muted,border:"none",borderRadius:4,padding:"10px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,transition:"all 0.2s"}}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {authMode==="register"&&<div><FL>Prénom / Pseudo</FL><Field value={aPseudo} onChange={e=>setAPseudo(e.target.value)} placeholder="Jean Dupont" autoFocus/></div>}
              <div><FL>Email</FL><Field type="email" value={aEmail} onChange={e=>setAEmail(e.target.value)} placeholder="jean@exemple.fr" autoFocus={authMode==="login"}/></div>
              <div><FL>Mot de passe</FL><Field type="password" value={aPw} onChange={e=>setAPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doAuth()}/></div>
              {aErr&&<div style={{color:aErr.startsWith("✓")?"#86efac":"#fca5a5",fontSize:13,lineHeight:1.5,background:aErr.startsWith("✓")?"rgba(22,163,74,0.08)":"rgba(220,38,38,0.08)",border:`1px solid ${aErr.startsWith("✓")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.25)"}`,borderRadius:4,padding:"10px 12px"}}>{aErr}</div>}
              <Btn onClick={doAuth} disabled={aBusy||!aEmail||!aPw} full>{aBusy?"...":authMode==="login"?"SE CONNECTER →":"CRÉER MON COMPTE →"}</Btn>
            </div>
          </div>
        </div>
      </div>
    </Wrap>
  );

  // ── PRE-EXAM MODAL ─────────────────────────────────────────
  if(preExam) {
    const {cat,mode} = preExam;
    const pool = mode==="cat" ? qs.filter(q=>q.catId===cat?.id) : mode==="revision" ? qs.filter(q=>wrongIds.has(q.id)) : qs;
    const maxQ = pool.length;
    return (
      <Wrap>
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${mode==="revision"?C.orange:mode==="all"?C.purple:cat?.color||C.red}`,borderRadius:8,padding:"36px 32px",width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{marginBottom:28}}>
              <div style={{fontFamily:"Oswald,sans-serif",fontSize:20,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
                {mode==="all"?"🌐 Toutes les catégories":mode==="revision"?"🔄 Mode révision":cat?.name}
              </div>
              <div style={{color:C.muted,fontSize:14}}>{maxQ} question{maxQ!==1?"s":""} disponible{maxQ!==1?"s":""}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div>
                <FL>Nombre de questions</FL>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {EXAM_COUNTS.filter(n=>n<=maxQ).concat(maxQ>50?[]:[]).map(n=>(
                    <button key={n} onClick={()=>setExamCount(n)} style={{flex:1,minWidth:60,background:examCount===n?C.red:"transparent",color:examCount===n?"#fff":C.muted,border:`1px solid ${examCount===n?C.red:C.border2}`,borderRadius:4,padding:"9px",cursor:"pointer",fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:15,transition:"all 0.15s"}}>
                      {n}
                    </button>
                  ))}
                  {maxQ>0&&<button onClick={()=>setExamCount(maxQ)} style={{flex:1,minWidth:60,background:examCount===maxQ?C.red:"transparent",color:examCount===maxQ?"#fff":C.muted,border:`1px solid ${examCount===maxQ?C.red:C.border2}`,borderRadius:4,padding:"9px",cursor:"pointer",fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:13,transition:"all 0.15s"}}>Tout ({maxQ})</button>}
                </div>
              </div>
              <div>
                <FL>Chronomètre (optionnel)</FL>
                <button onClick={()=>setTimerOn(t=>!t)} style={{width:"100%",background:timerOn?"#1a1208":"transparent",color:timerOn?C.yellowL:C.muted,border:`1px solid ${timerOn?C.yellowL:C.border2}`,borderRadius:4,padding:"11px 16px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,transition:"all 0.15s",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span>⏱ {TIMER_DEFAULT}s par question</span>
                  <span style={{fontSize:11,background:timerOn?C.yellowL:C.faint,color:timerOn?"#000":C.muted,padding:"2px 10px",borderRadius:20}}>{timerOn?"ACTIVÉ":"DÉSACTIVÉ"}</span>
                </button>
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={startExam} disabled={maxQ===0} full>DÉMARRER →</Btn>
                <Btn onClick={()=>setPreExam(null)} ghost>Annuler</Btn>
              </div>
              {maxQ===0&&<div style={{color:C.orange,fontSize:13,textAlign:"center"}}>⚠ Aucune question disponible pour ce mode.</div>}
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── HOME ───────────────────────────────────────────────────
  if(page==="home"){
    const stats  = computeStats(myResults);
    const badges = getUnlocked(myResults,cats);
    return (
      <Wrap>
        <Topbar
          title={<><span style={{fontSize:16,marginRight:8}}>🔥</span>Sapeurs-Pompiers QCM</>}
          right={<>
            <span style={{color:C.muted,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
              <span style={{background:C.faint,width:26,height:26,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11}}>👤</span>
              <strong style={{color:C.text}}>{pseudo}</strong>
            </span>
            {myResults.length>0&&<Btn onClick={()=>setPage("history")} ghost sm>📊 Mon bilan</Btn>}
            <Btn onClick={()=>{setResCat("all");setPage("resources");}} ghost sm>📚 Ressources</Btn>
            {isAdmin&&<Btn onClick={()=>{setAdminTab("qs");setPage("admin");}} sm color={C.red}>⚙ Admin</Btn>}
            <button onClick={doLogout} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"'Barlow',sans-serif",padding:"4px 8px"}} onMouseEnter={e=>e.currentTarget.style.color=C.text2} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>Déco.</button>
          </>}
        />

        {/* Hero */}
        <div style={{background:`linear-gradient(150deg, rgba(232,57,42,0.12) 0%, rgba(6,6,10,0) 45%)`,borderBottom:`1px solid ${C.border}`,padding:"52px 24px 44px"}}>
          <div style={{maxWidth:700,margin:"0 auto",textAlign:"center"}}>
            <h1 style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(24px,5vw,48px)",fontWeight:700,letterSpacing:3,textTransform:"uppercase",margin:"0 0 12px"}}>Bonjour, {pseudo} 👋</h1>
            <p style={{color:C.text2,fontSize:15,fontWeight:300,maxWidth:420,margin:"0 auto",lineHeight:1.8}}>Testez et renforcez vos connaissances en choisissant une catégorie ci-dessous.</p>
            {stats.total>0&&(
              <div style={{display:"inline-flex",alignItems:"center",gap:20,marginTop:24,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 24px"}}>
                <div style={{textAlign:"center"}}><div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700,color:C.text}}>{stats.total}</div><div style={{color:C.muted,fontSize:11}}>examens</div></div>
                <div style={{width:1,height:30,background:C.border}}/>
                <div style={{textAlign:"center"}}><div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700,color:pct2col(stats.avg)}}>{stats.avg}%</div><div style={{color:C.muted,fontSize:11}}>moyenne</div></div>
                <div style={{width:1,height:30,background:C.border}}/>
                <div style={{textAlign:"center"}}><div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700,color:C.yellowL}}>{badges.length}</div><div style={{color:C.muted,fontSize:11}}>badges</div></div>
              </div>
            )}
          </div>
        </div>

        <div style={{maxWidth:960,margin:"0 auto",padding:"40px 24px"}}>
          {/* Modes spéciaux */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:36}}>
            <div onClick={()=>openPreExam(null,"all")} style={{background:`linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.08))`,border:`1px solid ${C.purpleL}44`,borderRadius:6,padding:"18px 20px",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:14}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.purpleL;e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.purpleL+"44";e.currentTarget.style.transform="none";}}>
              <span style={{fontSize:28}}>🌐</span>
              <div><div style={{fontFamily:"Oswald,sans-serif",fontSize:15,letterSpacing:1,color:C.purpleL}}>TOUTES CATÉGORIES</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>Questions mélangées</div></div>
            </div>
            {wrongIds.size>0&&(
              <div onClick={()=>openPreExam(null,"revision")} style={{background:`linear-gradient(135deg, rgba(240,115,32,0.15), rgba(240,115,32,0.05))`,border:`1px solid ${C.orange}44`,borderRadius:6,padding:"18px 20px",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:14}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.orange+"44";e.currentTarget.style.transform="none";}}>
                <span style={{fontSize:28}}>🔄</span>
                <div><div style={{fontFamily:"Oswald,sans-serif",fontSize:15,letterSpacing:1,color:C.orange}}>MES ERREURS</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{wrongIds.size} question{wrongIds.size>1?"s":""} à revoir</div></div>
              </div>
            )}
          </div>

          {/* Catégories */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <span style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted}}>Catégories</span>
            <span style={{color:C.muted,fontSize:12}}>{cats.length} disponible{cats.length!==1?"s":""}</span>
          </div>

          {cats.length===0?(
            <div style={{textAlign:"center",color:C.muted,padding:"80px 0"}}><div style={{fontSize:44,marginBottom:14}}>📋</div>{isAdmin?"Aucune catégorie — créez-en une dans l'admin.":"Aucune catégorie disponible."}</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,marginBottom:44}}>
              {cats.map(cat=>{
                const count=qs.filter(q=>q.catId===cat.id).length;
                const catRes=myResults.filter(r=>r.cat_id===cat.id);
                const best=catRes.length?Math.max(...catRes.map(r=>r.pct)):null;
                const avg2=catRes.length?Math.round(catRes.reduce((a,r)=>a+r.pct,0)/catRes.length):null;
                const ok=count>0;
                return (
                  <div key={cat.id} onClick={()=>ok&&openPreExam(cat,"cat")}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:6,padding:"20px",cursor:ok?"pointer":"default",opacity:ok?1:0.45,transition:"all 0.2s"}}
                    onMouseEnter={e=>{if(ok){e.currentTarget.style.background=C.card2;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${cat.color}44`;}}}
                    onMouseLeave={e=>{e.currentTarget.style.background=C.card;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                    <div style={{fontFamily:"Oswald,sans-serif",fontSize:17,fontWeight:600,marginBottom:6,letterSpacing:0.5}}>{cat.name}</div>
                    <div style={{color:C.text2,fontSize:13,fontWeight:300,marginBottom:16,lineHeight:1.6,minHeight:36}}>{cat.desc}</div>
                    {avg2!==null&&<div style={{background:C.bg,borderRadius:4,height:4,marginBottom:12,overflow:"hidden"}}><div style={{height:"100%",width:`${avg2}%`,background:pct2col(avg2),borderRadius:4,transition:"width 0.6s"}}/></div>}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:12,color:cat.color,fontWeight:600,background:cat.color+"18",border:`1px solid ${cat.color}44`,borderRadius:20,padding:"2px 10px"}}>{count} question{count!==1?"s":""}</span>
                      {best!==null?<ScorePill pct={best}/>:ok?<span style={{fontSize:10,color:C.muted,letterSpacing:2}}>COMMENCER ▶</span>:null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Badges */}
          {myResults.length>0&&(
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <span style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted}}>Mes badges</span>
                <span style={{color:C.muted,fontSize:12}}>{badges.length}/{BADGES.length} débloqués</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                {BADGES.map(b=><BadgeCard key={b.id} badge={b} unlocked={badges.some(u=>u.id===b.id)}/>)}
              </div>
            </div>
          )}
        </div>
      </Wrap>
    );
  }

  // ── RESOURCES ──────────────────────────────────────────────
  if(page==="resources"){
    const filtered = resCat==="all" ? docs : docs.filter(d=>d.catId===resCat);
    return (
      <Wrap>
        <Topbar title="📚 Ressources documentaires" back={()=>setPage("home")} right={<span style={{color:C.muted,fontSize:13}}>👤 {pseudo}</span>}/>
        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,padding:"12px 24px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setResCat("all")} style={{background:resCat==="all"?C.text:"transparent",color:resCat==="all"?C.bg:C.muted,border:`1px solid ${resCat==="all"?C.text:C.border2}`,borderRadius:20,padding:"5px 16px",cursor:"pointer",fontSize:13,fontFamily:"'Barlow',sans-serif",fontWeight:700,transition:"all 0.15s"}}>Toutes</button>
          {cats.map(cat=>(
            <button key={cat.id} onClick={()=>setResCat(cat.id)} style={{background:resCat===cat.id?cat.color:"transparent",color:resCat===cat.id?"#fff":C.muted,border:`1px solid ${resCat===cat.id?cat.color:C.border2}`,borderRadius:20,padding:"5px 16px",cursor:"pointer",fontSize:13,fontFamily:"'Barlow',sans-serif",fontWeight:600,transition:"all 0.15s"}}>
              {cat.name}
            </button>
          ))}
        </div>
        <div style={{maxWidth:960,margin:"0 auto",padding:"40px 24px"}}>
          {filtered.length===0?(
            <div style={{textAlign:"center",color:C.muted,padding:"80px 0"}}><div style={{fontSize:44,marginBottom:14}}>📂</div><div>{isAdmin?"Ajoutez des documents depuis le panneau admin.":"Aucun document disponible."}</div></div>
          ):(
            DOC_TYPES.map(type=>{
              const typeDocs=filtered.filter(d=>d.type===type.key);
              if(!typeDocs.length) return null;
              return (
                <div key={type.key} style={{marginBottom:44}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                    <div style={{width:3,height:20,background:type.color,borderRadius:2}}/>
                    <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,letterSpacing:3,textTransform:"uppercase",color:type.color}}>{type.icon} {type.label}</span>
                    <div style={{flex:1,height:1,background:C.border}}/>
                    <span style={{color:C.muted,fontSize:12}}>{typeDocs.length}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                    {typeDocs.map(doc=>{
                      const cat=cats.find(c=>c.id===doc.catId);
                      const isPdf=doc.url?.toLowerCase().includes(".pdf");
                      return (
                        <div key={doc.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"20px",display:"flex",flexDirection:"column",gap:12,transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=type.color+"66";e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="none";}}>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,color:type.color,background:type.color+"18",border:`1px solid ${type.color}33`,borderRadius:20,padding:"2px 10px",fontWeight:700}}>{type.icon} {type.label}</span>
                            {cat&&<span style={{fontSize:11,color:cat.color,background:cat.color+"18",border:`1px solid ${cat.color}33`,borderRadius:20,padding:"2px 10px",fontWeight:600}}>{cat.name}</span>}
                          </div>
                          <div style={{fontFamily:"Oswald,sans-serif",fontSize:16,fontWeight:500,lineHeight:1.4,flex:1}}>{doc.title}</div>
                          {doc.description&&<div style={{color:C.text2,fontSize:13,lineHeight:1.6}}>{doc.description}</div>}
                          {doc.url?(
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:8,background:type.color,color:"#fff",border:"none",borderRadius:4,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"'Barlow',sans-serif",textDecoration:"none",boxShadow:`0 2px 8px ${type.color}44`}}>
                              {isPdf?"📄 Ouvrir le PDF":"🔗 Ouvrir le lien"}
                            </a>
                          ):<span style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>Aucun lien</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Wrap>
    );
  }

  // ── HISTORY ────────────────────────────────────────────────
  if(page==="history"){
    const stats  = computeStats(myResults);
    const badges = getUnlocked(myResults,cats);
    return (
      <Wrap>
        <Topbar title="📊 Mon bilan" back={()=>setPage("home")} right={<span style={{color:C.muted,fontSize:13}}>👤 {pseudo}</span>}/>
        <div style={{maxWidth:820,margin:"0 auto",padding:"40px 24px"}}>
          {/* Stats globales */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:12}}>
            <StatCard label="Examens complétés"  value={stats.total}   color={C.blueL}/>
            <StatCard label="Score moyen général" value={`${stats.avg}%`} color={pct2col(stats.avg)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:32}}>
            <StatCard label="Bonnes réponses totales" value={stats.correct} color={C.greenL}/>
            <StatCard label="Badges débloqués"        value={`${badges.length}/${BADGES.length}`} color={C.yellowL}/>
          </div>

          {/* Progress par catégorie */}
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:16}}>Progression par catégorie</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:32}}>
            {cats.map(cat=>{
              const r2=myResults.filter(r=>r.cat_id===cat.id);
              if(!r2.length) return <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}44`,borderRadius:4,padding:"12px 16px",opacity:0.5}}><div style={{fontSize:13,color:C.muted}}>{cat.name} — aucun examen</div></div>;
              const ca=Math.round(r2.reduce((a,r)=>a+r.pct,0)/r2.length);
              return (
                <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:4,padding:"14px 18px",display:"flex",alignItems:"center",gap:16}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>{cat.name}</div>
                    <div style={{background:C.bg,borderRadius:99,height:5,overflow:"hidden"}}><div style={{height:"100%",width:`${ca}%`,background:pct2col(ca),borderRadius:99,transition:"width 0.6s"}}/></div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <ScorePill pct={ca}/>
                    <div style={{color:C.muted,fontSize:11,marginTop:4}}>{r2.length} tentative{r2.length>1?"s":""}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Badges */}
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:16}}>Badges</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:32}}>
            {BADGES.map(b=><BadgeCard key={b.id} badge={b} unlocked={badges.some(u=>u.id===b.id)}/>)}
          </div>

          {/* Historique */}
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:16}}>Historique détaillé</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {myResults.map(r=>(
              <div key={r.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:r.color||C.red,flexShrink:0}}/>
                  <div><div style={{fontSize:13,fontWeight:600}}>{r.cat_name}</div><div style={{color:C.muted,fontSize:11}}>{fmtDate(r.created_at)}</div></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{color:C.muted,fontSize:12}}>{r.score}/{r.total}</span>
                  <ScorePill pct={r.pct}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Wrap>
    );
  }

  // ── EXAM ───────────────────────────────────────────────────
  if(page==="exam"){
    const q=examList[examIdx];
    const isCorrect=picked===q.correct;
    const timerPct = timerOn ? (timeLeft/TIMER_DEFAULT)*100 : 100;
    const timerCol = timeLeft>15?C.greenL:timeLeft>5?C.orange:C.red;
    return (
      <Wrap>
        {/* Barre de progression */}
        <div style={{height:3,background:C.border}}>
          <div style={{height:"100%",background:C.red,width:`${((examIdx)/examList.length)*100}%`,transition:"width 0.4s ease"}}/>
        </div>
        {/* Timer */}
        {timerOn&&<div style={{height:3,background:C.border}}>
          <div style={{height:"100%",background:timerCol,width:`${timerPct}%`,transition:"width 1s linear"}}/>
        </div>}

        <div style={{maxWidth:680,margin:"0 auto",padding:"40px 24px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:44}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:examCat?.color||C.purple}}/>
              <span style={{color:C.text2,fontSize:13}}>
                {examMode==="all"?"Toutes catégories":examMode==="revision"?"Mode révision":examCat?.name}
              </span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              {timerOn&&<span style={{fontFamily:"Oswald,sans-serif",fontSize:16,color:timerCol,fontWeight:700,minWidth:28,textAlign:"center"}}>{timeLeft}</span>}
              <span style={{fontFamily:"Oswald,sans-serif",color:C.muted,fontSize:14,letterSpacing:1}}>{examIdx+1} / {examList.length}</span>
            </div>
          </div>

          <div style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(18px,3vw,24px)",fontWeight:500,lineHeight:1.55,marginBottom:32}}>{q.text}</div>

          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
            {q.opts.map((opt,i)=>{
              let bg=C.card,brd=`1px solid ${C.border}`,clr=C.text,shadow2="none";
              if(!shown&&picked===i){bg="#14162e";brd=`1px solid ${C.blueL}`;shadow2=`0 0 0 2px ${C.blueL}22`;}
              if(shown){
                if(i===q.correct){bg="#081e10";brd=`1px solid ${C.greenL}`;clr=C.greenL;shadow2=`0 0 0 1px ${C.greenL}22`;}
                else if(i===picked&&i!==q.correct){bg="#1e0808";brd=`1px solid ${C.red}`;clr=C.text2;}
              }
              return (
                <div key={i} onClick={()=>!shown&&picked===null&&setPicked(i)}
                  style={{background:bg,border:brd,borderRadius:6,padding:"14px 18px",cursor:shown?"default":picked===null?"pointer":"default",display:"flex",alignItems:"center",gap:14,color:clr,transition:"all 0.15s",boxShadow:shadow2}}>
                  <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,fontWeight:700,minWidth:24,color:shown&&i===q.correct?C.greenL:shown&&i===picked&&i!==q.correct?C.red:"#404050"}}>{LABELS[i]}</span>
                  <span style={{fontSize:15,flex:1,lineHeight:1.5}}>{opt}</span>
                  {shown&&i===q.correct&&<span style={{color:C.greenL,fontWeight:700,fontSize:16}}>✓</span>}
                  {shown&&i===picked&&i!==q.correct&&<span style={{color:C.red,fontWeight:700,fontSize:16}}>✗</span>}
                </div>
              );
            })}
          </div>

          {shown&&q.expl&&(
            <div style={{background:isCorrect?"#071a0e":"#1a0707",border:`1px solid ${isCorrect?"#1c4228":"#4a1818"}`,borderRadius:6,padding:"14px 18px",marginBottom:24}}>
              <div style={{color:isCorrect?C.greenL:C.orange,fontSize:13,fontWeight:700,marginBottom:6}}>{isCorrect?"✓ Bonne réponse !":"✗ Mauvaise réponse"}</div>
              <div style={{color:C.text2,fontSize:14,lineHeight:1.65}}>{q.expl}</div>
            </div>
          )}

          {!shown
            ? <Btn onClick={()=>doValidate()} disabled={picked===null} full>{picked===null?"Choisissez une réponse":"VALIDER MA RÉPONSE"}</Btn>
            : <Btn onClick={nextQ} full>{examIdx+1>=examList.length?"VOIR LES RÉSULTATS →":"QUESTION SUIVANTE →"}</Btn>
          }
        </div>
      </Wrap>
    );
  }

  // ── RESULTS ────────────────────────────────────────────────
  if(page==="results"){
    const sc=log.filter(x=>x.correct).length;
    const total=examList.length;
    const pct=Math.round((sc/total)*100);
    const passed=pct>=70;
    const emoji=pct>=95?"🏆":pct>=80?"✅":pct>=60?"⚠️":"❌";
    return (
      <Wrap>
        <div style={{maxWidth:680,margin:"0 auto",padding:"52px 24px",textAlign:"center"}}>
          <div style={{fontSize:56,marginBottom:14}}>{emoji}</div>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(56px,14vw,96px)",fontWeight:700,color:pct2col(pct),lineHeight:1}}>{pct}%</div>
          <div style={{color:C.text2,fontSize:17,marginTop:10}}>{sc} / {total} bonnes réponses</div>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:15,letterSpacing:4,textTransform:"uppercase",color:pct2col(pct),marginTop:12}}>
            {pct>=95?"Exceptionnel !":pct>=80?"Excellent !":pct>=70?"Réussi":pct>=50?"À améliorer":"Insuffisant"}
          </div>
          <div style={{background:C.border,borderRadius:99,height:6,margin:"28px auto",maxWidth:260,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:pct2col(pct),borderRadius:99,transition:"width 1s ease"}}/>
          </div>

          {/* Nouveaux badges */}
          {newBadges.length>0&&(
            <div style={{background:C.card,border:`1px solid ${C.yellowL}44`,borderRadius:8,padding:"20px",marginBottom:28,textAlign:"center"}}>
              <div style={{fontFamily:"Oswald,sans-serif",color:C.yellowL,fontSize:13,letterSpacing:2,marginBottom:14}}>🏅 NOUVEAU{newBadges.length>1?"X":""} BADGE{newBadges.length>1?"S":""} DÉBLOQUÉ{newBadges.length>1?"S":""} !</div>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                {newBadges.map(b=>(
                  <div key={b.id} style={{textAlign:"center",padding:"10px 14px",background:b.color+"18",border:`1px solid ${b.color}66`,borderRadius:6}}>
                    <div style={{fontSize:28}}>{b.icon}</div>
                    <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,color:b.color,letterSpacing:1,marginTop:4}}>{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Récap question par question */}
          <div style={{textAlign:"left",marginBottom:32}}>
            {examList.map((q,i)=>{
              const ok=log[i]?.correct;
              const cat=cats.find(c=>c.id===q.catId);
              return (
                <div key={q.id} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:ok?C.greenL:C.red,flexShrink:0,fontWeight:700,marginTop:2,fontSize:16}}>{ok?"✓":"✗"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:ok?C.text:C.text2,lineHeight:1.5}}>{q.text}</div>
                    {!ok&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>Bonne réponse : <strong style={{color:C.text}}>{q.opts[q.correct]}</strong></div>}
                    {cat&&<span style={{fontSize:10,color:cat.color,marginTop:4,display:"inline-block"}}>{cat.name}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {examCat&&<Btn onClick={()=>openPreExam(examCat,examMode)}>🔄 Recommencer</Btn>}
            <Btn onClick={()=>setPage("history")} ghost>📊 Mon bilan</Btn>
            <Btn onClick={()=>setPage("home")} ghost>← Accueil</Btn>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── ADMIN ──────────────────────────────────────────────────
  if(page==="admin"){
    const enterTab = async tab=>{
      setAdminTab(tab);setEditQ(null);setEditCat(null);setEditDoc(null);setSaveErr("");
      if(tab==="classement") await loadAllResults();
    };
    const filteredResults = classFilter==="all"?allResults:allResults.filter(r=>r.cat_id===classFilter);
    const pseudos = [...new Set(filteredResults.map(r=>r.pseudo))];
    const leaderboard = pseudos.map(p=>{
      const pr=filteredResults.filter(r=>r.pseudo===p);
      return {pseudo:p,count:pr.length,avg:Math.round(pr.reduce((a,r)=>a+r.pct,0)/pr.length),best:Math.max(...pr.map(r=>r.pct)),last:pr[0]?.created_at};
    }).sort((a,b)=>b.avg-a.avg);

    return (
      <Wrap>
        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>🔥</span>
            <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,letterSpacing:3,textTransform:"uppercase"}}>Administration</span>
            <span style={{background:C.red,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:20,letterSpacing:0.5}}>ADMIN</span>
          </div>
          <button onClick={()=>setPage("home")} style={{background:"transparent",color:C.muted,border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Barlow',sans-serif"}} onMouseEnter={e=>e.currentTarget.style.color=C.text2} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>← Retour au site</button>
        </div>

        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,display:"flex",padding:"0 20px",overflowX:"auto"}}>
          {[["qs","📋 Questions"],["cats","🗂 Catégories"],["documents","📚 Documents"],["classement","🏆 Classement"],["settings","⚙ Paramètres"]].map(([k,l])=>(
            <button key={k} onClick={()=>enterTab(k)} style={{background:"none",border:"none",borderBottom:`2px solid ${adminTab===k?C.red:"transparent"}`,color:adminTab===k?C.text:C.muted,padding:"14px 16px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,whiteSpace:"nowrap",transition:"all 0.15s"}}>{l}</button>
          ))}
        </div>

        <div style={{maxWidth:960,margin:"0 auto",padding:"32px 24px"}}>

          {/* ── QUESTIONS ── */}
          {adminTab==="qs"&&!editQ&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Questions</h2><span style={{background:C.faint,color:C.muted,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{qs.length}</span></div>
              <Btn onClick={()=>{setSaveErr("");setEditQ({catId:cats[0]?.id||"",text:"",opts:["","","",""],correct:0,expl:""});}} disabled={cats.length===0} sm>+ Ajouter</Btn>
            </div>
            {cats.length===0&&<div style={{color:C.orange,fontSize:13,background:"#1a120822",border:`1px solid ${C.orange}44`,borderRadius:4,padding:"10px 14px",marginBottom:14}}>⚠ Créez d'abord une catégorie.</div>}
            {qs.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}>Aucune question. Commencez par en ajouter une.</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {qs.map(q=>{
                  const cat=cats.find(c=>c.id===q.catId);
                  return (
                    <div key={q.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.border2} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{q.text}</div>
                        {cat&&<span style={{fontSize:11,color:cat.color,fontWeight:600,background:cat.color+"18",borderRadius:20,padding:"1px 8px"}}>{cat.name}</span>}
                      </div>
                      <div style={{display:"flex",gap:8,flexShrink:0}}>
                        <button onClick={()=>{setSaveErr("");setEditQ({...q});}} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>✏ Éditer</button>
                        <button onClick={()=>setDelConfirm({type:"q",id:q.id})} style={{background:"#1e080822",border:`1px solid #4a181844`,color:"#e05050",borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="qs"&&editQ&&<QForm initial={editQ} cats={cats} qs={qs} onSave={saveQ} onCancel={()=>setEditQ(null)} saving={saving} saveErr={saveErr}/>}

          {/* ── CATEGORIES ── */}
          {adminTab==="cats"&&!editCat&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Catégories</h2><span style={{background:C.faint,color:C.muted,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{cats.length}</span></div>
              <Btn onClick={()=>{setSaveErr("");setEditCat({name:"",desc:"",color:"#e8392a"});}} sm>+ Ajouter</Btn>
            </div>
            {cats.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}>Aucune catégorie.</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {cats.map(cat=>{
                  const count=qs.filter(q=>q.catId===cat.id).length;
                  return (
                    <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:4,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{cat.name}</div><div style={{fontSize:12,color:C.muted}}>{cat.desc} · {count} question{count!==1?"s":""}</div></div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setSaveErr("");setEditCat({...cat});}} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>✏ Éditer</button>
                        <button onClick={()=>setDelConfirm({type:"cat",id:cat.id})} style={{background:"#1e080822",border:`1px solid #4a181844`,color:"#e05050",borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="cats"&&editCat&&<CatForm initial={editCat} cats={cats} onSave={saveCat} onCancel={()=>setEditCat(null)} saving={saving} saveErr={saveErr}/>}

          {/* ── DOCUMENTS ── */}
          {adminTab==="documents"&&!editDoc&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Documents</h2><span style={{background:C.faint,color:C.muted,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{docs.length}</span></div>
              <Btn onClick={()=>{setSaveErr("");setEditDoc({catId:cats[0]?.id||"",title:"",type:"source",description:"",url:""});}} disabled={cats.length===0} sm>+ Ajouter</Btn>
            </div>
            {docs.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}><div style={{fontSize:36,marginBottom:10}}>📂</div>Aucun document.</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {docs.map(doc=>{
                  const cat=cats.find(c=>c.id===doc.catId);
                  const dtype=DOC_TYPES.find(t=>t.key===doc.type);
                  return (
                    <div key={doc.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:8,marginBottom:4}}>
                          <span style={{fontSize:11,color:dtype?.color,fontWeight:600}}>{dtype?.icon} {dtype?.label}</span>
                          {cat&&<span style={{fontSize:11,color:cat.color,fontWeight:600}}>· {cat.name}</span>}
                        </div>
                        <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.title}</div>
                      </div>
                      <div style={{display:"flex",gap:8,flexShrink:0}}>
                        <button onClick={()=>{setSaveErr("");setEditDoc({...doc});}} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>✏ Éditer</button>
                        <button onClick={()=>setDelConfirm({type:"doc",id:doc.id})} style={{background:"#1e080822",border:`1px solid #4a181844`,color:"#e05050",borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="documents"&&editDoc&&<DocForm initial={editDoc} cats={cats} docs={docs} onSave={saveDoc} onCancel={()=>setEditDoc(null)} saving={saving} saveErr={saveErr}/>}

          {/* ── CLASSEMENT ── */}
          {adminTab==="classement"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Classement général</h2>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <button onClick={()=>setClassFilter("all")} style={{background:classFilter==="all"?C.red:"transparent",color:classFilter==="all"?"#fff":C.muted,border:`1px solid ${classFilter==="all"?C.red:C.border2}`,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>Toutes</button>
                  {cats.map(cat=><button key={cat.id} onClick={()=>setClassFilter(cat.id)} style={{background:classFilter===cat.id?cat.color:"transparent",color:classFilter===cat.id?"#fff":C.muted,border:`1px solid ${classFilter===cat.id?cat.color:C.border2}`,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>{cat.name}</button>)}
                  <button onClick={loadAllResults} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.muted,borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🔄</button>
                </div>
              </div>
              {allResults.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:28}}>
                  {[{l:"Participants",v:[...new Set(allResults.map(r=>r.pseudo))].length,col:C.blueL},{l:"Examens passés",v:allResults.length,col:C.orange},{l:"Moyenne générale",v:Math.round(allResults.reduce((a,r)=>a+r.pct,0)/allResults.length)+"%",col:C.greenL}].map((st,i)=>(
                    <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"14px",textAlign:"center"}}>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:26,fontWeight:700,color:st.col}}>{st.v}</div>
                      <div style={{color:C.muted,fontSize:12,marginTop:4}}>{st.l}</div>
                    </div>
                  ))}
                </div>
              )}
              {leaderboard.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}><div style={{fontSize:34,marginBottom:10}}>🏆</div>Aucun résultat.</div>:(<>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:12}}>Classement par participant</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:32}}>
                  {leaderboard.map((entry,rank)=>{
                    const medal=rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":`#${rank+1}`;
                    return (
                      <div key={entry.pseudo} style={{background:C.card,border:`1px solid ${rank===0?"#403818":C.border}`,borderRadius:4,padding:"13px 18px",display:"flex",alignItems:"center",gap:16}}>
                        <span style={{fontFamily:"Oswald,sans-serif",fontSize:rank<3?22:14,minWidth:32,textAlign:"center",color:C.muted}}>{medal}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>{entry.pseudo}</div>
                          <div style={{background:C.bg,borderRadius:99,height:4,maxWidth:200,overflow:"hidden"}}><div style={{height:"100%",width:`${entry.avg}%`,background:pct2col(entry.avg),borderRadius:99}}/></div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <ScorePill pct={entry.avg}/>
                          <div style={{color:C.muted,fontSize:11,marginTop:4}}>{entry.count} essai{entry.count>1?"s":""} · meilleur {entry.best}%</div>
                          {entry.last&&<div style={{color:C.muted,fontSize:10,marginTop:2}}>{timeAgo(entry.last)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:12}}>Toutes les tentatives</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {filteredResults.map(r=>(
                    <div key={r.id} style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:4,padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:r.color||C.red}}/>
                        <span style={{fontWeight:700,fontSize:13}}>{r.pseudo}</span>
                        <span style={{color:C.muted,fontSize:12}}>→ {r.cat_name}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <span style={{color:C.muted,fontSize:11}}>{fmtDate(r.created_at)}</span>
                        <span style={{color:C.muted,fontSize:12}}>{r.score}/{r.total}</span>
                        <ScorePill pct={r.pct}/>
                      </div>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
          )}

          {/* ── SETTINGS ── */}
          {adminTab==="settings"&&(
            <div style={{maxWidth:480}}>
              <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",marginBottom:28}}>Paramètres du compte</h2>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:24,marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Changer mon pseudo</div>
                <div style={{color:C.muted,fontSize:12,marginBottom:14}}>Actuel : <strong style={{color:C.text}}>{pseudo}</strong></div>
                <Field value={newPseudo} onChange={e=>{setNewPseudo(e.target.value);setPseudoOk(false);}} placeholder="Nouveau pseudo..."/>
                {pseudoOk&&<OkBox msg="✓ Pseudo mis à jour !"/>}
                <div style={{marginTop:12}}><Btn onClick={savePseudo} disabled={!newPseudo.trim()} color={C.greenL} sm>Enregistrer</Btn></div>
              </div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:24,marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Changer mon mot de passe</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <Field type="password" value={newPw} onChange={e=>{setNewPw(e.target.value);setPwOk(false);setPwErr("");}} placeholder="Nouveau mot de passe (min. 6 car.)"/>
                  <Field type="password" value={newPw2} onChange={e=>{setNewPw2(e.target.value);setPwErr("");}} placeholder="Confirmer le mot de passe"/>
                </div>
                {pwErr&&<ErrBox msg={pwErr}/>}
                {pwOk&&<OkBox msg="✓ Mot de passe mis à jour !"/>}
                <div style={{marginTop:12}}><Btn onClick={savePw} disabled={!newPw||!newPw2} color={C.red} sm>Mettre à jour</Btn></div>
              </div>
              <div style={{background:"#141208",border:`1px solid #303010`,borderRadius:6,padding:"14px 18px"}}>
                <div style={{color:C.yellowL,fontSize:13,fontWeight:700,marginBottom:6}}>Informations du compte</div>
                <div style={{color:C.muted,fontSize:13}}>Email : <strong style={{color:C.text}}>{user?.email}</strong></div>
                <div style={{color:C.muted,fontSize:13,marginTop:4}}>Statut : <strong style={{color:C.greenL}}>Administrateur ✓</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Modal suppression */}
        {delConfirm&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:24,backdropFilter:"blur(4px)"}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${C.red}`,borderRadius:8,padding:32,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
              <div style={{fontFamily:"Oswald,sans-serif",fontSize:18,marginBottom:10}}>Confirmer la suppression</div>
              <p style={{color:C.text2,fontSize:14,marginBottom:28,lineHeight:1.6}}>
                {delConfirm.type==="cat"?"⚠ Supprimer cette catégorie supprimera aussi toutes ses questions et documents associés.":delConfirm.type==="doc"?"Ce document sera définitivement supprimé.":"Cette action est irréversible."}
              </p>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>{if(delConfirm.type==="q")deleteQ(delConfirm.id);else if(delConfirm.type==="doc")deleteDoc(delConfirm.id);else deleteCat(delConfirm.id);}} full danger>Supprimer définitivement</Btn>
                <Btn onClick={()=>setDelConfirm(null)} ghost full>Annuler</Btn>
              </div>
            </div>
          </div>
        )}
      </Wrap>
    );
  }

  return null;
}
