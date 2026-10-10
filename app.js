import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let mode = "login", currentUser = null, currentProfile = null, allEvents = [], allStudents = [];
const authView = $("authView"), dashboardView = $("dashboardView");
const friendlyErrors = {
  "auth/email-already-in-use":"An account already exists for this email. Please log in.",
  "auth/invalid-email":"Please enter a valid email address.",
  "auth/weak-password":"Use a password with at least 6 characters.",
  "auth/invalid-credential":"Email or password is incorrect.",
  "auth/user-not-found":"No account found. Please check your email or sign up.",
  "auth/wrong-password":"Email or password is incorrect.",
  "permission-denied":"Permission denied. Check your Firestore rules and account role.",
  "already-exists":"This roll number is already registered.",
  "event-full":"This event has reached its registration capacity.",
  "already-registered":"You are already registered for this event."
};
function showToast(message, bad=false) {
  const el=$("toast"); el.textContent=message; el.classList.remove("d-none","bad");
  if(bad) el.classList.add("bad"); clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>el.classList.add("d-none"),3500);
}
function showError(message) { $("authError").textContent=message; $("authError").classList.remove("d-none"); }
function setMode(next) {
  mode=next; $("authError").classList.add("d-none");
  document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("authTitle").textContent=mode==="login"?"Welcome back":"Find your people";
  $("authSubtitle").textContent=mode==="login"?"Log in to continue to your dashboard.":"Create your student account to start exploring.";
  $("authSubmit").innerHTML=mode==="login"?'Log in <span>→</span>':'Create student account <span>→</span>';
  ["nameGroup","rollGroup","confirmGroup"].forEach(id=>$(id).classList.toggle("d-none",mode!=="signup"));
  $("password").autocomplete=mode==="login"?"current-password":"new-password";
}
document.querySelectorAll(".auth-tab").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("logoutBtn").addEventListener("click",()=>signOut(auth));
$("authForm").addEventListener("submit", async e=>{
  e.preventDefault(); $("authError").classList.add("d-none");
  const email=$("email").value.trim().toLowerCase(), password=$("password").value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Enter a valid email address.");
  if(password.length<6) return showError("Password must contain at least 6 characters.");
  const button=$("authSubmit"); button.disabled=true;
  try {
    if(mode==="signup") {
      const name=$("studentName").value.trim(), roll=$("rollNo").value.trim().toUpperCase();
      if(name.length<2) throw Error("Enter your full name (at least 2 characters).");
      if(!/^[A-Z0-9/-]{3,30}$/.test(roll)) throw Error("Roll number must be 3–30 characters and contain only letters, numbers, / or -.");
      if($("confirmPassword").value!==password) throw Error("Passwords do not match.");
      const credential=await createUserWithEmailAndPassword(auth,email,password);
      await updateProfile(credential.user,{displayName:name});
      // Transaction makes roll number uniqueness atomic across concurrent signups.
      try {
        await runTransaction(db, async tx=>{
          const rollRef=doc(db,"rollNumbers",encodeURIComponent(roll));
          const rollSnap=await tx.get(rollRef);
          if(rollSnap.exists()) throw Error("This roll number is already registered.");
          tx.set(rollRef,{uid:credential.user.uid,rollNo:roll,createdAt:serverTimestamp()});
          tx.set(doc(db,"users",credential.user.uid),{
            uid:credential.user.uid,name,rollNo:roll,email,role:"student",createdAt:serverTimestamp()
          });
        });
      } catch(err) {
        // Remove newly created auth user if profile creation fails.
        await credential.user.delete().catch(()=>{});
        throw err;
      }
      showToast("Account created. Welcome to EventSphere!");
    } else {
      await signInWithEmailAndPassword(auth,email,password);
    }
  } catch(err) { showError(friendlyErrors[err.code] || err.message || "Something went wrong. Please try again."); }
  finally { button.disabled=false; }
});
onAuthStateChanged(auth, async user=>{
  currentUser=user;
  if(!user) { currentProfile=null; authView.classList.remove("d-none"); dashboardView.classList.add("d-none"); $("logoutBtn").classList.add("d-none"); $("navUser").textContent=""; return; }
  try {
    const snap=await getDoc(doc(db,"users",user.uid));
    if(!snap.exists()) { await signOut(auth); showToast("Your account profile is missing. Contact the administrator.",true); return; }
    currentProfile=snap.data();
    if(!["admin","student"].includes(currentProfile.role)) { await signOut(auth); showToast("Account role is not configured.",true); return; }
    authView.classList.add("d-none"); dashboardView.classList.remove("d-none");
    $("logoutBtn").classList.remove("d-none"); $("navUser").textContent=currentProfile.name || user.email;
    $("welcomeTitle").textContent=`Hey, ${(currentProfile.name||"there").split(" ")[0]}.`;
    $("welcomeSub").textContent=currentProfile.role==="admin"?"Here’s the pulse of your campus community.":"Your next great experience starts here.";
    $("rolePill").textContent=currentProfile.role.toUpperCase();
    $("adminTools").classList.toggle("d-none",currentProfile.role!=="admin");
    $("studentAdminTable").classList.toggle("d-none",currentProfile.role!=="admin");
    $("eventsHeading").textContent=currentProfile.role==="admin"?"Manage campus events":"Explore events";
    await refreshDashboard();
  } catch(err) { console.error(err); showToast(friendlyErrors[err.code]||"Could not load dashboard. Check Firestore rules.",true); }
});
async function refreshDashboard() {
  const [eventSnap,regSnap]=await Promise.all([
    getDocs(query(collection(db,"events"),orderBy("date","asc"))),
    getDocs(currentProfile.role==="admin" ? collection(db,"registrations") : query(collection(db,"registrations"),where("uid","==",currentUser.uid)))
  ]);
  allEvents=eventSnap.docs.map(d=>({id:d.id,...d.data()}));
  const registrations=regSnap.docs.map(d=>({id:d.id,...d.data()}));
  const upcoming=allEvents.filter(e=>e.date && new Date(e.date).getTime()>=Date.now());
  const myRegs=registrations.filter(r=>r.uid===currentUser.uid);
  const stats=currentProfile.role==="admin" ? [
    ["STUDENTS",null,"users"],["EVENTS",allEvents.length,"calendar-days"],["REGISTRATIONS",registrations.length,"ticket"],["UPCOMING",upcoming.length,"sparkles"]
  ] : [
    ["UPCOMING EVENTS",upcoming.length,"calendar-days"],["MY REGISTRATIONS",myRegs.length,"ticket"],["CATEGORIES",new Set(allEvents.map(e=>e.category)).size,"layers"],["PROFILE STATUS","Active","check-circle"]
  ];
  if(currentProfile.role==="admin") {
    const usersSnap=await getDocs(query(collection(db,"users"),where("role","==","student")));
    allStudents=usersSnap.docs.map(d=>({id:d.id,...d.data()})); stats[0][1]=allStudents.length; renderStudents();
  }
  $("statsGrid").innerHTML=stats.map((s,i)=>`<div class="col-6 col-xl-3"><div class="stat-card" style="animation-delay:${i*80}ms"><span class="stat-icon">${["◈","▦","↗","✦"][i]}</span><div class="stat-label">${s[0]}</div><div class="stat-value">${escapeHtml(String(s[1]??"—"))}</div></div></div>`).join("");
  renderEvents(registrations);
}
function escapeHtml(value) {
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderEvents(registrations=[]) {
  const search=$("eventSearch").value.trim().toLowerCase();
  const visible=allEvents.filter(e=>[e.title,e.category,e.venue,e.description].join(" ").toLowerCase().includes(search));
  if(!visible.length) { $("eventsGrid").innerHTML='<div class="col-12"><div class="empty-state">✦<h3>No events found</h3><p>Try another search, or check back soon.</p></div></div>'; return; }
  $("eventsGrid").innerHTML=visible.map((e,i)=>{
    const count=Number(e.registrationCount||0), mine=registrations.some(r=>r.eventId===e.id&&r.uid===currentUser.uid);
    const full=count>=Number(e.capacity), date=e.date?new Date(e.date):null;
    return `<div class="col-md-6 col-xl-4"><article class="event-card" style="animation-delay:${i*65}ms"><div class="event-art art-${i%4}"><span>${escapeHtml((e.category||"EVENT").toUpperCase())}</span><b>${["✧","◉","✦","⌁"][i%4]}</b></div><div class="event-content"><div class="d-flex justify-content-between gap-2"><h3>${escapeHtml(e.title)}</h3><span class="seat-count">${count}/${Number(e.capacity)||0}</span></div><p class="event-description">${escapeHtml(e.description)}</p><div class="event-meta"><span>◷ ${date&&!isNaN(date)?date.toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Date TBA"}</span><span>⌖ ${escapeHtml(e.venue)}</span></div><div class="event-actions">${currentProfile.role==="student"?`<button class="btn ${mine||full?"btn-outline-secondary":"btn-primary"} btn-sm" data-register="${e.id}" ${mine||full?"disabled":""}>${mine?"Registered ✓":full?"Full":"Register →"}</button>`:`<button class="btn btn-outline-light btn-sm" data-delete="${e.id}">Delete event</button>`}<span class="muted small">${full?"Capacity reached":`${Math.max(0,Number(e.capacity)-count)} seats left`}</span></div></div></article></div>`;
  }).join("");
  document.querySelectorAll("[data-register]").forEach(b=>b.addEventListener("click",()=>registerForEvent(b.dataset.register)));
  document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>removeEvent(b.dataset.delete)));
}
$("eventSearch").addEventListener("input",()=>renderEvents());
$("eventForm").addEventListener("submit",async e=>{
  e.preventDefault(); const msg=$("eventMessage"); msg.className="small text-danger"; msg.textContent="";
  const title=$("eventTitle").value.trim(),category=$("eventCategory").value,date=$("eventDate").value,venue=$("eventVenue").value.trim(),capacity=Number($("eventCapacity").value),description=$("eventDescription").value.trim();
  if(title.length<3||!category||!date||!venue||!description||description.length<5||!Number.isInteger(capacity)||capacity<1) {msg.textContent="Complete all fields correctly. Capacity must be a positive whole number.";return;}
  if(new Date(date).getTime()<Date.now()) {msg.textContent="Choose a future date and time.";return;}
  try { await addDoc(collection(db,"events"),{title,category,date,venue,capacity,description,registrationCount:0,createdBy:currentUser.uid,createdAt:serverTimestamp()}); $("eventForm").reset(); msg.className="small text-success";msg.textContent="Event published successfully.";await refreshDashboard(); }
  catch(err){msg.textContent=friendlyErrors[err.code]||"Could not publish event. Check your permissions.";}
});
async function registerForEvent(eventId) {
  try {
    const event=allEvents.find(e=>e.id===eventId); if(!event) throw Error("Event not found.");
    const regId=`${eventId}_${currentUser.uid}`, regRef=doc(db,"registrations",regId), eventRef=doc(db,"events",eventId);
    await runTransaction(db,async tx=>{
      const [regSnap,eventSnap]=await Promise.all([tx.get(regRef),tx.get(eventRef)]);
      if(regSnap.exists()) throw Error("You are already registered for this event.");
      if(!eventSnap.exists()) throw Error("Event no longer exists.");
      const eventData=eventSnap.data();
      if(Number(eventData.registrationCount||0)>=Number(eventData.capacity)) throw Error("This event has reached its registration capacity.");
      tx.update(eventRef,{registrationCount:Number(eventData.registrationCount||0)+1});
      tx.set(regRef,{eventId,uid:currentUser.uid,name:currentProfile.name,rollNo:currentProfile.rollNo,email:currentProfile.email,createdAt:serverTimestamp()});
    });
    showToast("You're registered! See you there."); await refreshDashboard();
  } catch(err){showToast(friendlyErrors[err.code]||err.message||"Registration failed.",true);}
}
async function removeEvent(id) {
  if(!confirm("Delete this event? Existing registration records will remain for audit purposes.")) return;
  try { await deleteDoc(doc(db,"events",id)); showToast("Event deleted."); await refreshDashboard(); }
  catch(err){showToast(friendlyErrors[err.code]||"Could not delete event.",true);}
}
function renderStudents() {
  const search=($("studentSearch").value||"").toLowerCase();
  const rows=allStudents.filter(s=>[s.name,s.rollNo,s.email].join(" ").toLowerCase().includes(search));
  $("studentsBody").innerHTML=rows.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td><span class="roll-badge">${escapeHtml(s.rollNo)}</span></td><td>${escapeHtml(s.email)}</td><td>${s.createdAt?.toDate?s.createdAt.toDate().toLocaleDateString():"—"}</td></tr>`).join("")||'<tr><td colspan="4" class="text-center muted py-4">No students found.</td></tr>';
}
$("studentSearch").addEventListener("input",renderStudents);