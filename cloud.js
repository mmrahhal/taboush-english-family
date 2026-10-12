import {firebaseConfig} from './cloud-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const status = text => { $('cloudStatus').textContent = text; };
const configured = !Object.values(firebaseConfig).some(v => !v || v.includes('PASTE_'));
if (!configured) {
  status('يلزم إدخال إعدادات Firebase أولًا في cloud-config.js');
  $('cloudLogin').disabled = true;
} else {
  const app=initializeApp(firebaseConfig), auth=getAuth(app), store=getFirestore(app);
  let signedUser=null, loading=false, busy=false, timer=null;
  const syncPath = () => doc(store,'families',signedUser.uid);
  const valid = d => d && d.version===1 && d.db && Array.isArray(d.db.profiles) && d.db.profiles.length>0 && d.db.profiles.length<=30;
  const snapshot = () => ({version:1, db:window.taboushCloudBridge.read(),life:window.taboushCloudBridge.life(),updatedAt:serverTimestamp()});
  async function upload() {
    if(!signedUser||loading||busy) return;
    busy=true;status('جارٍ حفظ التقدم في السحابة…');
    try { await setDoc(syncPath(),snapshot());status('✓ التقدم محفوظ سحابيًا'); }
    catch(e){ status('تعذرت المزامنة؛ التقدم محفوظ محليًا. تحقق من الاتصال أو الصلاحيات.'); console.error(e); }
    finally {busy=false;}
  }
  function scheduleUpload(){ if(!signedUser||loading)return;clearTimeout(timer);timer=setTimeout(upload,1200); }
  window.taboushCloudSave=scheduleUpload;
  async function download(){
    loading=true;
    try{
      const snap=await getDoc(syncPath());
      if(snap.exists()){
        const data=snap.data();
        if(!valid(data)) throw new Error('Invalid cloud schema');
        window.taboushCloudBridge.apply(data.db,data.life||{});
        status('✓ تم تحميل بيانات الأسرة من السحابة');
      }else{
        // لا نستبدل النسخة المحلية ضمنيًا: يختار المستخدم ما إذا كان يريد رفعها أول مرة.
        if(confirm('لا توجد بيانات سحابية بعد. هل تريد رفع بيانات هذا المتصفح الموجودة حاليًا كنقطة بداية؟')) {
          loading=false; await upload(); loading=true;
        }else status('لا توجد بيانات سحابية بعد. تستطيع بدء التعلم ثم حفظ التقدم.');
      }
    }catch(e){status('تعذر تحميل البيانات: تحقق من قواعد Firestore أو الاتصال.');console.error(e);}
    finally{loading=false;}
  }
  onAuthStateChanged(auth,async user=>{
    signedUser=user;
    $('cloudLoginBox').hidden=!!user;
    $('cloudLoggedBox').hidden=!user;
    $('cloudEmail').textContent=user?.email||'';
    document.body.classList.toggle('cloud-locked',!user);
    if(user) await download(); else status('سجل دخول ولي الأمر لفتح المنصة والمزامنة.');
  });
  $('cloudLogin').addEventListener('click',async()=>{
    let email=$('cloudUser').value.trim(),pass=$('cloudPass').value;
    if(!email||!pass){status('أدخل بريد الحساب وكلمة المرور.');return;}
    $('cloudLogin').disabled=true;
    try {await setPersistence(auth,browserLocalPersistence); await signInWithEmailAndPassword(auth,email,pass);$('cloudPass').value='';}
    catch(e){status('تعذر الدخول. تحقق من بيانات حساب ولي الأمر الذي أنشأته في Firebase.');}
    finally{$('cloudLogin').disabled=false;}
  });
  $('cloudLogout').addEventListener('click',()=>signOut(auth));
  $('cloudSyncNow').addEventListener('click',upload);
  $('cloudRefresh').addEventListener('click',()=>{if(confirm('سيحل التقدم المحفوظ سحابيًا محل بيانات هذا المتصفح. هل صدّرت نسخة احتياطية؟'))download()});
  window.addEventListener('online',scheduleUpload);
}
