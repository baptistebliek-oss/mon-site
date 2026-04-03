// ─── INSTALLATION REQUISE ────────────────────────────────────────
// npm install @supabase/supabase-js
//
// VARIABLES D'ENVIRONNEMENT dans Vercel (Project Settings > Env Vars) :
//   VITE_SUPABASE_URL       = https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY  = eyJhbGci...
//
// Si Create React App, remplacez VITE_ par REACT_APP_
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── PALETTE ────────────────────────────────────────────────────
const C = {
  bg: "#080808", surf: "#111111", card: "#181818", border: "#242424",
  red: "#e8392a", orange: "#f07320", green: "#22c55e", blue: "#3b82f6",
  text: "#eeebe6", muted: "#6a6560",
};
const CAT_COLORS = ["#e8392a","#f07320","#eab308","#22c55e","#3b82f6","#a855f7"];
const LABELS = ["A","B","C","D"];

const fmtDate = ts => new Date(ts).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
const timeAgo = ts => {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `il y a ${Math.floor(s/60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s/3600)}h`;
  return `il y a ${Math.floor(s/86400)}j`;
};

// ─── UI PRIMITIVES ───────────────────────────────────────────────
const FL = ({ children }) => (
  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, letterSpacing:1.8, textTransform:"uppercase", marginBottom:8, fontFamily:"'Barlow',sans-serif" }}>
    {children}
  </label>
);

const Field = ({ value, onChange, placeholder, type="text", rows, onKeyDown, autoFocus }) => {
  const s = { width:"100%", background:C.surf, border:`1px solid ${C.border}`, borderRadius:2, color:C.text, padding:"11px 13px", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none", boxSizing:"border-box" };
  if (rows) return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{ ...s, resize:"vertical" }} />;
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus} style={s} />;
};

const Btn = ({ onClick, children, color=C.red, disabled, full, ghost, sm }) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: full ? "100%" : undefined,
    background: ghost ? "transparent" : (disabled ? "#1e1e1e" : color),
    color: ghost ? C.muted : (disabled ? "#4a4a4a" : (color===C.green ? "#000" : "#fff")),
    border: ghost ? `1px solid ${C.border}` : "none",
    borderRadius:2, padding: sm ? "6px 14px" : "11px 22px",
    cursor: disabled ? "default" : "pointer",
    fontWeight:600, fontSize: sm ? 12 : 14,
    fontFamily:"'Barlow',sans-serif", transition:"opacity 0.15s",
  }}>{children}</button>
);

const Badge = ({ pct, lg }) => {
  const col = pct >= 70 ? C.green : pct >= 50 ? C.orange : C.red;
  return <span style={{ fontSize:lg?28:13, padding:lg?"6px 16px":"3px 10px", color:col, border:`1px solid ${col}`, borderRadius:2, fontFamily:"Oswald,sans-serif", fontWeight:700 }}>{pct}%</span>;
};

const Topbar = ({ title, back, right }) => (
  <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:52, position:"sticky", top:0, zIndex:10 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      {back && <button onClick={back} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:20, padding:0 }}>←</button>}
      <span style={{ fontFamily:"Oswald,sans-serif", fontSize:13, letterSpacing:3, textTransform:"uppercase" }}>{title}</span>
    </div>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>{right}</div>
  </div>
);

const Wrap = ({ children }) => (
  <div style={{ fontFamily:"'Barlow',sans-serif", background:C.bg, minHeight:"100vh", color:C.text }}>
    {children}
  </div>
);

const ErrBox = ({ msg }) => msg ? <div style={{ color:C.red, fontSize:13, background:"#1e0808", border:`1px solid #4a1a10`, borderRadius:2, padding:"10px 13px", marginBottom:12, lineHeight:1.5 }}>{msg}</div> : null;
const OkBox  = ({ msg }) => msg ? <div style={{ color:C.green, fontSize:13, background:"#081e10", border:`1px solid #1a4a28`, borderRadius:2, padding:"10px 13px", marginBottom:12 }}>{msg}</div> : null;

// ─── FORMS (outside App to avoid remount) ───────────────────────
let _qs_ref = [];
const isEditing = (item, list) => !!item?.id && list.some(x => x.id === item.id);

