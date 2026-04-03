import { useState, useEffect, useRef } from "react";

// ─── PALETTE ────────────────────────────────────────────────────
const C = {
  bg: "#080808", surf: "#111111", card: "#181818", border: "#242424",
  red: "#e8392a", orange: "#f07320", green: "#22c55e", blue: "#3b82f6",
  yellow: "#eab308", text: "#eeebe6", muted: "#6a6560", faint: "#2e2e2e"
};
const CAT_COLORS = ["#e8392a","#f07320","#eab308","#22c55e","#3b82f6","#a855f7"];
const LABELS = ["A","B","C","D"];
let sb = null;

// ─── SQL À EXÉCUTER UNE FOIS DANS SUPABASE ───────────────────────
const SQL = `-- ① Collez dans Supabase > SQL Editor > New Query puis cliquez Run

create table public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text default '',
  color text default '#e8392a',
  created_at timestamptz default now()
);

create table public.questions (
  id uuid default gen_random_uuid() primary key,
  cat_id uuid references public.categories(id) on delete cascade,
  text text not null,
  options jsonb not null,
  correct_index int not null default 0,
  explanation text default '',
  created_at timestamptz default now()
);

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  pseudo text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table public.results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  pseudo text,
  cat_id uuid,
  cat_name text,
  color text,
  score int,
  total int,
  pct int,
  created_at timestamptz default now()
);

alter table public.categories enable row level security;
alter table public.questions enable row level security;
alter table public.profiles enable row level security;
alter table public.results enable row level security;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create policy "read_cats" on public.categories for select to authenticated using (true);
create policy "write_cats" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read_qs" on public.questions for select to authenticated using (true);
create policy "write_qs" on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "own_profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "update_own_profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "insert_results" on public.results for insert to authenticated
  with check (user_id = auth.uid());
create policy "read_results" on public.results for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Premier utilisateur inscrit = administrateur automatiquement
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, pseudo, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'pseudo', split_part(new.email,'@',1)),
    not exists (select 1 from public.profiles limit 1)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();`;

// ─── HELPERS ────────────────────────────────────────────────────
const fmtDate = ts => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const timeAgo = ts => {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `il y a ${Math.floor(s/60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s/3600)}h`;
  return `il y a ${Math.floor(s/86400)}j`;
};

// ─── SUPABASE INIT ───────────────────────────────────────────────
async function initSupabase(url, key) {
  const mem = {};
  try {
    const r = await window.storage.get("sb-mem");
    if (r?.value) Object.assign(mem, JSON.parse(r.value));
  } catch {}
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const flush = () => window.storage.set("sb-mem", JSON.stringify(mem)).catch(() => {});
  sb = createClient(url, key, {
    auth: {
      storage: {
        getItem: k => mem[k] ?? null,
        setItem: (k, v) => { mem[k] = v; flush(); },
        removeItem: k => { delete mem[k]; flush(); }
      },
      autoRefreshToken: true, persistSession: true, detectSessionInUrl: false
    }
  });
}

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
    letterSpacing: sm ? 0 : 0.5
  }}>{children}</button>
);

const Badge = ({ pct, lg }) => {
  const col = pct >= 70 ? C.green : pct >= 50 ? C.orange : C.red;
  return <span style={{ fontSize: lg ? 28 : 13, padding: lg ? "6px 16px" : "3px 10px", color:col, border:`1px solid ${col}`, borderRadius:2, fontFamily:"Oswald,sans-serif", fontWeight:700, letterSpacing:1 }}>{pct}%</span>;
};

const Topbar = ({ title, back, right }) => (
  <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:52, position:"sticky", top:0, zIndex:10 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      {back && <button onClick={back} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:20, padding:0, lineHeight:1 }}>←</button>}
      <span style={{ fontFamily:"Oswald,sans-serif", fontSize:13, letterSpacing:3, textTransform:"uppercase", color:C.text }}>{title}</span>
    </div>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>{right}</div>
  </div>
);

