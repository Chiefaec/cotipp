import { useState, useEffect, useRef } from "react";
import { fbLoad, fbSave, fbLoadCfg, fbSaveCfg, fbSubscribe } from "./firebase.js";

// ─── Storage ──────────────────────────────────────────────────────────────────
const SK = "cotipp_v6";
const SK_CFG = "cotipp_cfg";
const DEF = { players: [], events: [], answers: {} };
const DEF_CFG = { serviceId:"", templateId:"", publicKey:"", mailsSent:{} };
async function load() {
  try {
    const d = await fbLoad();
    return d ? { ...DEF, ...d } : DEF;
  } catch { return DEF; }
}
async function save(d) {
  try { await fbSave(d); } catch(e) { console.error("save error", e); }
}
async function loadCfg() {
  try {
    const c = await fbLoadCfg();
    return c ? { ...DEF_CFG, ...c } : DEF_CFG;
  } catch { return DEF_CFG; }
}
async function saveCfg(c) {
  try { await fbSaveCfg(c); } catch(e) { console.error("saveCfg error", e); }
}

async function sendRankingMail(cfg, player, rank, pot, eventTitle) {
  const { serviceId, templateId, publicKey } = cfg;
  const prizeAmt = i => { if(!pot) return ""; if(i===0) return ` -> CHF ${(pot*.6).toFixed(2)}`; if(i===1) return ` -> CHF ${(pot*.3).toFixed(2)}`; if(i===2) return ` -> CHF ${(pot*.1).toFixed(2)}`; return ""; };
  const medal = i => i===0?"1.":i===1?"2.":i===2?"3.":`${i+1}.`;
  const rankingText = rank.map((p,i)=>`${medal(i)} ${p.name}: ${p.pts} Punkte${prizeAmt(i)}`).join("\n");
  const myIdx = rank.findIndex(p=>p.id===player.id);
  const myPts = rank[myIdx]?.pts ?? 0;
  const prizeText = myIdx>=0 && pot ? (prizeAmt(myIdx).replace(" -> ","")) : "";
  if(!window.emailjs) {
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
    window.emailjs.init({ publicKey });
  }
  return window.emailjs.send(serviceId, templateId, {
    to_email: player.email, to_name: player.name,
    event_title: eventTitle, ranking_text: rankingText,
    my_rank: myIdx>=0 ? myIdx+1 : "-", my_pts: myPts, prize_text: prizeText,
  });
}

// ─── Text normalisation ───────────────────────────────────────────────────────
function norm(str) {
  return String(str).toLowerCase().trim()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/sch/g,"sx").replace(/sh/g,"sx")
    .replace(/\s+/g," ");
}
function textMatch(a, b) { return norm(a) === norm(b); }

// ─── Scoring ──────────────────────────────────────────────────────────────────
function computeScores(events, answers, players) {
  const scores = {};
  for (const ev of events) {
    for (const q of (ev.questions||[])) {
      if (!q.solution && q.solution !== 0) continue;
      for (const p of players) {
        const k = `${p.id}_${q.id}`;
        const ans = answers[k];
        if (!ans && ans !== 0) { scores[k]=0; continue; }
        let ok = false;
        if (q.type==="choice"||q.type==="text") ok = textMatch(ans, q.solution);
        else if (q.type==="number") { const d=Math.abs(parseFloat(ans)-parseFloat(q.solution)); ok=!isNaN(d)&&d<=Number(q.tolerance); }
        scores[k] = ok ? q.points : 0;
      }
    }
  }
  return scores;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,10);