function QForm({ initial, cats, qs, onSave, onCancel, saving, saveErr }) {
  const [q, setQ] = useState(initial);
  const valid = q.text?.trim() && q.catId && q.opts?.every(o => o?.trim());
  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28 }}>
        <button onClick={onCancel} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:22, padding:0 }}>←</button>
        <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:17, letterSpacing:2, textTransform:"uppercase", margin:0 }}>
          {isEditing(initial, qs) ? "Éditer la question" : "Nouvelle question"}
        </h2>
      </div>
      <ErrBox msg={saveErr} />
      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
        <div>
          <FL>Catégorie *</FL>
          <select value={q.catId} onChange={e => setQ(x => ({ ...x, catId:e.target.value }))}
            style={{ width:"100%", background:C.surf, border:`1px solid ${C.border}`, borderRadius:2, color:C.text, padding:"11px 13px", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none" }}>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><FL>Intitulé *</FL><Field value={q.text||""} onChange={e => setQ(x => ({ ...x, text:e.target.value }))} placeholder="Saisissez la question..." rows={3} /></div>
        <div>
          <FL>Options — cliquez la lettre pour marquer la bonne réponse *</FL>
          {(q.opts||[]).map((opt, i) => (
            <div key={i} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"center" }}>
              <button onClick={() => setQ(x => ({ ...x, correct:i }))}
                style={{ width:34, height:34, flexShrink:0, border:`2px solid ${q.correct===i?C.green:C.border}`, borderRadius:2, background:q.correct===i?"#0a2214":"transparent", color:q.correct===i?C.green:C.muted, fontFamily:"Oswald,sans-serif", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {LABELS[i]}
              </button>
              <input value={opt||""} onChange={e => { const o=[...q.opts]; o[i]=e.target.value; setQ(x => ({ ...x, opts:o })); }}
                placeholder={`Réponse ${LABELS[i]}`}
                style={{ flex:1, background:C.surf, border:`1px solid ${q.correct===i?"#1a4a28":C.border}`, borderRadius:2, color:C.text, padding:"10px 13px", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none" }} />
            </div>
          ))}
        </div>
        <div><FL>Explication (optionnel)</FL><Field value={q.expl||""} onChange={e => setQ(x => ({ ...x, expl:e.target.value }))} placeholder="Affichée après la réponse..." rows={2} /></div>
        <div style={{ display:"flex", gap:12 }}>
          <Btn onClick={() => valid && onSave(q)} disabled={!valid||saving} color={C.green}>{saving ? "Enregistrement..." : "✓ Enregistrer"}</Btn>
          <Btn onClick={onCancel} ghost>Annuler</Btn>
        </div>
      </div>
    </div>
  );
}

function CatForm({ initial, cats, onSave, onCancel, saving, saveErr }) {
  const [cat, setCat] = useState(initial);
  const valid = cat.name?.trim();
  return (
    <div style={{ maxWidth:480 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28 }}>
        <button onClick={onCancel} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:22, padding:0 }}>←</button>
        <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:17, letterSpacing:2, textTransform:"uppercase", margin:0 }}>
          {isEditing(initial, cats) ? "Éditer la catégorie" : "Nouvelle catégorie"}
        </h2>
      </div>
      <ErrBox msg={saveErr} />
      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
        <div><FL>Nom *</FL><Field value={cat.name||""} onChange={e => setCat(x => ({ ...x, name:e.target.value }))} placeholder="Ex : Sécurité incendie" /></div>
        <div><FL>Description</FL><Field value={cat.desc||""} onChange={e => setCat(x => ({ ...x, desc:e.target.value }))} placeholder="Courte description..." /></div>
        <div>
          <FL>Couleur</FL>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {CAT_COLORS.map(col => (
              <div key={col} onClick={() => setCat(x => ({ ...x, color:col }))}
                style={{ width:38, height:38, borderRadius:3, background:col, cursor:"pointer", border:cat.color===col?"3px solid #fff":"3px solid transparent", boxSizing:"border-box", transition:"all 0.12s" }} />
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:12 }}>
          <Btn onClick={() => valid && onSave(cat)} disabled={!valid||saving} color={C.green}>{saving ? "Enregistrement..." : "✓ Enregistrer"}</Btn>
          <Btn onClick={onCancel} ghost>Annuler</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]       = useState("boot");
  const [user, setUser]       = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pseudo, setPseudo]   = useState("");

  const [cats, setCats]               = useState([]);
  const [qs, setQs]                   = useState([]);
  const [myResults, setMyResults]     = useState([]);
  const [allResults, setAllResults]   = useState([]);

  const [authMode, setAuthMode] = useState("login");
  const [aEmail, setAEmail]     = useState("");
  const [aPw, setAPw]           = useState("");
  const [aPseudo, setAPseudo]   = useState("");
  const [aErr, setAErr]         = useState("");
  const [aBusy, setABusy]       = useState(false);

  const [adminTab, setAdminTab]       = useState("qs");
  const [editQ, setEditQ]             = useState(null);
  const [editCat, setEditCat]         = useState(null);
  const [delConfirm, setDelConfirm]   = useState(null);
  const [saving, setSaving]           = useState(false);
  const [saveErr, setSaveErr]         = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const [newPseudo, setNewPseudo] = useState("");
  const [pseudoOk, setPseudoOk]   = useState(false);
  const [newPw, setNewPw]         = useState("");
  const [newPw2, setNewPw2]       = useState("");
  const [pwOk, setPwOk]           = useState(false);
  const [pwErr, setPwErr]         = useState("");

  const [examCat, setExamCat]   = useState(null);
  const [examList, setExamList] = useState([]);
  const [examIdx, setExamIdx]   = useState(0);
  const [picked, setPicked]     = useState(null);
  const [shown, setShown]       = useState(false);
  const [log, setLog]           = useState([]);
  const answersRef              = useRef([]);

  // ── BOOT ─────────────────────────────────────────────────────
  useEffect(() => {
    // Inject Google Fonts
    if (!document.querySelector("#gf-pompiers")) {
      const l = document.createElement("link");
      l.id = "gf-pompiers";
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap";
      document.head.appendChild(l);
    }

    // Auth state listener
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null); setIsAdmin(false); setPseudo(""); setPage("auth");
      } else if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        await onSession(session.user);
      } else if (!session) {
        setPage("auth");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const onSession = async (u) => {
    setUser(u);
    const { data: prof } = await sb.from("profiles").select("*").eq("id", u.id).single();
    if (prof) { setIsAdmin(prof.is_admin); setPseudo(prof.pseudo || u.email.split("@")[0]); }
    await Promise.all([loadData(), loadMyResults(u.id)]);
    setPage("home");
  };

  const loadData = async () => {
    const [cR, qR] = await Promise.all([
      sb.from("categories").select("*").order("created_at"),
      sb.from("questions").select("*").order("created_at"),
    ]);
    if (cR.data) setCats(cR.data.map(c => ({ id:c.id, name:c.name, desc:c.description, color:c.color })));
    if (qR.data) setQs(qR.data.map(q => ({ id:q.id, catId:q.cat_id, text:q.text, opts:q.options, correct:q.correct_index, expl:q.explanation })));
  };

  const loadMyResults = async (uid) => {
    const { data } = await sb.from("results").select("*").eq("user_id", uid).order("created_at", { ascending:false });
    if (data) setMyResults(data);
  };

  const loadAllResults = async () => {
    const { data } = await sb.from("results").select("*").order("created_at", { ascending:false });
    if (data) setAllResults(data);
  };

  // ── AUTH ─────────────────────────────────────────────────────
  const doAuth = async () => {
    setAErr(""); setABusy(true);
    try {
      if (authMode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email:aEmail, password:aPw });
        if (error) setAErr(error.message);
      } else {
        if (!aPseudo.trim()) { setAErr("Veuillez entrer un prénom ou pseudo."); setABusy(false); return; }
        const { data, error } = await sb.auth.signUp({ email:aEmail, password:aPw, options:{ data:{ pseudo:aPseudo.trim() } } });
        if (error) setAErr(error.message);
        else if (!data.session) setAErr("✓ Compte créé ! Vérifiez votre email puis connectez-vous.");
      }
    } catch(e) { setAErr(e.message); }
    setABusy(false);
  };

  const doLogout = () => sb.auth.signOut();

  // ── CRUD ─────────────────────────────────────────────────────
  const saveCat = async (data) => {
    setSaving(true); setSaveErr("");
    const payload = { name:data.name, description:data.desc||"", color:data.color };
    if (cats.some(c => c.id === data.id)) {
      const { error } = await sb.from("categories").update(payload).eq("id", data.id);
      if (!error) { setCats(p => p.map(c => c.id===data.id ? { ...c, name:data.name, desc:data.desc, color:data.color } : c)); setEditCat(null); }
      else setSaveErr(error.message);
    } else {
      const { data:nc, error } = await sb.from("categories").insert(payload).select().single();
      if (!error && nc) { setCats(p => [...p, { id:nc.id, name:nc.name, desc:nc.description, color:nc.color }]); setEditCat(null); }
      else setSaveErr(error?.message || "Erreur");
    }
    setSaving(false);
  };

  const deleteCat = async (id) => {
    const { error } = await sb.from("categories").delete().eq("id", id);
    if (!error) { setCats(p => p.filter(c => c.id!==id)); setQs(p => p.filter(q => q.catId!==id)); setDelConfirm(null); }
  };

  const saveQ = async (data) => {
    setSaving(true); setSaveErr("");
    const payload = { cat_id:data.catId, text:data.text, options:data.opts, correct_index:data.correct, explanation:data.expl||"" };
    if (qs.some(q => q.id === data.id)) {
      const { error } = await sb.from("questions").update(payload).eq("id", data.id);
      if (!error) { setQs(p => p.map(q => q.id===data.id ? { ...q, ...data } : q)); setEditQ(null); }
      else setSaveErr(error.message);
    } else {
      const { data:nq, error } = await sb.from("questions").insert(payload).select().single();
      if (!error && nq) { setQs(p => [...p, { id:nq.id, catId:nq.cat_id, text:nq.text, opts:nq.options, correct:nq.correct_index, expl:nq.explanation }]); setEditQ(null); }
      else setSaveErr(error?.message || "Erreur");
    }
    setSaving(false);
  };

  const deleteQ = async (id) => {
    const { error } = await sb.from("questions").delete().eq("id", id);
    if (!error) { setQs(p => p.filter(q => q.id!==id)); setDelConfirm(null); }
  };

  // ── EXAM ─────────────────────────────────────────────────────
  const startExam = (cat) => {
    const list = qs.filter(q => q.catId===cat.id).sort(() => Math.random()-0.5);
    if (!list.length) return;
    answersRef.current = [];
    setExamCat(cat); setExamList(list);
    setExamIdx(0); setPicked(null); setShown(false); setLog([]);
    setPage("exam");
  };

  const validate = () => {
    if (picked===null) return;
    const entry = { correct: picked === examList[examIdx].correct };
    answersRef.current = [...answersRef.current, entry];
    setLog([...answersRef.current]);
    setShown(true);
  };

  const nextQ = async () => {
    if (examIdx+1 >= examList.length) {
      const answers = answersRef.current;
      const sc  = answers.filter(x => x.correct).length;
      const pct = Math.round((sc / examList.length) * 100);
      await sb.from("results").insert({ user_id:user.id, pseudo, cat_id:examCat.id, cat_name:examCat.name, color:examCat.color, score:sc, total:examList.length, pct });
      await loadMyResults(user.id);
      setPage("results");
    } else {
      setExamIdx(i => i+1); setPicked(null); setShown(false);
    }
  };

  // ── SETTINGS ─────────────────────────────────────────────────
  const savePseudo = async () => {
    if (!newPseudo.trim()) return;
    const { error } = await sb.from("profiles").update({ pseudo:newPseudo.trim() }).eq("id", user.id);
    if (!error) { setPseudo(newPseudo.trim()); setNewPseudo(""); setPseudoOk(true); setTimeout(() => setPseudoOk(false), 3000); }
  };

  const savePw = async () => {
    setPwErr("");
    if (newPw.length < 6) { setPwErr("Minimum 6 caractères."); return; }
    if (newPw !== newPw2) { setPwErr("Les mots de passe ne correspondent pas."); return; }
    const { error } = await sb.auth.updateUser({ password:newPw });
    if (!error) { setNewPw(""); setNewPw2(""); setPwOk(true); setTimeout(() => setPwOk(false), 3000); }
    else setPwErr(error.message);
  };

  // ─────────────────────────────────────────────────────────────
  // PAGES
  // ─────────────────────────────────────────────────────────────

  if (page === "boot") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, color:C.red, fontFamily:"Oswald,sans-serif", fontSize:20, letterSpacing:4 }}>
      🔥 CONNEXION...
    </div>
  );

  // ── AUTH ────────────────────────────────────────────────────
  if (page === "auth") return (
    <Wrap>
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:58, filter:"drop-shadow(0 0 24px rgba(232,57,42,0.4))", marginBottom:12 }}>🔥</div>
          <h1 style={{ fontFamily:"Oswald,sans-serif", fontSize:"clamp(22px,6vw,50px)", fontWeight:700, letterSpacing:5, textTransform:"uppercase", margin:"0 0 10px" }}>SAPEURS-POMPIERS</h1>
          <div style={{ fontFamily:"Oswald,sans-serif", color:C.red, letterSpacing:6, textTransform:"uppercase", fontSize:12 }}>Plateforme QCM · Formation</div>
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderTop:`3px solid ${C.red}`, borderRadius:3, padding:"34px 30px", width:"100%", maxWidth:360 }}>
          <div style={{ display:"flex", background:C.surf, borderRadius:2, padding:3, marginBottom:26 }}>
            {[["login","Connexion"],["register","Inscription"]].map(([m,l]) => (
              <button key={m} onClick={() => { setAuthMode(m); setAErr(""); }}
                style={{ flex:1, background:authMode===m?C.red:"transparent", color:authMode===m?"#fff":C.muted, border:"none", borderRadius:1, padding:"9px", cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:600, fontSize:13, transition:"all 0.15s" }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {authMode === "register" && (
              <div><FL>Prénom / Pseudo</FL><Field value={aPseudo} onChange={e => setAPseudo(e.target.value)} placeholder="Jean Dupont" autoFocus /></div>
            )}
            <div><FL>Email</FL><Field type="email" value={aEmail} onChange={e => setAEmail(e.target.value)} placeholder="jean@exemple.fr" autoFocus={authMode==="login"} /></div>
            <div><FL>Mot de passe</FL><Field type="password" value={aPw} onChange={e => setAPw(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key==="Enter" && doAuth()} /></div>

            {aErr && (
              <div style={{ color:aErr.startsWith("✓")?C.green:C.red, fontSize:13, lineHeight:1.5, background:aErr.startsWith("✓")?"#081e10":"#1e0808", border:`1px solid ${aErr.startsWith("✓")?"#1a4a28":"#4a1a10"}`, borderRadius:2, padding:"10px 12px" }}>
                {aErr}
              </div>
            )}
            <Btn onClick={doAuth} disabled={aBusy||!aEmail||!aPw} full>
              {aBusy ? "..." : authMode==="login" ? "SE CONNECTER →" : "CRÉER MON COMPTE →"}
            </Btn>
          </div>
        </div>
      </div>
    </Wrap>
  );

  // ── HOME ────────────────────────────────────────────────────
  if (page === "home") {
    const avg = myResults.length ? Math.round(myResults.reduce((a,r) => a+r.pct,0)/myResults.length) : null;
    return (
      <Wrap>
        <Topbar
          title={<><span style={{ fontSize:15, marginRight:8 }}>🔥</span>Sapeurs-Pompiers QCM</>}
          right={<>
            <span style={{ color:C.muted, fontSize:13 }}>👤 <strong style={{ color:C.text }}>{pseudo}</strong></span>
            {myResults.length > 0 && <Btn onClick={() => setPage("history")} ghost sm>📊 Historique</Btn>}
            {isAdmin && <Btn onClick={() => { setAdminTab("qs"); setPage("admin"); }} sm>⚙ Admin</Btn>}
            <button onClick={doLogout} style={{ background:"none", border:"none", color:"#404040", cursor:"pointer", fontSize:11, fontFamily:"'Barlow',sans-serif" }}>Déco.</button>
          </>}
        />

        <div style={{ background:"linear-gradient(150deg,#1e0904 0%,#0a0a0a 50%)", borderBottom:`1px solid ${C.border}`, padding:"52px 24px 44px" }}>
          <div style={{ maxWidth:680, margin:"0 auto", textAlign:"center" }}>
            <h1 style={{ fontFamily:"Oswald,sans-serif", fontSize:"clamp(22px,5vw,46px)", fontWeight:700, letterSpacing:3, textTransform:"uppercase", margin:0 }}>Bonjour, {pseudo} 👋</h1>
            <p style={{ color:C.muted, fontSize:15, fontWeight:300, maxWidth:400, margin:"14px auto 0", lineHeight:1.8 }}>Choisissez une catégorie pour tester vos connaissances.</p>
            {avg !== null && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:14, marginTop:20, background:C.card, border:`1px solid ${C.border}`, borderRadius:3, padding:"10px 20px" }}>
                <span style={{ color:C.muted, fontSize:13 }}>Votre moyenne</span>
                <Badge pct={avg} />
                <span style={{ color:C.muted, fontSize:12 }}>sur {myResults.length} examen{myResults.length>1?"s":""}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth:900, margin:"0 auto", padding:"44px 24px" }}>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:26 }}>
            <span style={{ fontFamily:"Oswald,sans-serif", fontSize:11, letterSpacing:4, textTransform:"uppercase", color:C.muted }}>Catégories</span>
            <span style={{ color:C.muted, fontSize:12 }}>{cats.length} disponible{cats.length!==1?"s":""}</span>
          </div>
          {cats.length === 0 ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"80px 0" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              {isAdmin ? "Aucune catégorie — créez-en une dans l'admin." : "Aucune catégorie disponible."}
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))", gap:16 }}>
              {cats.map(cat => {
                const count  = qs.filter(q => q.catId===cat.id).length;
                const catRes = myResults.filter(r => r.cat_id===cat.id);
                const best   = catRes.length ? Math.max(...catRes.map(r => r.pct)) : null;
                const ok     = count > 0;
                return (
                  <div key={cat.id} onClick={() => ok && startExam(cat)}
                    style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`4px solid ${cat.color}`, borderRadius:3, padding:"22px 20px", cursor:ok?"pointer":"default", opacity:ok?1:0.5, transition:"transform 0.15s, background 0.15s" }}
                    onMouseEnter={e => { if(ok){e.currentTarget.style.background="#202020"; e.currentTarget.style.transform="translateY(-2px)";} }}
                    onMouseLeave={e => { e.currentTarget.style.background=C.card; e.currentTarget.style.transform="none"; }}>
                    <div style={{ fontFamily:"Oswald,sans-serif", fontSize:17, fontWeight:600, marginBottom:7 }}>{cat.name}</div>
                    <div style={{ color:C.muted, fontSize:13, fontWeight:300, marginBottom:18, lineHeight:1.6 }}>{cat.desc}</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, color:cat.color, fontWeight:600 }}>{count} question{count!==1?"s":""}</span>
                      {best!==null ? <span style={{ fontSize:11, color:C.muted }}>Meilleur : <strong style={{ color:best>=70?C.green:C.red }}>{best}%</strong></span>
                        : ok ? <span style={{ fontSize:10, color:C.muted, letterSpacing:1.5 }}>COMMENCER ▶</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Wrap>
    );
  }

  // ── HISTORY ─────────────────────────────────────────────────
  if (page === "history") {
    const avg  = myResults.length ? Math.round(myResults.reduce((a,r) => a+r.pct,0)/myResults.length) : 0;
    const best = myResults.length ? Math.max(...myResults.map(r => r.pct)) : 0;
    return (
      <Wrap>
        <Topbar title="Mon historique" back={() => setPage("home")} right={<span style={{ color:C.muted, fontSize:13 }}>👤 {pseudo}</span>} />
        <div style={{ maxWidth:760, margin:"0 auto", padding:"40px 24px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:32 }}>
            {[{l:"Examens",v:myResults.length,s:"",col:C.blue},{l:"Moyenne",v:avg,s:"%",col:avg>=70?C.green:avg>=50?C.orange:C.red},{l:"Meilleur",v:best,s:"%",col:best>=70?C.green:best>=50?C.orange:C.red}].map((st,i) => (
              <div key={i} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:3, padding:"16px", textAlign:"center" }}>
                <div style={{ fontFamily:"Oswald,sans-serif", fontSize:30, fontWeight:700, color:st.col }}>{st.v}{st.s}</div>
                <div style={{ color:C.muted, fontSize:12, marginTop:4 }}>{st.l}</div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily:"Oswald,sans-serif", fontSize:11, letterSpacing:3, textTransform:"uppercase", color:C.muted, marginBottom:12 }}>Par catégorie</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
            {cats.map(cat => {
              const r2 = myResults.filter(r => r.cat_id===cat.id);
              if (!r2.length) return null;
              const ca = Math.round(r2.reduce((a,r) => a+r.pct,0)/r2.length);
              return (
                <div key={cat.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${cat.color}`, borderRadius:2, padding:"12px 16px", display:"flex", alignItems:"center", gap:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>{cat.name}</div>
                    <div style={{ background:C.border, borderRadius:99, height:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${ca}%`, background:ca>=70?C.green:C.red, borderRadius:99, transition:"width 0.5s" }} />
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <Badge pct={ca} />
                    <div style={{ color:C.muted, fontSize:11, marginTop:4 }}>{r2.length} tentative{r2.length>1?"s":""}</div>
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>

          <div style={{ fontFamily:"Oswald,sans-serif", fontSize:11, letterSpacing:3, textTransform:"uppercase", color:C.muted, marginBottom:12 }}>Historique détaillé</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {myResults.map(r => (
              <div key={r.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:r.color||C.red }} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{r.cat_name}</div>
                    <div style={{ color:C.muted, fontSize:11 }}>{fmtDate(r.created_at)}</div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ color:C.muted, fontSize:12 }}>{r.score}/{r.total}</span>
                  <Badge pct={r.pct} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Wrap>
    );
  }

  // ── EXAM ────────────────────────────────────────────────────
  if (page === "exam") {
    const q = examList[examIdx];
    const isCorrect = picked === q.correct;
    return (
      <Wrap>
        <div style={{ height:3, background:C.border }}>
          <div style={{ height:"100%", background:C.red, width:`${(examIdx/examList.length)*100}%`, transition:"width 0.4s ease" }} />
        </div>
        <div style={{ maxWidth:660, margin:"0 auto", padding:"48px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:50 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:examCat?.color }} />
              <span style={{ color:C.muted, fontSize:13 }}>{examCat?.name}</span>
            </div>
            <span style={{ fontFamily:"Oswald,sans-serif", color:C.muted, fontSize:14, letterSpacing:1 }}>{examIdx+1} / {examList.length}</span>
          </div>
          <div style={{ fontFamily:"Oswald,sans-serif", fontSize:"clamp(17px,3vw,22px)", fontWeight:500, lineHeight:1.55, marginBottom:36 }}>{q.text}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
            {q.opts.map((opt, i) => {
              let bg=C.card, brd=`1px solid ${C.border}`, clr=C.text;
              if (!shown && picked===i) { bg="#14162a"; brd=`1px solid #4858b0`; }
              if (shown) {
                if (i===q.correct) { bg="#0a2014"; brd=`1px solid ${C.green}`; clr=C.green; }
                else if (i===picked) { bg="#240c0c"; brd=`1px solid ${C.red}`; clr=C.red; }
              }
              return (
                <div key={i} onClick={() => !shown && setPicked(i)}
                  style={{ background:bg, border:brd, borderRadius:3, padding:"14px 18px", cursor:shown?"default":"pointer", display:"flex", alignItems:"center", gap:14, color:clr, transition:"all 0.12s" }}>
                  <span style={{ fontFamily:"Oswald,sans-serif", fontSize:13, fontWeight:700, minWidth:22, color:shown&&i===q.correct?C.green:shown&&i===picked?C.red:"#404040" }}>{LABELS[i]}</span>
                  <span style={{ fontSize:15, flex:1 }}>{opt}</span>
                  {shown && i===q.correct && <span style={{ color:C.green, fontWeight:700 }}>✓</span>}
                  {shown && i===picked && i!==q.correct && <span style={{ color:C.red, fontWeight:700 }}>✗</span>}
                </div>
              );
            })}
          </div>
          {shown && q.expl && (
            <div style={{ background:isCorrect?"#091c10":"#1e0808", border:`1px solid ${isCorrect?"#1c4228":"#421810"}`, borderRadius:3, padding:"13px 18px", marginBottom:22 }}>
              <div style={{ color:isCorrect?C.green:C.orange, fontSize:13, fontWeight:600, marginBottom:5 }}>{isCorrect?"✓ Bonne réponse !":"✗ Mauvaise réponse"}</div>
              <div style={{ color:C.muted, fontSize:14, lineHeight:1.65 }}>{q.expl}</div>
            </div>
          )}
          {!shown
            ? <Btn onClick={validate} disabled={picked===null} full>VALIDER</Btn>
            : <Btn onClick={nextQ} full>{examIdx+1>=examList.length?"VOIR LES RÉSULTATS →":"SUIVANT →"}</Btn>
          }
        </div>
      </Wrap>
    );
  }

  // ── RESULTS ─────────────────────────────────────────────────
  if (page === "results") {
    const sc    = log.filter(x => x.correct).length;
    const total = examList.length;
    const pct   = Math.round((sc/total)*100);
    const passed = pct >= 70;
    const emoji  = pct>=90?"🏆":pct>=70?"✅":pct>=50?"⚠️":"❌";
    return (
      <Wrap>
        <div style={{ maxWidth:620, margin:"0 auto", padding:"60px 24px", textAlign:"center" }}>
          <div style={{ fontSize:52, marginBottom:12 }}>{emoji}</div>
          <div style={{ fontFamily:"Oswald,sans-serif", fontSize:"clamp(50px,14vw,84px)", fontWeight:700, color:passed?C.green:C.red, lineHeight:1 }}>{pct}%</div>
          <div style={{ color:C.muted, fontSize:16, marginTop:8 }}>{sc} / {total} bonnes réponses</div>
          <div style={{ fontFamily:"Oswald,sans-serif", fontSize:15, letterSpacing:4, textTransform:"uppercase", color:passed?C.green:C.red, marginTop:12 }}>
            {pct>=90?"Excellent !":pct>=70?"Réussi":pct>=50?"À améliorer":"Insuffisant"}
          </div>
          <div style={{ background:C.border, borderRadius:99, height:5, margin:"28px auto", maxWidth:240, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background:passed?C.green:C.red, borderRadius:99, transition:"width 0.9s" }} />
          </div>
          <div style={{ textAlign:"left", marginBottom:32 }}>
            {examList.map((q,i) => {
              const ok = log[i]?.correct;
              return (
                <div key={q.id} style={{ display:"flex", gap:12, padding:"11px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ color:ok?C.green:C.red, flexShrink:0, fontWeight:700, marginTop:1 }}>{ok?"✓":"✗"}</span>
                  <div>
                    <div style={{ fontSize:13, color:ok?C.text:"#787878", lineHeight:1.5 }}>{q.text}</div>
                    {!ok && <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Réponse : <strong style={{ color:C.text }}>{q.opts[q.correct]}</strong></div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            <Btn onClick={() => startExam(examCat)}>🔄 Recommencer</Btn>
            <Btn onClick={() => setPage("history")} ghost>📊 Historique</Btn>
            <Btn onClick={() => setPage("home")} ghost>← Accueil</Btn>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── ADMIN ───────────────────────────────────────────────────
  if (page === "admin") {
    const enterTab = async (tab) => {
      setAdminTab(tab); setEditQ(null); setEditCat(null); setSaveErr("");
      if (tab === "classement") await loadAllResults();
    };

    const filteredResults = classFilter==="all" ? allResults : allResults.filter(r => r.cat_id===classFilter);
    const pseudos = [...new Set(filteredResults.map(r => r.pseudo))];
    const leaderboard = pseudos.map(p => {
      const pr = filteredResults.filter(r => r.pseudo===p);
      return { pseudo:p, count:pr.length, avg:Math.round(pr.reduce((a,r) => a+r.pct,0)/pr.length), best:Math.max(...pr.map(r=>r.pct)), last:pr[0]?.created_at };
    }).sort((a,b) => b.avg-a.avg);

    return (
      <Wrap>
        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:52 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>🔥</span>
            <span style={{ fontFamily:"Oswald,sans-serif", fontSize:13, letterSpacing:3, textTransform:"uppercase" }}>Administration</span>
            <span style={{ background:C.red, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:2 }}>ADMIN</span>
          </div>
          <button onClick={() => setPage("home")} style={{ background:"transparent", color:C.muted, border:"none", cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }}>← Site</button>
        </div>

        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`, display:"flex", padding:"0 24px", overflowX:"auto" }}>
          {[["qs","📋 Questions"],["cats","🗂 Catégories"],["classement","🏆 Classement"],["settings","⚙ Paramètres"]].map(([k,l]) => (
            <button key={k} onClick={() => enterTab(k)}
              style={{ background:"none", border:"none", borderBottom:`2px solid ${adminTab===k?C.red:"transparent"}`, color:adminTab===k?C.text:C.muted, padding:"13px 16px", cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:500, fontSize:14, whiteSpace:"nowrap" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ maxWidth:940, margin:"0 auto", padding:"34px 24px" }}>

          {/* QUESTIONS */}
          {adminTab==="qs" && !editQ && (<>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:16, letterSpacing:2, textTransform:"uppercase", margin:0 }}>Questions ({qs.length})</h2>
              <Btn onClick={() => { setSaveErr(""); setEditQ({ catId:cats[0]?.id||"", text:"", opts:["","","",""], correct:0, expl:"" }); }} disabled={cats.length===0}>+ Ajouter</Btn>
            </div>
            {cats.length===0 && <div style={{ color:"#d97706", fontSize:13, background:"#1a1208", border:"1px solid #3a2810", borderRadius:2, padding:"10px 14px", marginBottom:14 }}>⚠ Créez d'abord une catégorie.</div>}
            {qs.length===0 ? <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>Aucune question.</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {qs.map(q => {
                  const cat = cats.find(c => c.id===q.catId);
                  return (
                    <div key={q.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:2 }}>{q.text}</div>
                        {cat && <span style={{ fontSize:11, color:cat.color, fontWeight:600 }}>{cat.name}</span>}
                      </div>
                      <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                        <button onClick={() => { setSaveErr(""); setEditQ({ ...q }); }} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, borderRadius:2, padding:"4px 11px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>✏ Éditer</button>
                        <button onClick={() => setDelConfirm({ type:"q", id:q.id })} style={{ background:"transparent", border:"1px solid #381410", color:"#804040", borderRadius:2, padding:"4px 9px", cursor:"pointer", fontSize:12 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="qs" && editQ && <QForm initial={editQ} cats={cats} qs={qs} onSave={saveQ} onCancel={() => setEditQ(null)} saving={saving} saveErr={saveErr} />}

          {/* CATEGORIES */}
          {adminTab==="cats" && !editCat && (<>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:16, letterSpacing:2, textTransform:"uppercase", margin:0 }}>Catégories ({cats.length})</h2>
              <Btn onClick={() => { setSaveErr(""); setEditCat({ name:"", desc:"", color:"#e8392a" }); }}>+ Ajouter</Btn>
            </div>
            {cats.length===0 ? <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>Aucune catégorie.</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {cats.map(cat => {
                  const count = qs.filter(q => q.catId===cat.id).length;
                  return (
                    <div key={cat.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`4px solid ${cat.color}`, borderRadius:2, padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{cat.name}</div>
                        <div style={{ fontSize:12, color:C.muted }}>{cat.desc} · {count} question{count!==1?"s":""}</div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => { setSaveErr(""); setEditCat({ ...cat }); }} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, borderRadius:2, padding:"4px 11px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>✏ Éditer</button>
                        <button onClick={() => setDelConfirm({ type:"cat", id:cat.id })} style={{ background:"transparent", border:"1px solid #381410", color:"#804040", borderRadius:2, padding:"4px 9px", cursor:"pointer", fontSize:12 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="cats" && editCat && <CatForm initial={editCat} cats={cats} onSave={saveCat} onCancel={() => setEditCat(null)} saving={saving} saveErr={saveErr} />}

          {/* CLASSEMENT */}
          {adminTab==="classement" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
                <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:16, letterSpacing:2, textTransform:"uppercase", margin:0 }}>Classement général</h2>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  <button onClick={() => setClassFilter("all")} style={{ background:classFilter==="all"?C.red:"transparent", color:classFilter==="all"?"#fff":C.muted, border:`1px solid ${classFilter==="all"?C.red:C.border}`, borderRadius:2, padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>Toutes</button>
                  {cats.map(cat => <button key={cat.id} onClick={() => setClassFilter(cat.id)} style={{ background:classFilter===cat.id?cat.color:"transparent", color:classFilter===cat.id?"#fff":C.muted, border:`1px solid ${classFilter===cat.id?cat.color:C.border}`, borderRadius:2, padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>{cat.name}</button>)}
                  <button onClick={loadAllResults} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, borderRadius:2, padding:"5px 11px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>🔄</button>
                </div>
              </div>

              {allResults.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:24 }}>
                  {[{l:"Participants",v:[...new Set(allResults.map(r=>r.pseudo))].length,col:C.blue},{l:"Examens",v:allResults.length,col:C.orange},{l:"Moyenne générale",v:Math.round(allResults.reduce((a,r)=>a+r.pct,0)/allResults.length)+"%",col:C.green}].map((st,i) => (
                    <div key={i} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:3, padding:"13px", textAlign:"center" }}>
                      <div style={{ fontFamily:"Oswald,sans-serif", fontSize:24, fontWeight:700, color:st.col }}>{st.v}</div>
                      <div style={{ color:C.muted, fontSize:12, marginTop:3 }}>{st.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {leaderboard.length===0 ? (
                <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}><div style={{ fontSize:34, marginBottom:10 }}>🏆</div>Aucun résultat pour le moment.</div>
              ) : (<>
                <div style={{ fontFamily:"Oswald,sans-serif", fontSize:11, letterSpacing:3, textTransform:"uppercase", color:C.muted, marginBottom:10 }}>Classement</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:28 }}>
                  {leaderboard.map((entry,rank) => {
                    const medal = rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":`#${rank+1}`;
                    return (
                      <div key={entry.pseudo} style={{ background:C.card, border:`1px solid ${rank===0?"#383010":C.border}`, borderRadius:2, padding:"12px 18px", display:"flex", alignItems:"center", gap:16 }}>
                        <span style={{ fontFamily:"Oswald,sans-serif", fontSize:rank<3?20:14, minWidth:32, color:C.muted, textAlign:"center" }}>{medal}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14, marginBottom:5 }}>{entry.pseudo}</div>
                          <div style={{ background:C.border, borderRadius:99, height:4, maxWidth:180, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${entry.avg}%`, background:entry.avg>=70?C.green:C.red, borderRadius:99 }} />
                          </div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <Badge pct={entry.avg} />
                          <div style={{ color:C.muted, fontSize:11, marginTop:4 }}>{entry.count} essai{entry.count>1?"s":""} · meilleur {entry.best}%</div>
                          {entry.last && <div style={{ color:"#404040", fontSize:10 }}>{timeAgo(entry.last)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontFamily:"Oswald,sans-serif", fontSize:11, letterSpacing:3, textTransform:"uppercase", color:C.muted, marginBottom:10 }}>Toutes les tentatives</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {filteredResults.map(r => (
                    <div key={r.id} style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:2, padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:r.color||C.red }} />
                        <span style={{ fontWeight:600, fontSize:13 }}>{r.pseudo}</span>
                        <span style={{ color:C.muted, fontSize:12 }}>→ {r.cat_name}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ color:C.muted, fontSize:11 }}>{fmtDate(r.created_at)}</span>
                        <span style={{ color:C.muted, fontSize:12 }}>{r.score}/{r.total}</span>
                        <Badge pct={r.pct} />
                      </div>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
          )}

          {/* SETTINGS */}
          {adminTab==="settings" && (
            <div style={{ maxWidth:460 }}>
              <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:16, letterSpacing:2, textTransform:"uppercase", marginBottom:26 }}>Paramètres du compte</h2>

              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:3, padding:22, marginBottom:14 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>Changer mon pseudo</div>
                <div style={{ color:C.muted, fontSize:12, marginBottom:14 }}>Actuel : <strong style={{ color:C.text }}>{pseudo}</strong></div>
                <Field value={newPseudo} onChange={e => { setNewPseudo(e.target.value); setPseudoOk(false); }} placeholder="Nouveau pseudo..." />
                {pseudoOk && <OkBox msg="✓ Pseudo mis à jour !" />}
                <div style={{ marginTop:12 }}><Btn onClick={savePseudo} disabled={!newPseudo.trim()} color={C.green}>Enregistrer</Btn></div>
              </div>

              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:3, padding:22, marginBottom:14 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>Changer mon mot de passe</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <Field type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwOk(false); setPwErr(""); }} placeholder="Nouveau mot de passe (min. 6 car.)" />
                  <Field type="password" value={newPw2} onChange={e => { setNewPw2(e.target.value); setPwErr(""); }} placeholder="Confirmer le mot de passe" />
                </div>
                {pwErr && <ErrBox msg={pwErr} />}
                {pwOk && <OkBox msg="✓ Mot de passe mis à jour !" />}
                <div style={{ marginTop:12 }}><Btn onClick={savePw} disabled={!newPw||!newPw2} color={C.red}>Mettre à jour</Btn></div>
              </div>

              <div style={{ background:"#141208", border:"1px solid #303010", borderRadius:3, padding:"12px 16px" }}>
                <div style={{ color:"#d0a020", fontSize:13, fontWeight:600, marginBottom:6 }}>Informations du compte</div>
                <div style={{ color:C.muted, fontSize:13 }}>Email : <strong style={{ color:C.text }}>{user?.email}</strong></div>
                <div style={{ color:C.muted, fontSize:13, marginTop:4 }}>Statut : <strong style={{ color:C.green }}>Administrateur ✓</strong></div>
              </div>
            </div>
          )}
        </div>

        {delConfirm && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:24 }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderTop:`3px solid ${C.red}`, borderRadius:3, padding:30, maxWidth:360, width:"100%" }}>
              <div style={{ fontFamily:"Oswald,sans-serif", fontSize:17, marginBottom:10 }}>Confirmer la suppression</div>
              <p style={{ color:C.muted, fontSize:14, marginBottom:24, lineHeight:1.6 }}>
                {delConfirm.type==="cat" ? "⚠ Supprimer cette catégorie supprimera aussi toutes ses questions." : "Cette action est irréversible."}
              </p>
              <div style={{ display:"flex", gap:10 }}>
                <Btn onClick={() => delConfirm.type==="q" ? deleteQ(delConfirm.id) : deleteCat(delConfirm.id)} full>Supprimer</Btn>
                <Btn onClick={() => setDelConfirm(null)} full ghost>Annuler</Btn>
              </div>
            </div>
          </div>
        )}
      </Wrap>
    );
  }

  return null;
}