const Wrap = ({ children }) => (
  <div style={{ fontFamily:"'Barlow',sans-serif", background:C.bg, minHeight:"100vh", color:C.text }}>
    {children}
  </div>
);

const ErrBox = ({ msg }) => msg ? (
  <div style={{ color:C.red, fontSize:13, lineHeight:1.5, background:"#1e0808", border:`1px solid #4a1a10`, borderRadius:2, padding:"10px 13px", marginBottom:12 }}>{msg}</div>
) : null;

const OkBox = ({ msg }) => msg ? (
  <div style={{ color:C.green, fontSize:13, lineHeight:1.5, background:"#081e10", border:`1px solid #1a4a28`, borderRadius:2, padding:"10px 13px", marginBottom:12 }}>{msg}</div>
) : null;

// ─── QUESTION FORM (outside App to avoid remount) ────────────────
function QForm({ initial, cats, onSave, onCancel, saving, saveErr }) {
  const [q, setQ] = useState(initial);
  const valid = q.text?.trim() && q.catId && q.opts?.every(o => o?.trim());
  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28 }}>
        <button onClick={onCancel} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:22, padding:0 }}>←</button>
        <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:17, letterSpacing:2, textTransform:"uppercase", margin:0 }}>
          {qs_has(initial) ? "Éditer la question" : "Nouvelle question"}
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
        <div><FL>Intitulé de la question *</FL>
          <Field value={q.text} onChange={e => setQ(x => ({ ...x, text:e.target.value }))} placeholder="Saisissez votre question..." rows={3} /></div>
        <div>
          <FL>Options — cliquez la lettre pour marquer la bonne réponse *</FL>
          {q.opts.map((opt, i) => (
            <div key={i} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"center" }}>
              <button onClick={() => setQ(x => ({ ...x, correct:i }))}
                style={{ width:34, height:34, flexShrink:0, border:`2px solid ${q.correct===i ? C.green : C.border}`, borderRadius:2, background:q.correct===i ? "#0a2214" : "transparent", color:q.correct===i ? C.green : C.muted, fontFamily:"Oswald,sans-serif", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {LABELS[i]}
              </button>
              <input value={opt||""} onChange={e => { const o=[...q.opts]; o[i]=e.target.value; setQ(x => ({ ...x, opts:o })); }}
                placeholder={`Réponse ${LABELS[i]}`}
                style={{ flex:1, background:C.surf, border:`1px solid ${q.correct===i ? "#1a4a28" : C.border}`, borderRadius:2, color:C.text, padding:"10px 13px", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none" }} />
            </div>
          ))}
        </div>
        <div><FL>Explication (optionnel)</FL>
          <Field value={q.expl||""} onChange={e => setQ(x => ({ ...x, expl:e.target.value }))} placeholder="Affichée après la réponse..." rows={2} /></div>
        <div style={{ display:"flex", gap:12 }}>
          <Btn onClick={() => valid && onSave(q)} disabled={!valid || saving} color={C.green}>{saving ? "Enregistrement..." : "✓ Enregistrer"}</Btn>
          <Btn onClick={onCancel} ghost>Annuler</Btn>
        </div>
      </div>
    </div>
  );
}

function CatForm({ initial, cats_arr, onSave, onCancel, saving, saveErr }) {
  const [cat, setCat] = useState(initial);
  const valid = cat.name?.trim();
  return (
    <div style={{ maxWidth:480 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28 }}>
        <button onClick={onCancel} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:22, padding:0 }}>←</button>
        <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:17, letterSpacing:2, textTransform:"uppercase", margin:0 }}>
          {cats_arr.some(c => c.id === initial.id) ? "Éditer la catégorie" : "Nouvelle catégorie"}
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
                style={{ width:38, height:38, borderRadius:3, background:col, cursor:"pointer", border:cat.color===col ? "3px solid #fff" : "3px solid transparent", boxSizing:"border-box", transition:"all 0.12s" }} />
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:12 }}>
          <Btn onClick={() => valid && onSave(cat)} disabled={!valid || saving} color={C.green}>{saving ? "Enregistrement..." : "✓ Enregistrer"}</Btn>
          <Btn onClick={onCancel} ghost>Annuler</Btn>
        </div>
      </div>
    </div>
  );
}