const ADMIN_PASS = "CoTipp2025";
const hasSol = q => q.solution!==null && q.solution!==undefined && q.solution!=="";
const totalPts = (pid, scores) => Object.entries(scores).filter(([k])=>k.startsWith(pid+"_")).reduce((s,[,v])=>s+(v||0),0);
const buildRank = (players, scores) => [...players].map(p=>({...p,pts:totalPts(p.id,scores)})).sort((a,b)=>b.pts-a.pts);
const isOpen = dl => new Date(dl)>Date.now();
const fmtDate = dl => new Date(dl).toLocaleString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const countSolved = evs => evs.reduce((s,ev)=>s+(ev.questions||[]).filter(hasSol).length,0);
const countTotal  = evs => evs.reduce((s,ev)=>s+(ev.questions||[]).length,0);

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f0f2f6;--w:#fff;--s1:#f7f8fa;--s2:#eef0f5;
  --b:#dde1ea;--b2:#c8cdd8;
  --blue:#0071e3;--bh:#005bbf;--bl:#e8f0fc;--bm:#c0d6f8;
  --green:#1a9e3f;--gl:#e6f5ec;
  --orange:#c96a00;--ol:#fff3e0;
  --red:#c0392b;--rl:#fdecea;
  --gold:#b8860b;--goldl:#fffae0;
  --silver:#607080;--silverl:#edf0f3;
  --bronze:#8b4513;--bronzel:#fdf0e4;
  --t:#1c1e24;--t2:#4a5568;--t3:#8898aa;
  --sh:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.05);
  --sh2:0 4px 16px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06);
  --r:12px;--r2:18px;--r3:26px;
}
html,body{min-height:100vh;font-family:'Inter',sans-serif;color:var(--t);background:var(--bg);-webkit-font-smoothing:antialiased}
.app{min-height:100vh}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px 64px}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pop{0%{transform:scale(.7);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.pe{animation:fadeUp .3s ease both}

/* NAV */
.nav{position:sticky;top:0;z-index:100;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--b);box-shadow:0 1px 0 var(--b)}
.nav-logo{display:flex;flex-direction:column;line-height:1.1}
.nb{font-size:19px;font-weight:800;letter-spacing:-.5px;color:var(--blue)}
.nt{font-size:9px;font-weight:600;color:var(--t3);letter-spacing:.7px;text-transform:uppercase}
.nav-r{display:flex;align-items:center;gap:6px}

/* CARD */
.card{background:var(--w);border:1px solid var(--b);border-radius:var(--r2);padding:22px;margin-bottom:14px;box-shadow:var(--sh)}
.csm{padding:15px 18px}
.ctitle{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:var(--t3);margin-bottom:16px}

/* BTN */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:10px;padding:10px 20px;font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.bp{background:var(--blue);color:#fff}.bp:hover{background:var(--bh);box-shadow:0 4px 12px rgba(0,113,227,.28)}
.bs{background:var(--green);color:#fff}.bs:hover{background:#158035}
.bd{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}.bd:hover{background:#fbd8d5}
.bg{background:transparent;color:var(--t2);border:1.5px solid var(--b)}.bg:hover{border-color:var(--blue);color:var(--blue)}
.bo{background:var(--bl);color:var(--blue);border:1.5px solid var(--bm)}.bo:hover{background:var(--bm)}
.bsm{padding:7px 13px;font-size:12px;border-radius:8px}
.btn:disabled{opacity:.4;cursor:not-allowed;box-shadow:none!important}
.bfull{width:100%}

/* INPUT */
.field{margin-bottom:13px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:5px}
.inp{width:100%;background:var(--s1);border:1.5px solid var(--b);border-radius:10px;padding:10px 13px;color:var(--t);font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color .15s,box-shadow .15s}
.inp:focus{border-color:var(--blue);background:#fff;box-shadow:0 0 0 3px rgba(0,113,227,.09)}
.inp::placeholder{color:var(--t3)}
.inp:disabled{opacity:.5;cursor:not-allowed}
select.inp{cursor:pointer}

/* CHIP */
.chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600}
.cblue{background:var(--bl);color:var(--blue);border:1px solid var(--bm)}
.cgreen{background:var(--gl);color:var(--green);border:1px solid #a8d8b8}
.cred{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}
.cadmin{background:#fffae0;color:#8b6914;border:1px solid #f0d060}

/* TABS */
.tabs{display:flex;gap:3px;background:var(--s2);border:1px solid var(--b);border-radius:13px;padding:3px;margin-bottom:20px}
.tab{flex:1;padding:8px 4px;border-radius:10px;border:none;background:transparent;color:var(--t3);font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center}
.tab.active{background:var(--w);color:var(--t);box-shadow:var(--sh)}

/* Q CARD */
.qc{background:var(--s1);border:1.5px solid var(--b);border-radius:var(--r);padding:16px;margin-bottom:11px;transition:border-color .15s}
.qc.solved{border-color:#a8d8b8;background:var(--gl)}
.qh{display:flex;align-items:flex-start;gap:10px;margin-bottom:13px}
.qn{width:26px;height:26px;border-radius:7px;background:var(--bl);color:var(--blue);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.qt{font-size:14.5px;font-weight:600;line-height:1.45;flex:1}
.qp{background:var(--w);border:1px solid var(--b2);border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap;flex-shrink:0}

/* CHOICE */
.cg{display:grid;gap:7px}
.cb{width:100%;text-align:left;padding:10px 13px;background:#fff;border:1.5px solid var(--b);border-radius:9px;color:var(--t);font-family:'Inter',sans-serif;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s}
.cb:hover:not(:disabled){background:var(--bl);border-color:var(--blue);color:var(--blue)}
.cb.sel{background:var(--bl);border-color:var(--blue);color:var(--blue);font-weight:600}
.cb.cor{background:var(--gl)!important;border-color:#a8d8b8!important;color:var(--green)!important;font-weight:600!important}
.cb.wrg{background:var(--rl)!important;border-color:#f0c0bc!important;color:var(--red)!important}
.cb:disabled{opacity:.55;cursor:not-allowed}

/* BADGES */
.ab{display:inline-flex;align-items:center;gap:5px;background:var(--gl);color:var(--green);border:1px solid #a8d8b8;border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600;margin-top:8px}
.sb{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:4px 11px;font-size:12px;font-weight:700;margin-top:6px;animation:pop .35s ease}
.sbw{background:var(--goldl);color:var(--gold);border:1px solid #e8c840}
.sbl{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}

/* SOLUTION INPUT */
.solwrap{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1.5px dashed var(--b2)}
.sollbl{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
.solinp{flex:1;background:#fff;border:1.5px solid var(--b);border-radius:9px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;outline:none;color:var(--t);transition:border-color .15s,box-shadow .15s}
.solinp:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(26,158,63,.12)}
.solinp.isset{border-color:#a8d8b8;background:var(--gl);color:var(--green)}
.solbtn{padding:8px 14px;border-radius:9px;border:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap}
.solsave{background:var(--green);color:#fff}.solsave:hover{background:#158035}
.soldel{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}.soldel:hover{background:#fbd8d5}

/* ANS TABLE */
.atbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;margin-bottom:4px}
.atbl th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:5px 8px;border-bottom:1.5px solid var(--b)}
.atbl td{padding:7px 8px;border-bottom:1px solid var(--b)}
.atbl tr:last-child td{border-bottom:none}
.cg2{color:var(--green);font-weight:700}.cr{color:var(--red)}.cm{color:var(--t3);font-style:italic}

/* RANKING */
.rrow{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--b);cursor:pointer;transition:background .12s;border-radius:8px;padding-left:4px;padding-right:4px}
.rrow:last-child{border-bottom:none}
.rrow:hover{background:var(--s1)}
.rrow.clickable:hover .rname{color:var(--blue);text-decoration:underline}
.rpos{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
.rp1{background:var(--goldl);color:var(--gold)}.rp2{background:var(--silverl);color:var(--silver)}.rp3{background:var(--bronzel);color:var(--bronze)}.rpn{background:var(--s2);color:var(--t3);font-size:12px}
.rname{flex:1;font-size:14.5px;font-weight:600}
.rpts{font-size:18px;font-weight:700;font-family:'JetBrains Mono',monospace}
.rp1c{color:var(--gold)}.rp2c{color:var(--silver)}.rp3c{color:var(--bronze)}.rpnc{color:var(--t2)}

/* MY POS */
.mypos{background:linear-gradient(135deg,var(--blue),#004faa);border-radius:var(--r2);padding:20px 22px;margin-bottom:16px;color:#fff}
.mpl{font-size:11px;font-weight:600;opacity:.7;letter-spacing:.6px;text-transform:uppercase}
.mpr{font-size:34px;font-weight:800;line-height:1.1;margin:3px 0}
.mpp{font-size:13px;opacity:.8}

/* PRIZE */
.pcard{background:linear-gradient(135deg,#e8f0fc,#f0f8f0);border:1.5px solid var(--bm);border-radius:var(--r2);padding:22px;margin-bottom:16px}
.prow{display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid rgba(0,100,200,.08)}
.prow:last-child{border-bottom:none}
.pico{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px}

/* DEADLINE */
.dlbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:var(--ol);border:1px solid #ffcc80;border-radius:10px;padding:11px 15px;margin-bottom:14px}
.dlbar.cl{background:var(--rl);border-color:#f0c0bc}
.dllbl{font-size:12px;font-weight:600;color:var(--orange)}.dlbar.cl .dllbl{color:var(--red)}
.countdown{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;color:var(--orange)}.dlbar.cl .countdown{color:var(--red)}

/* PROGRESS */
.prog{height:6px;background:var(--s2);border-radius:99px;overflow:hidden}
.progf{height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:99px;transition:width .5s ease}

/* PROFILE */
.prof-header{background:linear-gradient(135deg,var(--blue),#004faa);border-radius:var(--r2);padding:24px;color:#fff;margin-bottom:16px}
.prof-name{font-size:26px;font-weight:800;margin-bottom:4px}
.prof-sub{font-size:13px;opacity:.75}
.prof-stats{display:flex;gap:20px;margin-top:16px;flex-wrap:wrap}
.prof-stat{text-align:center}
.prof-stat-n{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace}
.prof-stat-l{font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.6px}
.pq-row{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid var(--b)}
.pq-row:last-child{border-bottom:none}
.pq-num{width:24px;height:24px;border-radius:6px;background:var(--bl);color:var(--blue);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.pq-body{flex:1}
.pq-text{font-size:13.5px;font-weight:600;margin-bottom:4px}
.pq-detail{font-size:12px;color:var(--t3)}
.pq-pts{font-size:15px;font-weight:700;font-family:'JetBrains Mono',monospace;white-space:nowrap;padding-top:2px}

/* MISC */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
@media(max-width:520px){.g2{grid-template-columns:1fr}}
.flex{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fbtw{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mt4{margin-top:4px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
.w100{width:100%}
.tm{color:var(--t3);font-size:13px}
.div{height:1px;background:var(--b);margin:16px 0}
.ibox{background:#fffae0;border:1px solid #f0d060;border-radius:10px;padding:12px 15px;font-size:13px;color:#7a5a00;font-weight:500;line-height:1.5}

/* LOGIN */
.lw{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(150deg,#ddeafc,#f0f2f6 45%,#e6f3ec)}
.lc{width:100%;max-width:390px;background:#fff;border:1px solid var(--b);border-radius:var(--r3);padding:36px 30px;box-shadow:var(--sh2);animation:fadeUp .35s ease}
.lb{font-size:44px;font-weight:800;letter-spacing:-1.2px;color:var(--blue);text-align:center;line-height:1}
.ls{font-size:12.5px;color:var(--t3);text-align:center;margin:5px 0 26px}
.sep{display:flex;align-items:center;gap:10px;margin:15px 0}
.sep span{flex:1;height:1px;background:var(--b)}
.sep p{font-size:11px;color:var(--t3);font-weight:600}

/* EMPTY */
.empty{text-align:center;padding:36px 20px;color:var(--t3)}
.empty .ei{font-size:42px;margin-bottom:10px}
.empty h3{font-size:16px;font-weight:700;color:var(--t2);margin-bottom:5px}

/* TOAST */
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(70px);background:#fff;border:1px solid var(--b);border-radius:13px;padding:12px 20px;font-size:13.5px;font-weight:600;color:var(--t);z-index:9999;transition:transform .28s ease;pointer-events:none;display:flex;align-items:center;gap:8px;box-shadow:0 8px 28px rgba(0,0,0,.12);white-space:nowrap}
.toast.show{transform:translateX(-50%) translateY(0)}
.toast.ok{border-color:#a8d8b8;color:var(--green)}
.toast.err{border-color:#f0c0bc;color:var(--red)}
.footer{text-align:center;padding:24px 16px 18px;font-size:10.5px;color:var(--t3);line-height:1.8}
`;

function Countdown({ deadline }) {
  const [t,setT]=useState("");
  useEffect(()=>{
    const tick=()=>{
      const ms=new Date(deadline)-Date.now();
      if(ms<=0){setT("Abgelaufen");return;}
      const d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000);
      const m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
      setT(d>0?`${d}T ${h}h ${m}m`:`${h}h ${m}m ${s}s`);
    };
    tick(); const iv=setInterval(tick,1000); return ()=>clearInterval(iv);
  },[deadline]);
  return <span className="countdown">{t}</span>;
}

function Toast({ msg, type, show }) {
  return <div className={`toast ${type} ${show?"show":""}`}>{type==="ok"?"✓":"✕"} {msg}</div>;
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CoTipp() {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState("login");  // login|welcome|events|ranking|profile|admin
  const [profilePid, setProfilePid] = useState(null);
  const [toast, setToast] = useState({ msg:"", type:"ok", show:false });
  const tRef = useRef();

  useEffect(()=>{
    // Initial load
    load().then(d => setData(d));
    loadCfg().then(c => setCfg(c));
    // Realtime subscription - all players see updates instantly
    const unsub = fbSubscribe(d => setData({ ...DEF, ...d }));
    return () => unsub();
  },[]);
  const persist = async next => { setData(next); await save(next); };
  const toast$ = (msg, type="ok") => {
    if(tRef.current) clearTimeout(tRef.current);
    setToast({ msg, type, show:true });
    tRef.current = setTimeout(()=>setToast(v=>({...v,show:false})), 2600);
  };

  if(!data||!cfg) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",color:"#8898aa",background:"#f0f2f6"}}>Laden…</div>;
  const persistCfg = async next => { setCfg(next); await saveCfg(next); };

  const scores = computeScores(data.events, data.answers, data.players);

  const openProfile = (pid) => { setProfilePid(pid); setView("profile"); };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {session && (
          <nav className="nav">
            <div className="nav-logo">
              <span className="nb">CoTipp</span>
              <span className="nt">Wett / Spiel App für Sportfans</span>
            </div>
            <div className="nav-r">
              {session.isAdmin && <span className="chip cadmin">⚙ Admin</span>}
              {!session.isAdmin && <>
                <button className="btn bg bsm" onClick={()=>setView("events")}>🎯 Tipps</button>
                <button className="btn bg bsm" onClick={()=>setView("ranking")}>🏅 Rangliste</button>
              </>}
              {session.isAdmin && <button className="btn bg bsm" onClick={()=>setView("ranking")}>🏅 Rangliste</button>}
              <button className="btn bg bsm" onClick={()=>{ setSession(null); setView("login"); }}>Abmelden</button>
            </div>
          </nav>
        )}

        {view==="login"   && <LoginScreen   data={data} persist={persist} setSession={setSession} setView={setView} toast$={toast$} />}
        {view==="welcome" && <WelcomeScreen  data={data} session={session} setView={setView} />}
        {view==="events"  && !session?.isAdmin && <EventsScreen data={data} session={session} persist={persist} toast$={toast$} setView={setView} scores={scores} />}
        {view==="ranking" && <RankingScreen  data={data} session={session} setView={setView} scores={scores} openProfile={openProfile} />}
        {view==="profile" && <ProfileScreen  data={data} session={session} setView={setView} scores={scores} profilePid={profilePid} />}
        {view==="admin"   && session?.isAdmin && <AdminScreen data={data} persist={persist} toast$={toast$} setView={setView} scores={scores} openProfile={openProfile} cfg={cfg} persistCfg={persistCfg} />}

        <div className="footer">© {new Date().getFullYear()} Colin Aeschbacher — Alle Rechte vorbehalten · CoTipp®</div>
      </div>
      <Toast {...toast} />
    </>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ data, persist, setSession, setView, toast$ }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState("");
  const [pass,setPass]=useState(""); const [isAdmin,setIsAdmin]=useState(false);

  const go = async () => {
    const n = name.trim();
    if(!n) return toast$("Bitte Name eingeben","err");
    if(isAdmin) {
      if(pass!==ADMIN_PASS) return toast$("Falsches Admin-Passwort","err");
      setSession({ pid:"admin", isAdmin:true, name:"Admin" }); setView("admin"); return;
    }
    // Existing player → name only suffices
    let p = data.players.find(x=>x.name.toLowerCase()===n.toLowerCase());
    if(p) {
      setSession({ pid:p.id, isAdmin:false, name:p.name });
      setView("welcome"); toast$(`Willkommen zurück, ${p.name}! 👋`); return;
    }
    // New player → needs email
    if(!email.trim()) return toast$("Bitte E-Mail eingeben (für Schluss-Mail)","err");
    p = { id:uid(), name:n, email:email.trim() };
    await persist({ ...data, players:[...data.players, p] });
    setSession({ pid:p.id, isAdmin:false, name:p.name });
    setView("welcome"); toast$(`Willkommen, ${p.name}! 🎉`);
  };

  // Check if name already exists → hide email field
  const known = !!data.players.find(x=>x.name.toLowerCase()===name.trim().toLowerCase());

  return (
    <div className="lw">
      <div className="lc">
        <div className="lb">CoTipp</div>
        <div className="ls">Wett / Spiel App für Sportfans</div>
        <div className="field"><label>Dein Name</label>
          <input className="inp" placeholder="Max Mustermann" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
        </div>
        {!isAdmin && !known && (
          <div className="field">
            <label>E-Mail <span style={{fontWeight:400,color:"var(--green)"}}>optional – empfohlen</span></label>
            <input className="inp" type="email" placeholder="max@example.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
            <div style={{fontSize:11,color:"var(--green)",marginTop:5,fontWeight:500,lineHeight:1.5}}>
              📧 Mit E-Mail erhältst du nach Spielende automatisch die Schlussrangliste mit deinem Resultat zugesendet.
            </div>
          </div>
        )}
        {!isAdmin && known && name.trim() && (
          <div style={{fontSize:12,color:"var(--green)",marginBottom:12,fontWeight:600}}>✓ Spieler erkannt – direkt einloggen</div>
        )}
        {isAdmin && <div className="field"><label>Admin-Passwort</label>
          <input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
        </div>}
        <button className="btn bp bfull mt8" onClick={go}>{isAdmin?"Als Admin einloggen":known?"Einloggen":"Registrieren & Mitspielen"}</button>
        <div className="sep"><span /><p>oder</p><span /></div>
        <button className="btn bg bfull" onClick={()=>setIsAdmin(v=>!v)}>{isAdmin?"← Zurück als Spieler":"⚙ Admin-Login"}</button>
        <div style={{textAlign:"center",marginTop:22,fontSize:10,color:"var(--t3)",lineHeight:1.8}}>
          © {new Date().getFullYear()} Colin Aeschbacher<br/>Alle Rechte vorbehalten · CoTipp®
        </div>
      </div>
    </div>
  );
}

// ─── WELCOME ──────────────────────────────────────────────────────────────────
function WelcomeScreen({ data, session, setView }) {
  const pot = Number(data.events[0]?.potCHF)||0;
  const prizes = [
    {ico:"🥇",label:"1. Platz – Gewinner",pct:60,c:"var(--gold)"},
    {ico:"🥈",label:"2. Platz",pct:30,c:"var(--silver)"},
    {ico:"🥉",label:"3. Platz – Einsatz zurück",pct:10,c:"var(--bronze)"},
  ];
  return (
    <div className="wrap pe">
      <div style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px",marginBottom:4}}>👋 Willkommen, {session.name}!</div>
      <div className="tm" style={{marginBottom:20}}>Hier sind die Spielregeln und Preisverteilung.</div>
      <div className="pcard">
        <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>🏆 Preisverteilung{pot?` — Pot: CHF ${pot}`:""}</div>
        {prizes.map(({ico,label,pct,c},i)=>(
          <div key={i} className="prow">
            <div className="pico">{ico}</div>
            <div style={{flex:1,fontWeight:600,fontSize:14}}>{label}</div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:700,color:c}}>{pct}%</div>
              {pot>0&&<div style={{fontSize:11,color:"var(--t3)"}}>CHF {(pot*pct/100).toFixed(2)}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex">
        <button className="btn bp" onClick={()=>setView("events")}>🎯 Jetzt tippen</button>
        <button className="btn bg" onClick={()=>setView("ranking")}>🏅 Rangliste</button>
      </div>
    </div>
  );
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function EventsScreen({ data, session, persist, toast$, setView, scores }) {
  if(!data.events.length) return (
    <div className="wrap pe"><div className="empty"><div className="ei">📋</div><h3>Noch keine Events</h3><p>Der Admin hat noch kein Event erstellt.</p></div></div>
  );
  return (
    <div className="wrap pe">
      {data.events.map(ev=>{
        const closed=!isOpen(ev.deadline);
        const qs=ev.questions||[];
        const answered=qs.filter(q=>{ const v=data.answers[`${session.pid}_${q.id}`]; return v!==undefined&&v!==""; }).length;
        return (
          <div key={ev.id}>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.4px"}}>{ev.title}</div>
              <div className="tm mt4">Pot: CHF {ev.potCHF} · {qs.length} Fragen</div>
            </div>
            <div className={`dlbar ${closed?"cl":""}`}>
              <span className="dllbl">{closed?"⛔ Tippeingabe geschlossen":"⏱ Noch Zeit bis Deadline:"}</span>
              {closed?<span className="countdown">—</span>:<Countdown deadline={ev.deadline}/>}
            </div>
            {qs.length>0&&(
              <div style={{marginBottom:14}}>
                <div className="tm" style={{fontSize:12,marginBottom:4}}>{answered}/{qs.length} Fragen beantwortet</div>
                <div className="prog mt4"><div className="progf" style={{width:`${qs.length?(answered/qs.length)*100:0}%`}}/></div>
              </div>
            )}
            {qs.map((q,i)=>{
              const key=`${session.pid}_${q.id}`;
              const cur=data.answers[key];
              const solved=hasSol(q);
              const pts=solved?(scores[key]??0):null;
              const correct=solved&&pts>0;
              return (
                <div key={q.id} className="qc">
                  <div className="qh">
                    <div className="qn">{i+1}</div>
                    <div className="qt">{q.text}</div>
                    <div className="qp">{q.points} Pt.</div>
                  </div>
                  {q.type==="choice"&&(
                    <div className="cg">
                      {q.options.map((opt,oi)=>{
                        let cls=cur===opt?"sel":"";
                        if(solved){ if(opt===q.solution)cls="cor"; else if(opt===cur)cls="wrg"; }
                        return (
                          <button key={oi} disabled={closed||solved} className={`cb ${cls}`}
                            onClick={async()=>{ await persist({...data,answers:{...data.answers,[key]:opt}}); toast$("Tipp gespeichert ✓"); }}>
                            {opt}{solved&&opt===q.solution?" ✓":""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(q.type==="text"||q.type==="number")&&(
                    <input className="inp" type={q.type==="number"?"number":"text"}
                      placeholder={q.type==="number"?"Zahl eingeben…":"Antwort eingeben…"}
                      defaultValue={cur||""} disabled={closed||solved}
                      onBlur={async e=>{
                        if(closed||solved) return;
                        const v=e.target.value.trim(); if(!v) return;
                        await persist({...data,answers:{...data.answers,[key]:v}}); toast$("Tipp gespeichert ✓");
                      }}/>
                  )}
                  {cur&&!solved&&<div className="ab mt8">✓ Dein Tipp: <strong>{cur}</strong></div>}
                  {solved&&(
                    <div className="flex mt8" style={{gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,color:"var(--t3)"}}>Lösung: <strong style={{color:"var(--green)"}}>{q.solution}</strong>{q.type==="number"&&` (±${q.tolerance})`}</span>
                      {cur
                        ?<span className={`sb ${correct?"sbw":"sbl"}`}>{correct?`✓ +${pts} Punkte`:`✗ 0 Pt. (dein Tipp: ${cur})`}</span>
                        :<span className="sb sbl">✗ Kein Tipp – 0 Punkte</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn bo bsm mt8" onClick={()=>setView("ranking")}>🏅 Zur Rangliste</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── RANKING ──────────────────────────────────────────────────────────────────
function RankingScreen({ data, session, setView, scores, openProfile }) {
  const rank = buildRank(data.players, scores);
  const pot = Number(data.events[0]?.potCHF)||0;
  const myIdx = rank.findIndex(p=>p.id===session.pid);
  const solved=countSolved(data.events), total=countTotal(data.events);

  const prize = i => {
    if(!pot) return null;
    if(i===0) return `CHF ${(pot*.6).toFixed(2)}`;
    if(i===1) return `CHF ${(pot*.3).toFixed(2)}`;
    if(i===2) return `CHF ${(pot*.1).toFixed(2)}`;
    return null;
  };

  return (
    <div className="wrap pe">
      <div style={{marginBottom:16}}>
        <div style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px"}}>🏆 Rangliste</div>
        <div className="tm mt4">{solved}/{total} Fragen bewertet · Klick auf Spieler für Details</div>
        {total>0&&<div className="prog mt8"><div className="progf" style={{width:`${(solved/total)*100}%`}}/></div>}
      </div>

      {!session.isAdmin && myIdx>=0 && (
        <div className="mypos" style={{cursor:"pointer"}} onClick={()=>openProfile(session.pid)}>
          <div className="mpl">Deine aktuelle Position</div>
          <div className="mpr">Platz {myIdx+1}</div>
          <div className="mpp">{rank[myIdx].pts} Punkte{prize(myIdx)?` · ${prize(myIdx)}`:""} · Profil ansehen →</div>
        </div>
      )}

      <div className="card">
        <div className="ctitle">Gesamtrangliste — {rank.length} Spieler</div>
        {rank.length===0&&<div className="empty"><div className="ei">🏅</div><h3>Noch keine Punkte</h3><p>Sobald der Admin Lösungen einträgt, erscheint hier die Rangliste.</p></div>}
        {rank.map((p,i)=>{
          const pc=i===0?"rp1":i===1?"rp2":i===2?"rp3":"rpn";
          const ptc=i===0?"rp1c":i===1?"rp2c":i===2?"rp3c":"rpnc";
          return (
            <div key={p.id} className="rrow clickable" style={{animation:"fadeUp .3s ease both",animationDelay:`${i*40}ms`}}
              onClick={()=>openProfile(p.id)}>
              <div className={`rpos ${pc}`}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
              <div style={{flex:1}}>
                <div className="rname">{p.name}{p.id===session.pid&&<span style={{marginLeft:8,fontSize:11,color:"var(--blue)",fontWeight:600}}>← Du</span>}</div>
                {prize(i)&&<div style={{fontSize:12,fontWeight:600,marginTop:2,color:i===0?"var(--gold)":i===1?"var(--silver)":"var(--bronze)"}}>{prize(i)}</div>}
              </div>
              <div className={`rpts ${ptc}`}>{p.pts}</div>
              <div style={{fontSize:12,color:"var(--t3)"}}>›</div>
            </div>
          );
        })}
      </div>
      <button className="btn bg bsm" onClick={()=>setView(session.isAdmin?"admin":"events")}>← Zurück</button>
    </div>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function ProfileScreen({ data, session, setView, scores, profilePid }) {
  const player = data.players.find(p=>p.id===profilePid);
  if(!player) return <div className="wrap pe"><div className="empty"><div className="ei">👤</div><h3>Spieler nicht gefunden</h3></div></div>;

  const rank = buildRank(data.players, scores);
  const myRankIdx = rank.findIndex(p=>p.id===profilePid);
  const myPts = totalPts(profilePid, scores);
  const pot = Number(data.events[0]?.potCHF)||0;
  const isMe = session.pid === profilePid;

  const prize = i => {
    if(!pot) return null;
    if(i===0) return `CHF ${(pot*.6).toFixed(2)}`;
    if(i===1) return `CHF ${(pot*.3).toFixed(2)}`;
    if(i===2) return `CHF ${(pot*.1).toFixed(2)}`;
    return null;
  };

  // Count correct answers
  let correct=0, evaluated=0;
  const allQ = data.events.flatMap(ev=>(ev.questions||[]).map(q=>({...q,evTitle:ev.title})));
  allQ.forEach(q=>{ if(hasSol(q)){ evaluated++; const k=`${profilePid}_${q.id}`; if((scores[k]??0)>0) correct++; } });

  return (
    <div className="wrap pe">
      {/* Profile header */}
      <div className="prof-header">
        <div className="prof-name">{isMe?"👤 Mein Profil":player.name}</div>
        <div className="prof-sub">{isMe?player.name:""}</div>
        <div className="prof-stats">
          <div className="prof-stat">
            <div className="prof-stat-n">{myRankIdx>=0?myRankIdx+1:"–"}</div>
            <div className="prof-stat-l">Platz</div>
          </div>
          <div className="prof-stat">
            <div className="prof-stat-n">{myPts}</div>
            <div className="prof-stat-l">Punkte</div>
          </div>
          <div className="prof-stat">
            <div className="prof-stat-n">{evaluated>0?`${correct}/${evaluated}`:"–"}</div>
            <div className="prof-stat-l">Richtig</div>
          </div>
          {pot>0&&myRankIdx>=0&&prize(myRankIdx)&&(
            <div className="prof-stat">
              <div className="prof-stat-n" style={{fontSize:16}}>{prize(myRankIdx)}</div>
              <div className="prof-stat-l">Gewinn</div>
            </div>
          )}
        </div>
      </div>

      {/* Per-event question breakdown */}
      {data.events.map(ev=>{
        const qs = ev.questions||[];
        const evPts = qs.reduce((s,q)=>{ const k=`${profilePid}_${q.id}`; return s+(hasSol(q)?(scores[k]??0):0); },0);
        const evMax = qs.reduce((s,q)=>s+q.points,0);
        const closed = !isOpen(ev.deadline);

        return (
          <div key={ev.id} className="card">
            <div className="fbtw" style={{marginBottom:14}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{ev.title}</div>
                <div className="tm mt4">{evPts} / {evMax} Punkte</div>
              </div>
              {!closed&&<span className="chip cgreen">● Offen</span>}
              {closed&&<span className="chip cred">● Geschlossen</span>}
            </div>

            {!qs.length&&<div className="tm">Keine Fragen</div>}
            {qs.map((q,qi)=>{
              const k = `${profilePid}_${q.id}`;
              const ans = data.answers[k];
              const solved = hasSol(q);
              const pts = solved ? (scores[k]??0) : null;
              const correct = solved && pts>0;

              // Only show if deadline passed OR solution revealed
              const showDetail = closed || solved;

              if(!showDetail) return (
                <div key={q.id} className="pq-row">
                  <div className="pq-num">{qi+1}</div>
                  <div className="pq-body">
                    <div className="pq-text">{q.text}</div>
                    <div className="pq-detail">
                      {ans?<span style={{color:"var(--blue)"}}>Tipp: {ans}</span>:<span className="cm">Kein Tipp</span>}
                      {" · "}<span style={{color:"var(--orange)"}}>Noch nicht bewertet</span>
                    </div>
                  </div>
                  <div className="pq-pts" style={{color:"var(--t3)"}}>{q.points} Pt.</div>
                </div>
              );

              return (
                <div key={q.id} className="pq-row">
                  <div className="pq-num" style={{background:solved?(correct?"var(--gl)":"var(--rl)"):"var(--bl)",color:solved?(correct?"var(--green)":"var(--red)"):"var(--blue)"}}>{qi+1}</div>
                  <div className="pq-body">
                    <div className="pq-text">{q.text}</div>
                    <div className="pq-detail">
                      {ans?<span style={{color:solved?(correct?"var(--green)":"var(--red)"):"var(--t2)"}}>{ans}</span>:<span className="cm">Kein Tipp</span>}
                      {solved&&<span style={{marginLeft:6,color:"var(--t3)"}}>· Lösung: <strong style={{color:"var(--green)"}}>{q.solution}</strong></span>}
                    </div>
                  </div>
                  <div className="pq-pts" style={{color:solved?(correct?"var(--green)":"var(--red)"):"var(--t3)"}}>
                    {solved?(correct?`+${pts}`:"0"):""} {solved?"Pt.":q.points+" Pt."}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <button className="btn bg bsm" onClick={()=>setView("ranking")}>← Zurück zur Rangliste</button>
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminScreen({ data, persist, toast$, setView, scores, openProfile, cfg, persistCfg }) {
  const [tab, setTab] = useState("solutions");
  const [evForm, setEvForm] = useState({ title:"", deadline:"", potCHF:"" });
  const [qForm, setQForm] = useState({ eventId:data.events[0]?.id||"", text:"", type:"choice", points:10, options:["","","",""], tolerance:0 });
  const [selEv, setSelEv] = useState(data.events[0]?.id||"");
  const [drafts, setDrafts] = useState({});
  const [mailCfg, setMailCfg] = useState({ serviceId:cfg.serviceId||"", templateId:cfg.templateId||"", publicKey:cfg.publicKey||"" });
  const [mailSending, setMailSending] = useState(false);

  const solved=countSolved(data.events), total=countTotal(data.events);
  const allSolved = total>0 && solved===total;

  const createEvent = async () => {
    if(!evForm.title.trim()||!evForm.deadline) return toast$("Titel und Deadline erforderlich","err");
    const ev={id:uid(),title:evForm.title.trim(),deadline:evForm.deadline,potCHF:evForm.potCHF||0,questions:[]};
    const next={...data,events:[...data.events,ev]};
    await persist(next); setEvForm({title:"",deadline:"",potCHF:""}); setSelEv(ev.id);
    setQForm(f=>({...f,eventId:ev.id})); toast$("Event erstellt ✓");
  };

  const addQ = async () => {
    const {eventId,text,type,points,options,tolerance}=qForm;
    if(!text.trim()||!eventId) return toast$("Frage und Event erforderlich","err");
    if(type==="choice"&&options.filter(o=>o.trim()).length<2) return toast$("Min. 2 Optionen angeben","err");
    const q={id:uid(),text:text.trim(),type,points:Number(points),options:type==="choice"?options.filter(o=>o.trim()):[],tolerance:type==="number"?Number(tolerance):0,solution:null};
    await persist({...data,events:data.events.map(e=>e.id===eventId?{...e,questions:[...e.questions,q]}:e)});
    setQForm(f=>({...f,text:"",options:["","","",""],tolerance:0})); toast$("Frage hinzugefügt ✓");
  };

  const deleteQ = async (evId,qId) => {
    await persist({...data,events:data.events.map(e=>e.id===evId?{...e,questions:e.questions.filter(q=>q.id!==qId)}:e)});
    toast$("Frage gelöscht");
  };

  const setSol = async (evId,qId,sol) => {
    const next={...data,events:data.events.map(e=>e.id===evId?{...e,questions:e.questions.map(q=>q.id===qId?{...q,solution:sol||null}:q)}:e)};
    await persist(next);
    setDrafts(d=>{ const n={...d}; delete n[qId]; return n; });
    if(sol){
      toast$("Lösung gespeichert – Rangliste aktualisiert!");
      // Check if now all questions are solved -> prompt mail
      const nowSolved = countSolved(next.events);
      const nowTotal = countTotal(next.events);
      if(nowTotal>0 && nowSolved===nowTotal && cfg.serviceId && cfg.templateId && cfg.publicKey){
        toast$("Alle Fragen bewertet! Mails werden versendet...");
        autoSendMails(next, cfg);
      }
    } else toast$("Lösung entfernt");
  };

  const autoSendMails = async (currentData, currentCfg) => {
    const currentScores = computeScores(currentData.events, currentData.answers, currentData.players);
    const rank = buildRank(currentData.players, currentScores);
    const pot = Number(currentData.events[0]?.potCHF)||0;
    const eventTitle = currentData.events[0]?.title||"CoTipp";
    const newSent = {...(currentCfg.mailsSent||{})};
    const playersWithMail = currentData.players.filter(p=>p.email&&!newSent[p.id]);
    let ok=0, fail=0;
    for(const p of playersWithMail){
      try{
        await sendRankingMail(currentCfg, p, rank, pot, eventTitle);
        newSent[p.id]=true; ok++;
      } catch(e){ fail++; }
    }
    const updCfg = {...currentCfg, mailsSent:newSent};
    await persistCfg(updCfg);
    if(ok>0) toast$(`Mail an ${ok} Spieler versendet!`);
    if(fail>0) toast$(`${fail} Mails fehlgeschlagen. EmailJS-Config prüfen.`,"err");
  };

  const sendMailsManually = async () => {
    if(!cfg.serviceId||!cfg.templateId||!cfg.publicKey) return toast$("Bitte zuerst EmailJS konfigurieren","err");
    setMailSending(true);
    await autoSendMails(data, {...cfg, mailsSent:{}});
    setMailSending(false);
  };

  // Admin ranking tab
  const rank = buildRank(data.players, scores);
  const pot = Number(data.events[0]?.potCHF)||0;
  const prize = i => { if(!pot) return null; if(i===0) return `CHF ${(pot*.6).toFixed(2)}`; if(i===1) return `CHF ${(pot*.3).toFixed(2)}`; if(i===2) return `CHF ${(pot*.1).toFixed(2)}`; return null; };

  const TABS = [
    {id:"solutions",l:"✅ Lösungen"},
    {id:"ranking",l:"🏅 Rangliste"},
    {id:"events",l:"📅 Events"},
    {id:"questions",l:"❓ Fragen"},
    {id:"players",l:"👥 Spieler"},
    {id:"mail",l:"📧 Mail"},
  ];

  return (
    <div className="wrap pe">
      <div style={{marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.4px"}}>⚙ Admin-Panel</div>
        <div className="tm mt4">{solved}/{total} Fragen bewertet · {data.players.length} Spieler</div>
        {total>0&&<div className="prog mt8"><div className="progf" style={{width:`${(solved/total)*100}%`}}/></div>}
      </div>

      <div className="tabs">
        {TABS.map(t=><button key={t.id} className={`tab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>)}
      </div>

      {/* ── SOLUTIONS ── */}
      {tab==="solutions"&&(
        <>
          <div className="ibox" style={{marginBottom:16}}>
            💡 Trage die richtige Antwort pro Frage ein und klicke <strong>Speichern</strong>. Punkte werden <strong>sofort automatisch berechnet</strong> und die Rangliste aktualisiert.
          </div>
          {!data.events.length&&<div className="empty"><div className="ei">📅</div><h3>Noch keine Events</h3></div>}
          {data.events.map(ev=>{
            const qs=ev.questions||[];
            const evSolved=qs.filter(hasSol).length;
            return (
              <div key={ev.id} className="card">
                <div className="fbtw" style={{marginBottom:16}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16}}>{ev.title}</div>
                    <div className="tm mt4">{evSolved}/{qs.length} Fragen bewertet</div>
                    {qs.length>0&&<div className="prog mt4" style={{width:160}}><div className="progf" style={{width:`${(evSolved/qs.length)*100}%`}}/></div>}
                  </div>
                  <button className="btn bo bsm" onClick={()=>setTab("ranking")}>🏅 Rangliste</button>
                </div>
                {!qs.length&&<div className="tm">Keine Fragen vorhanden</div>}
                {qs.map((q,qi)=>{
                  const isSolved=hasSol(q);
                  const draft=drafts[q.id]??(isSolved?q.solution:"");
                  return (
                    <div key={q.id} className={`qc ${isSolved?"solved":""}`}>
                      <div className="qh">
                        <div className="qn">{qi+1}</div>
                        <div className="qt">{q.text}</div>
                        <div className="qp">{q.points} Pt.</div>
                        {isSolved&&<span className="chip cgreen" style={{flexShrink:0}}>✓ Bewertet</span>}
                      </div>
                      {data.players.length>0&&(
                        <table className="atbl">
                          <thead><tr><th>Spieler</th><th>Tipp</th>{isSolved&&<th>Punkte</th>}</tr></thead>
                          <tbody>
                            {data.players.map(p=>{
                              const k=`${p.id}_${q.id}`;
                              const ans=data.answers[k];
                              const pts=isSolved?(scores[k]??0):null;
                              return (
                                <tr key={p.id}>
                                  <td style={{fontWeight:600,cursor:"pointer",color:"var(--blue)"}} onClick={()=>openProfile(p.id)}>{p.name}</td>
                                  <td>{ans!==undefined&&ans!==""&&ans!==null?<span className={isSolved?(pts>0?"cg2":"cr"):""}>{ans}</span>:<span className="cm">kein Tipp</span>}</td>
                                  {isSolved&&<td style={{fontWeight:700,color:pts>0?"var(--green)":"var(--t3)"}}>{pts}</td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <div className="solwrap">
                        <span className="sollbl">Lösung:</span>
                        {q.type==="choice"
                          ?<select className={`solinp ${draft?"isset":""}`} value={draft} onChange={e=>setDrafts(d=>({...d,[q.id]:e.target.value}))}>
                              <option value="">– Richtige Antwort –</option>
                              {q.options.map((o,oi)=><option key={oi} value={o}>{o}</option>)}
                            </select>
                          :<input className={`solinp ${draft?"isset":""}`} type={q.type==="number"?"number":"text"}
                              placeholder={q.type==="number"?`Zahl (±${q.tolerance})`:"Korrekte Antwort…"}
                              value={draft} onChange={e=>setDrafts(d=>({...d,[q.id]:e.target.value}))}/>
                        }
                        <button className="solbtn solsave" disabled={!draft} onClick={()=>setSol(ev.id,q.id,draft)}>
                          {isSolved?"Aktualisieren":"Speichern"}
                        </button>
                        {isSolved&&<button className="solbtn soldel" onClick={()=>setSol(ev.id,q.id,null)}>✕</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}

      {/* ── ADMIN RANKING TAB ── */}
      {tab==="ranking"&&(
        <>
          <div className="ibox" style={{marginBottom:16}}>
            Klick auf einen Spieler um sein detailliertes Profil zu sehen.
          </div>
          <div className="card">
            <div className="ctitle">Zwischenrangliste — {rank.length} Spieler · {solved}/{total} bewertet</div>
            {total>0&&<div className="prog" style={{marginBottom:16}}><div className="progf" style={{width:`${(solved/total)*100}%`}}/></div>}
            {rank.length===0&&<div className="empty"><div className="ei">🏅</div><h3>Noch keine Punkte</h3></div>}
            {rank.map((p,i)=>{
              const pc=i===0?"rp1":i===1?"rp2":i===2?"rp3":"rpn";
              const ptc=i===0?"rp1c":i===1?"rp2c":i===2?"rp3c":"rpnc";
              return (
                <div key={p.id} className="rrow clickable" style={{animation:"fadeUp .3s ease both",animationDelay:`${i*40}ms`}}
                  onClick={()=>openProfile(p.id)}>
                  <div className={`rpos ${pc}`}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                  <div style={{flex:1}}>
                    <div className="rname">{p.name}</div>
                    {prize(i)&&<div style={{fontSize:12,fontWeight:600,marginTop:2,color:i===0?"var(--gold)":i===1?"var(--silver)":"var(--bronze)"}}>{prize(i)}</div>}
                    <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>{p.email}</div>
                  </div>
                  <div className={`rpts ${ptc}`}>{p.pts}</div>
                  <div style={{fontSize:12,color:"var(--t3)"}}>›</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── EVENTS ── */}
      {tab==="events"&&(
        <>
          <div className="card">
            <div className="ctitle">Neues Event erstellen</div>
            <div className="field"><label>Titel</label><input className="inp" placeholder="EM Finale 2026" value={evForm.title} onChange={e=>setEvForm(f=>({...f,title:e.target.value}))}/></div>
            <div className="g2">
              <div className="field"><label>Tipp-Deadline</label><input className="inp" type="datetime-local" value={evForm.deadline} onChange={e=>setEvForm(f=>({...f,deadline:e.target.value}))}/></div>
              <div className="field"><label>Pot (CHF)</label><input className="inp" type="number" min={0} placeholder="200" value={evForm.potCHF} onChange={e=>setEvForm(f=>({...f,potCHF:e.target.value}))}/></div>
            </div>
            <button className="btn bp" onClick={createEvent}>+ Event erstellen</button>
          </div>
          {!data.events.length&&<div className="empty"><div className="ei">📅</div><h3>Noch keine Events</h3></div>}
          {data.events.map(ev=>(
            <div key={ev.id} className="card csm">
              <div className="fbtw">
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{ev.title}</div>
                  <div className="tm mt4">Deadline: {fmtDate(ev.deadline)} · CHF {ev.potCHF} · {ev.questions?.length||0} Fragen</div>
                  <span className={`chip mt4 ${isOpen(ev.deadline)?"cgreen":"cred"}`} style={{display:"inline-flex",marginTop:8}}>
                    {isOpen(ev.deadline)?"● Offen":"● Geschlossen"}
                  </span>
                </div>
                <button className="btn bd bsm" onClick={async()=>{ await persist({...data,events:data.events.filter(e=>e.id!==ev.id)}); toast$("Event gelöscht"); }}>Löschen</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── QUESTIONS ── */}
      {tab==="questions"&&(
        <>
          <div className="card">
            <div className="ctitle">Neue Frage hinzufügen</div>
            <div className="field"><label>Event</label>
              <select className="inp" value={qForm.eventId} onChange={e=>setQForm(f=>({...f,eventId:e.target.value}))}>
                <option value="">– Event wählen –</option>
                {data.events.map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
            <div className="field"><label>Fragetext</label><input className="inp" placeholder="Wer gewinnt das Finale?" value={qForm.text} onChange={e=>setQForm(f=>({...f,text:e.target.value}))}/></div>
            <div className="g2">
              <div className="field"><label>Typ</label>
                <select className="inp" value={qForm.type} onChange={e=>setQForm(f=>({...f,type:e.target.value}))}>
                  <option value="choice">Auswahl (Multiple Choice)</option>
                  <option value="text">Freitext (offene Antwort)</option>
                  <option value="number">Zahl mit Toleranz</option>
                </select>
              </div>
              <div className="field"><label>Max. Punkte</label><input className="inp" type="number" min={1} value={qForm.points} onChange={e=>setQForm(f=>({...f,points:e.target.value}))}/></div>
            </div>
            {qForm.type==="choice"&&(
              <div className="field"><label>Antwort-Optionen</label>
                {qForm.options.map((opt,i)=>(
                  <input key={i} className="inp" style={{marginBottom:7}} placeholder={`Option ${i+1}`} value={opt}
                    onChange={e=>{ const o=[...qForm.options]; o[i]=e.target.value; setQForm(f=>({...f,options:o})); }}/>
                ))}
                <button className="btn bg bsm mt4" onClick={()=>setQForm(f=>({...f,options:[...f.options,""]}))}>+ Option</button>
              </div>
            )}
            {qForm.type==="number"&&(
              <div className="field"><label>Toleranz (±)</label>
                <input className="inp" type="number" min={0} value={qForm.tolerance} onChange={e=>setQForm(f=>({...f,tolerance:e.target.value}))}/>
                <div className="tm mt4">Antworten innerhalb ±{qForm.tolerance} zählen als richtig</div>
              </div>
            )}
            <button className="btn bp mt8" onClick={addQ}>+ Frage hinzufügen</button>
          </div>
          <div className="field"><label>Fragen für Event:</label>
            <select className="inp" value={selEv} onChange={e=>setSelEv(e.target.value)}>
              {data.events.map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          </div>
          {data.events.filter(e=>e.id===selEv).map(ev=>(
            <div key={ev.id} className="card">
              <div className="ctitle">{ev.title} — {ev.questions?.length||0} Fragen</div>
              {!ev.questions?.length&&<div className="tm">Noch keine Fragen</div>}
              {ev.questions?.map((q,i)=>(
                <div key={q.id} className="qc">
                  <div className="fbtw">
                    <div style={{flex:1,paddingRight:12}}>
                      <div style={{fontWeight:600,fontSize:14}}>{i+1}. {q.text}</div>
                      <div className="tm mt4">{q.type==="choice"?q.options.join(" / "):q.type==="number"?`Zahl ±${q.tolerance}`:"Freitext"} · {q.points} Pt.</div>
                      {hasSol(q)&&<span className="chip cgreen" style={{marginTop:6}}>✓ Lösung: {q.solution}</span>}
                    </div>
                    <button className="btn bd bsm" onClick={()=>deleteQ(ev.id,q.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── PLAYERS ── */}
      {tab==="players"&&(
        <div className="card">
          <div className="ctitle">Alle Spieler — {data.players.length} Personen</div>
          {!data.players.length&&<div className="empty"><div className="ei">👥</div><h3>Noch keine Spieler</h3><p>Spieler registrieren sich selbst beim Login.</p></div>}
          {buildRank(data.players,scores).map((p,i)=>{
            const pc=i===0?"rp1":i===1?"rp2":i===2?"rp3":"rpn";
            const ptc=i===0?"rp1c":i===1?"rp2c":i===2?"rp3c":"rpnc";
            return (
              <div key={p.id} className="rrow clickable" onClick={()=>openProfile(p.id)}>
                <div className={`rpos ${pc}`}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                <div style={{flex:1}}>
                  <div className="rname">{p.name}</div>
                  <div style={{fontSize:12,color:"var(--t3)"}}>{p.email||<span style={{fontStyle:"italic",opacity:.6}}>keine Mail</span>}</div>
                </div>
                <div className={`rpts ${ptc}`}>{p.pts}</div>
                <div style={{fontSize:12,color:"var(--t3)"}}>›</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MAIL ── */}
      {tab==="mail"&&(
        <>
          <div className="card">
            <div className="ctitle">📧 EmailJS Konfiguration</div>
            <div className="ibox" style={{marginBottom:16}}>
              <strong>Einmalig einrichten:</strong> Gehe auf <a href="https://emailjs.com" target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>emailjs.com</a>, erstelle ein kostenloses Konto (200 Mails/Monat), verbinde deinen Mail-Service und erstelle ein Template mit den Variablen: <code>to_email</code>, <code>to_name</code>, <code>event_title</code>, <code>ranking_text</code>, <code>my_rank</code>, <code>my_pts</code>, <code>prize_text</code>. Danach trägst du die drei Keys unten ein.
            </div>
            <div className="field"><label>Service ID</label>
              <input className="inp" placeholder="service_xxxxxxx" value={mailCfg.serviceId} onChange={e=>setMailCfg(m=>({...m,serviceId:e.target.value}))}/>
            </div>
            <div className="field"><label>Template ID</label>
              <input className="inp" placeholder="template_xxxxxxx" value={mailCfg.templateId} onChange={e=>setMailCfg(m=>({...m,templateId:e.target.value}))}/>
            </div>
            <div className="field"><label>Public Key</label>
              <input className="inp" placeholder="XXXXXXXXXXXXXXX" value={mailCfg.publicKey} onChange={e=>setMailCfg(m=>({...m,publicKey:e.target.value}))}/>
            </div>
            <div className="flex mt8">
              <button className="btn bp" onClick={async()=>{ await persistCfg({...cfg,...mailCfg}); toast$("Konfiguration gespeichert ✓"); }}>Speichern</button>
              {cfg.serviceId&&cfg.templateId&&cfg.publicKey&&<span className="chip cgreen">✓ Konfiguriert</span>}
            </div>
          </div>

          <div className="card">
            <div className="ctitle">Mail-Versand</div>
            <div style={{marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:6}}>Automatischer Versand</div>
              <div className="tm">Sobald du die letzte Frage bewertest, werden Mails automatisch an alle Spieler mit E-Mail-Adresse versendet.</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:6}}>Manueller Versand</div>
              <div className="tm" style={{marginBottom:10}}>Schlussrangliste jetzt manuell an alle Spieler senden (bereits versendete werden erneut gesendet).</div>
              <div className="fbtw" style={{flexWrap:"wrap",gap:10}}>
                <div className="tm">
                  {data.players.filter(p=>p.email).length} von {data.players.length} Spielern haben eine E-Mail hinterlegt.
                  {Object.keys(cfg.mailsSent||{}).length>0&&<span style={{marginLeft:8,color:"var(--green)",fontWeight:600}}>· {Object.keys(cfg.mailsSent).length} bereits versendet</span>}
                </div>
                <button className="btn bs bsm" disabled={mailSending||!cfg.serviceId} onClick={sendMailsManually}>
                  {mailSending?"Wird gesendet…":"📧 Mails jetzt senden"}
                </button>
              </div>
            </div>
            {!cfg.serviceId&&(
              <div style={{background:"var(--ol)",border:"1px solid #ffcc80",borderRadius:10,padding:"10px 14px",fontSize:12,color:"var(--orange)",marginTop:8}}>
                ⚠ EmailJS noch nicht konfiguriert. Bitte zuerst die Keys oben eintragen.
              </div>
            )}
            <div style={{marginTop:16}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Spieler mit Mail:</div>
              {data.players.filter(p=>p.email).map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--b)",fontSize:13}}>
                  <span style={{flex:1,fontWeight:600}}>{p.name}</span>
                  <span style={{color:"var(--t3)"}}>{p.email}</span>
                  {cfg.mailsSent?.[p.id]&&<span className="chip cgreen" style={{fontSize:10}}>✓ gesendet</span>}
                </div>
              ))}
              {!data.players.filter(p=>p.email).length&&<div className="tm">Noch kein Spieler hat eine E-Mail hinterlegt.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