// dummy used by QForm to determine if editing
let _qs_global = [];
const qs_has = (q) => !!q?.id && _qs_global.some(x => x.id === q.id);

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {

  // ── pages: setup | auth | home | exam | results | history | admin
  const [page, setPage] = useState("boot");
  const [cfgUrl, setCfgUrl] = useState("");
  const [cfgKey, setCfgKey] = useState("");
  const [cfgStep, setCfgStep] = useState("sql");
  const [copied, setCopied] = useState(false);

  // ── user
  const [user, setUser]       = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pseudo, setPseudo]   = useState("");

  // ── data
  const [cats, setCats]           = useState([]);
  const [qs, setQs]               = useState([]);
  const [myResults, setMyResults] = useState([]);
  const [allResults, setAllResults] = useState([]);

  // ── auth form
  const [authMode, setAuthMode] = useState("login");
  const [aEmail, setAEmail]     = useState("");
  const [aPw, setAPw]           = useState("");
  const [aPseudo, setAPseudo]   = useState("");
  const [aErr, setAErr]         = useState("");
  const [aBusy, setABusy]       = useState(false);

  // ── admin
  const [adminTab, setAdminTab]     = useState("qs");
  const [editQ, setEditQ]           = useState(null);
  const [editCat, setEditCat]       = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState("");
  const [classFilter, setClassFilter] = useState("all");

  // ── personal settings
  const [newPseudo, setNewPseudo]   = useState("");
  const [pseudoOk, setPseudoOk]     = useState(false);
  const [newPw, setNewPw]           = useState("");
  const [newPw2, setNewPw2]         = useState("");
  const [pwOk, setPwOk]             = useState(false);
  const [pwErr, setPwErr]           = useState("");

  // ── exam
  const [examCat, setExamCat]   = useState(null);
  const [examList, setExamList] = useState([]);
  const [examIdx, setExamIdx]   = useState(0);
  const [picked, setPicked]     = useState(null);
  const [shown, setShown]       = useState(false);
  const [log, setLog]           = useState([]);
  const answersRef = useRef([]);

  // sync global ref for QForm helper
  useEffect(() => { _qs_global = qs; }, [qs]);

  // ── BOOT ──────────────────────────────────────────────────────
  useEffect(() => {
    document.head.insertAdjacentHTML("beforeend", `<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet">`);
    bootstrap();
  }, []);

  const bootstrap = async () => {
    try {
      const urlR = await window.storage.get("sb-url");
      const keyR = await window.storage.get("sb-key");
      if (!urlR?.value || !keyR?.value) { setPage("setup"); return; }
      await initSupabase(urlR.value, keyR.value);
      sb.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_OUT") { setUser(null); setIsAdmin(false); setPseudo(""); setPage("auth"); }
        else if (session?.user && event === "SIGNED_IN") await onSession(session.user);
      });
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) await onSession(session.user);
      else setPage("auth");
    } catch(e) { console.error(e); setPage("auth"); }
  };

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

  // ── AUTH ──────────────────────────────────────────────────────
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

  // ── CONFIG SAVE ───────────────────────────────────────────────
  const saveConfig = async () => {
    if (!cfgUrl.trim() || !cfgKey.trim()) return;
    await window.storage.set("sb-url", cfgUrl.trim());
    await window.storage.set("sb-key", cfgKey.trim());
    setTimeout(() => window.location.reload(), 400);
  };

  // ── CRUD ──────────────────────────────────────────────────────
  const saveCat = async (data) => {
    setSaving(true); setSaveErr("");
    const payload = { name:data.name, description:data.desc||"", color:data.color };
    let error;
    if (cats.some(c => c.id === data.id)) {
      ({ error } = await sb.from("categories").update(payload).eq("id", data.id));
      if (!error) { setCats(prev => prev.map(c => c.id===data.id ? { ...c, name:data.name, desc:data.desc, color:data.color } : c)); setEditCat(null); }
    } else {
      const { data:nc, error:e } = await sb.from("categories").insert(payload).select().single();
      error = e;
      if (!e && nc) { setCats(prev => [...prev, { id:nc.id, name:nc.name, desc:nc.description, color:nc.color }]); setEditCat(null); }
    }
    if (error) setSaveErr(error.message);
    setSaving(false);
  };

  const deleteCat = async (id) => {
    const { error } = await sb.from("categories").delete().eq("id", id);
    if (!error) { setCats(p => p.filter(c => c.id!==id)); setQs(p => p.filter(q => q.catId!==id)); setDelConfirm(null); }
  };

  const saveQ = async (data) => {
    setSaving(true); setSaveErr("");
    const payload = { cat_id:data.catId, text:data.text, options:data.opts, correct_index:data.correct, explanation:data.expl||"" };
    let error;
    if (qs.some(q => q.id === data.id)) {
      ({ error } = await sb.from("questions").update(payload).eq("id", data.id));
      if (!error) { setQs(prev => prev.map(q => q.id===data.id ? { ...q, ...data } : q)); setEditQ(null); }
    } else {
      const { data:nq, error:e } = await sb.from("questions").insert(payload).select().single();
      error = e;
      if (!e && nq) { setQs(prev => [...prev, { id:nq.id, catId:nq.cat_id, text:nq.text, opts:nq.options, correct:nq.correct_index, expl:nq.explanation }]); setEditQ(null); }
    }
    if (error) setSaveErr(error.message);
    setSaving(false);
  };

  const deleteQ = async (id) => {
    const { error } = await sb.from("questions").delete().eq("id", id);
    if (!error) { setQs(p => p.filter(q => q.id!==id)); setDelConfirm(null); }
  };

  // ── EXAM ──────────────────────────────────────────────────────
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
    const isCorrect = picked === examList[examIdx].correct;
    answersRef.current = [...answersRef.current, { correct:isCorrect }];
    setLog([...answersRef.current]);
    setShown(true);
  };

  const nextQ = async () => {
    const isLast = examIdx+1 >= examList.length;
    if (isLast) {
      const answers = answersRef.current;
      const sc = answers.filter(x => x.correct).length;
      const pct = Math.round((sc/examList.length)*100);
      await sb.from("results").insert({ user_id:user.id, pseudo, cat_id:examCat.id, cat_name:examCat.name, color:examCat.color, score:sc, total:examList.length, pct });
      await loadMyResults(user.id);
      setPage("results");
    } else {
      setExamIdx(i => i+1); setPicked(null); setShown(false);
    }
  };

  // ── SETTINGS ──────────────────────────────────────────────────
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
  // RENDER
  // ─────────────────────────────────────────────────────────────

  if (page === "boot") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, color:C.red, fontFamily:"Oswald,sans-serif", fontSize:20, letterSpacing:4 }}>🔥 CONNEXION...</div>
  );

  // ── SETUP ────────────────────────────────────────────────────
  if (page === "setup") return (
    <Wrap>
      <div style={{ maxWidth:800, margin:"0 auto", padding:"52px 24px" }}>
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div style={{ fontSize:52, filter:"drop-shadow(0 0 20px rgba(232,57,42,0.5))", marginBottom:14 }}>🔥</div>
          <h1 style={{ fontFamily:"Oswald,sans-serif", fontSize:"clamp(22px,5vw,40px)", fontWeight:700, letterSpacing:4, textTransform:"uppercase", margin:"0 0 8px" }}>Configuration Supabase</h1>
          <p style={{ color:C.muted, fontSize:14, margin:0 }}>Connectez votre base de données pour activer l'authentification et la persistance.</p>
        </div>

        {/* Tab selector */}
        <div style={{ display:"flex", background:C.surf, borderRadius:3, padding:3, marginBottom:32, maxWidth:440, margin:"0 auto 32px" }}>
          {[["sql","① SQL à exécuter"],["connect","② Connexion"]].map(([k,l]) => (
            <button key={k} onClick={() => setCfgStep(k)}
              style={{ flex:1, background:cfgStep===k ? C.red : "transparent", color:cfgStep===k ? "#fff" : C.muted, border:"none", borderRadius:2, padding:"9px 16px", cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:600, fontSize:13, transition:"all 0.15s" }}>
              {l}
            </button>
          ))}
        </div>

        {cfgStep === "sql" && (
          <div>
            <div style={{ background:"#0d1008", border:"1px solid #2a3018", borderRadius:3, padding:"12px 16px", marginBottom:16 }}>
              <div style={{ color:"#86c050", fontSize:13, fontWeight:600, marginBottom:4 }}>① Allez dans Supabase → SQL Editor → New Query</div>
              <div style={{ color:C.muted, fontSize:13 }}>Collez le script ci-dessous et cliquez <strong style={{ color:C.text }}>Run</strong>. C'est tout !</div>
            </div>
            <div style={{ position:"relative" }}>
              <pre style={{ background:"#050505", border:`1px solid ${C.border}`, borderRadius:3, padding:"18px 20px", fontSize:11.5, color:"#7ab87a", overflow:"auto", maxHeight:420, lineHeight:1.8, fontFamily:"monospace", margin:0 }}>
                {SQL}
              </pre>
              <button onClick={() => { navigator.clipboard.writeText(SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ position:"absolute", top:10, right:10, background:C.card, border:`1px solid ${C.border}`, color:copied ? C.green : C.muted, borderRadius:2, padding:"4px 12px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>
                {copied ? "✓ Copié" : "📋 Copier"}
              </button>
            </div>
            <div style={{ background:"#1a1208", border:"1px solid #3a2810", borderRadius:3, padding:"12px 16px", marginTop:14 }}>
              <div style={{ color:"#d97706", fontSize:13, fontWeight:600, marginBottom:4 }}>⚠ Important</div>
              <div style={{ color:C.muted, fontSize:13, lineHeight:1.8 }}>
                Désactivez la confirmation d'email : <strong style={{ color:C.text }}>Authentication → Settings → Email → Disable email confirmations</strong><br/>
                Le <strong style={{ color:C.text }}>premier compte créé</strong> sera automatiquement administrateur.
              </div>
            </div>
            <div style={{ textAlign:"center", marginTop:24 }}>
              <Btn onClick={() => setCfgStep("connect")}>Suivant → Connexion</Btn>
            </div>
          </div>
        )}

        {cfgStep === "connect" && (
          <div style={{ maxWidth:460, margin:"0 auto" }}>
            <div style={{ background:"#0d0e18", border:"1px solid #2a2e40", borderRadius:3, padding:"12px 16px", marginBottom:22 }}>
              <div style={{ color:"#7090d0", fontSize:13 }}>② Allez dans <strong style={{ color:C.text }}>Supabase → Project Settings → API</strong> et copiez l'URL du projet et la clé <code style={{ color:C.orange }}>anon public</code>.</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              <div>
                <FL>URL du projet Supabase</FL>
                <Field value={cfgUrl} onChange={e => setCfgUrl(e.target.value)} placeholder="https://xxxxxxxxxxxx.supabase.co" />
              </div>
              <div>
                <FL>Clé anon (public)</FL>
                <Field value={cfgKey} onChange={e => setCfgKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
              </div>
              <Btn onClick={saveConfig} disabled={!cfgUrl.trim() || !cfgKey.trim()} full>💾 Enregistrer et démarrer</Btn>
              <button onClick={() => setCfgStep("sql")} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }}>← Retour au SQL</button>
            </div>
          </div>
        )}
      </div>
    </Wrap>
  );

  // ── AUTH ─────────────────────────────────────────────────────
  if (page === "auth") return (
    <Wrap>
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:58, filter:"drop-shadow(0 0 24px rgba(232,57,42,0.4))", marginBottom:12 }}>🔥</div>
          <h1 style={{ fontFamily:"Oswald,sans-serif", fontSize:"clamp(22px,6vw,50px)", fontWeight:700, letterSpacing:5, textTransform:"uppercase", margin:"0 0 10px" }}>SAPEURS-POMPIERS</h1>
          <div style={{ fontFamily:"Oswald,sans-serif", color:C.red, letterSpacing:6, textTransform:"uppercase", fontSize:12, fontWeight:400 }}>Plateforme QCM · Formation</div>
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderTop:`3px solid ${C.red}`, borderRadius:3, padding:"34px 30px", width:"100%", maxWidth:360 }}>
          <div style={{ display:"flex", background:C.surf, borderRadius:2, padding:3, marginBottom:26 }}>
            {[["login","Connexion"],["register","Inscription"]].map(([m,l]) => (
              <button key={m} onClick={() => { setAuthMode(m); setAErr(""); }}
                style={{ flex:1, background:authMode===m ? C.red : "transparent", color:authMode===m ? "#fff" : C.muted, border:"none", borderRadius:1, padding:"9px", cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:600, fontSize:13, transition:"all 0.15s" }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {authMode === "register" && (
              <div><FL>Prénom / Pseudo</FL>
                <Field value={aPseudo} onChange={e => setAPseudo(e.target.value)} placeholder="Jean Dupont" autoFocus /></div>
            )}
            <div><FL>Email</FL>
              <Field type="email" value={aEmail} onChange={e => setAEmail(e.target.value)} placeholder="jean@exemple.fr" autoFocus={authMode==="login"} /></div>
            <div><FL>Mot de passe {authMode==="register" && <span style={{ color:C.muted, letterSpacing:0, textTransform:"none", fontWeight:400 }}>(min. 6 car.)</span>}</FL>
              <Field type="password" value={aPw} onChange={e => setAPw(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key==="Enter" && doAuth()} /></div>

            {aErr && (
              <div style={{ color:aErr.startsWith("✓") ? C.green : C.red, fontSize:13, lineHeight:1.5, background:aErr.startsWith("✓") ? "#081e10" : "#1e0808", border:`1px solid ${aErr.startsWith("✓") ? "#1a4a28" : "#4a1a10"}`, borderRadius:2, padding:"10px 12px" }}>
                {aErr}
              </div>
            )}

            <Btn onClick={doAuth} disabled={aBusy || !aEmail || !aPw} full>
              {aBusy ? "..." : authMode==="login" ? "SE CONNECTER →" : "CRÉER MON COMPTE →"}
            </Btn>
          </div>
        </div>
      </div>
    </Wrap>
  );

  // ── HOME ─────────────────────────────────────────────────────
  if (page === "home") {
    const avg = myResults.length ? Math.round(myResults.reduce((a,r) => a+r.pct, 0)/myResults.length) : null;
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
              {isAdmin ? "Aucune catégorie — créez-en une dans l'admin." : "Aucune catégorie disponible pour le moment."}
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(255px,1fr))", gap:16 }}>
              {cats.map(cat => {
                const count = qs.filter(q => q.catId===cat.id).length;
                const catRes = myResults.filter(r => r.cat_id===cat.id);
                const best = catRes.length ? Math.max(...catRes.map(r => r.pct)) : null;
                const canStart = count > 0;
                return (
                  <div key={cat.id} onClick={() => canStart && startExam(cat)}
                    style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`4px solid ${cat.color}`, borderRadius:3, padding:"22px 20px", cursor:canStart?"pointer":"default", opacity:canStart?1:0.5, transition:"transform 0.15s, background 0.15s" }}
                    onMouseEnter={e => { if(canStart){e.currentTarget.style.background="#202020"; e.currentTarget.style.transform="translateY(-2px)";} }}
                    onMouseLeave={e => { e.currentTarget.style.background=C.card; e.currentTarget.style.transform="none"; }}>
                    <div style={{ fontFamily:"Oswald,sans-serif", fontSize:17, fontWeight:600, marginBottom:7 }}>{cat.name}</div>
                    <div style={{ color:C.muted, fontSize:13, fontWeight:300, marginBottom:18, lineHeight:1.6 }}>{cat.desc}</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, color:cat.color, fontWeight:600 }}>{count} question{count!==1?"s":""}</span>
                      {best !== null ? <span style={{ fontSize:11, color:C.muted }}>Meilleur : <strong style={{ color:best>=70?C.green:C.red }}>{best}%</strong></span>
                        : canStart ? <span style={{ fontSize:10, color:C.muted, letterSpacing:1.5 }}>COMMENCER ▶</span> : null}
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

  // ── HISTORY ──────────────────────────────────────────────────
  if (page === "history") {
    const avg = myResults.length ? Math.round(myResults.reduce((a,r) => a+r.pct,0)/myResults.length) : 0;
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
              const catRes = myResults.filter(r => r.cat_id===cat.id);
              if (!catRes.length) return null;
              const catAvg = Math.round(catRes.reduce((a,r) => a+r.pct,0)/catRes.length);
              return (
                <div key={cat.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${cat.color}`, borderRadius:2, padding:"12px 16px", display:"flex", alignItems:"center", gap:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>{cat.name}</div>
                    <div style={{ background:C.border, borderRadius:99, height:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${catAvg}%`, background:catAvg>=70?C.green:C.red, borderRadius:99, transition:"width 0.5s" }} />
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <Badge pct={catAvg} />
                    <div style={{ color:C.muted, fontSize:11, marginTop:4 }}>{catRes.length} tentative{catRes.length>1?"s":""}</div>
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
                  <div style={{ width:8, height:8, borderRadius:"50%", background:r.color||C.red, flexShrink:0 }} />
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

  // ── EXAM ─────────────────────────────────────────────────────
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
              <div style={{ color:isCorrect?C.green:C.orange, fontSize:13, fontWeight:600, marginBottom:5 }}>{isCorrect ? "✓ Bonne réponse !" : "✗ Mauvaise réponse"}</div>
              <div style={{ color:C.muted, fontSize:14, lineHeight:1.65 }}>{q.expl}</div>
            </div>
          )}

          {!shown
            ? <Btn onClick={validate} disabled={picked===null} full>VALIDER</Btn>
            : <Btn onClick={nextQ} full>{examIdx+1>=examList.length ? "VOIR LES RÉSULTATS →" : "SUIVANT →"}</Btn>
          }
        </div>
      </Wrap>
    );
  }

  // ── RESULTS ──────────────────────────────────────────────────
  if (page === "results") {
    const sc = log.filter(x => x.correct).length;
    const total = examList.length;
    const pct = Math.round((sc/total)*100);
    const passed = pct >= 70;
    const emoji = pct>=90?"🏆":pct>=70?"✅":pct>=50?"⚠️":"❌";
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

  // ── ADMIN ────────────────────────────────────────────────────
  if (page === "admin") {
    const enterTab = async (tab) => {
      setAdminTab(tab); setEditQ(null); setEditCat(null); setSaveErr("");
      if (tab === "classement") await loadAllResults();
    };

    const filteredResults = classFilter==="all" ? allResults : allResults.filter(r => r.cat_id===classFilter);
    const pseudos = [...new Set(filteredResults.map(r => r.pseudo))];
    const leaderboard = pseudos.map(p => {
      const pRes = filteredResults.filter(r => r.pseudo===p);
      return { pseudo:p, count:pRes.length, avg:Math.round(pRes.reduce((a,r) => a+r.pct,0)/pRes.length), best:Math.max(...pRes.map(r => r.pct)), last:pRes[0]?.created_at };
    }).sort((a,b) => b.avg-a.avg);

    return (
      <Wrap>
        {/* Admin topbar */}
        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:52 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>🔥</span>
            <span style={{ fontFamily:"Oswald,sans-serif", fontSize:13, letterSpacing:3, textTransform:"uppercase" }}>Administration</span>
            <span style={{ background:C.red, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:2, letterSpacing:0.5 }}>ADMIN</span>
          </div>
          <button onClick={() => setPage("home")} style={{ background:"transparent", color:C.muted, border:"none", cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }}>← Site</button>
        </div>

        {/* Tabs */}
        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`, display:"flex", padding:"0 24px", overflowX:"auto" }}>
          {[["qs","📋 Questions"],["cats","🗂 Catégories"],["classement","🏆 Classement"],["settings","⚙ Paramètres"]].map(([k,l]) => (
            <button key={k} onClick={() => enterTab(k)}
              style={{ background:"none", border:"none", borderBottom:`2px solid ${adminTab===k?C.red:"transparent"}`, color:adminTab===k?C.text:C.muted, padding:"13px 16px", cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:500, fontSize:14, whiteSpace:"nowrap", transition:"all 0.15s" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ maxWidth:940, margin:"0 auto", padding:"34px 24px" }}>

          {/* ── QUESTIONS ── */}
          {adminTab === "qs" && !editQ && (<>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:16, letterSpacing:2, textTransform:"uppercase", margin:0 }}>Questions ({qs.length})</h2>
              <Btn onClick={() => { setSaveErr(""); setEditQ({ catId:cats[0]?.id||"", text:"", opts:["","","",""], correct:0, expl:"" }); }} disabled={cats.length===0}>+ Ajouter</Btn>
            </div>
            {cats.length===0 && <div style={{ color:"#d97706", fontSize:13, background:"#1a1208", border:"1px solid #3a2810", borderRadius:2, padding:"10px 14px", marginBottom:16 }}>⚠ Créez d'abord une catégorie.</div>}
            {qs.length===0 ? <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>Aucune question pour le moment.</div> : (
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
          {adminTab === "qs" && editQ && (
            <QForm initial={editQ} cats={cats} onSave={saveQ} onCancel={() => setEditQ(null)} saving={saving} saveErr={saveErr} />
          )}

          {/* ── CATEGORIES ── */}
          {adminTab === "cats" && !editCat && (<>
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
          {adminTab === "cats" && editCat && (
            <CatForm initial={editCat} cats_arr={cats} onSave={saveCat} onCancel={() => setEditCat(null)} saving={saving} saveErr={saveErr} />
          )}

          {/* ── CLASSEMENT ── */}
          {adminTab === "classement" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
                <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:16, letterSpacing:2, textTransform:"uppercase", margin:0 }}>Classement général</h2>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  <button onClick={() => setClassFilter("all")} style={{ background:classFilter==="all"?C.red:"transparent", color:classFilter==="all"?"#fff":C.muted, border:`1px solid ${classFilter==="all"?C.red:C.border}`, borderRadius:2, padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>Toutes</button>
                  {cats.map(cat => (
                    <button key={cat.id} onClick={() => setClassFilter(cat.id)} style={{ background:classFilter===cat.id?cat.color:"transparent", color:classFilter===cat.id?"#fff":C.muted, border:`1px solid ${classFilter===cat.id?cat.color:C.border}`, borderRadius:2, padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"'Barlow',sans-serif" }}>{cat.name}</button>
                  ))}
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

              {leaderboard.length === 0 ? (
                <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>
                  <div style={{ fontSize:34, marginBottom:10 }}>🏆</div>
                  Aucun résultat pour le moment.
                </div>
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
                        <div style={{ width:6, height:6, borderRadius:"50%", background:r.color||C.red, flexShrink:0 }} />
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

          {/* ── SETTINGS ── */}
          {adminTab === "settings" && (
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

        {/* Delete modal */}
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