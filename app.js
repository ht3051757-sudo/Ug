/* UGPHONE MOD — GitHub Pages + Supabase shared backend */
const cfg=window;
let sb=null,me=null,profileSub=null,chatSub=null,keySub=null,statusSub=null,userSub=null;
let supabaseReady=false;
let initError="";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function toast(t){const x=$("toast");if(!x)return;x.textContent=t;x.style.display="block";clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.style.display="none",2500)}
function msg(t){if($("authMsg"))$("authMsg").textContent=t}
function validName(s){return /^[A-Za-z0-9_.-]{3,12}$/.test(s)}
function configured(){return typeof cfg.UG_SUPABASE_URL === "string" && typeof cfg.UG_SUPABASE_ANON_KEY === "string" && cfg.UG_SUPABASE_URL.startsWith("https://") && cfg.UG_SUPABASE_URL.includes("supabase.co") && cfg.UG_SUPABASE_ANON_KEY.length>20 && !cfg.UG_SUPABASE_ANON_KEY.includes("YOUR_")}
function requireDb(){if(sb&&supabaseReady)return true; const t=initError||"Supabase chưa sẵn sàng. Kiểm tra config.js và kết nối mạng."; msg(t); toast(t); return false}
async function init(){
 if(!configured()){
   // Offline fallback: cho phép đăng ký/đăng nhập ngay cả khi chưa cấu hình Supabase.
   // Dữ liệu chỉ lưu trên trình duyệt hiện tại; các chức năng realtime/admin/shared vẫn cần Supabase.
   initError="";
   restoreLocalSession();
   syncAuthNav();
   renderProfile();
   return;
 }
 const r=document.createElement("script");
 r.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
 r.onload=async()=>{
   try{
     sb=window.supabase.createClient(cfg.UG_SUPABASE_URL,cfg.UG_SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
     supabaseReady=true;
     initError="";
     await restoreSession();
     subscribeRealtime();
     await refreshAll();
   }catch(e){supabaseReady=false;initError="Không khởi tạo được Supabase: "+(e?.message||e);toast(initError);}
 };
 r.onerror=()=>{initError="Không tải được thư viện Supabase. Kiểm tra Internet hoặc CDN.";toast(initError)};
 document.head.appendChild(r);
}
async function restoreSession(){if(!requireDb())return;const {data}=await sb.auth.getSession();if(data.session)await loadMe();else me=null}
async function loadMe(){if(!requireDb())return; const {data:{user},error:authError}=await sb.auth.getUser(); if(authError){me=null;return}if(!user){me=null;syncAuthNav();return}const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).single();if(error||!data){me=null;return}if(data.banned){await sb.auth.signOut();me=null;toast("Tài khoản đã bị BAN.");return}me=data;syncAuthNav()}
async function localHash(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function localUsers(){try{return JSON.parse(localStorage.getItem("ug_local_users")||"[]")}catch{return[]}}
function saveLocalUsers(users){localStorage.setItem("ug_local_users",JSON.stringify(users))}
function restoreLocalSession(){try{const email=localStorage.getItem("ug_local_session");if(!email){me=null;return}const u=localUsers().find(x=>x.email===email);me=u?{...u,role:u.role||"user",banned:!!u.banned}:null;if(me?.banned){localStorage.removeItem("ug_local_session");me=null}}catch{me=null}}
async function localRegister(u,email,p){const users=localUsers();if(users.some(x=>x.email===email))throw new Error("Email này đã được đăng ký.");if(users.some(x=>x.username.toLowerCase()===u.toLowerCase()))throw new Error("Tên tài khoản đã tồn tại.");const passwordHash=await localHash(p);const user={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),username:u,email,passwordHash,avatar:"",role:"user",banned:false,created_at:new Date().toISOString()};users.push(user);saveLocalUsers(users);localStorage.setItem("ug_local_session",email);me={...user};delete me.passwordHash;syncAuthNav();renderProfile();msg("Tạo tài khoản thành công trên thiết bị này.");toast("Đã tạo tài khoản")}
async function localLogin(email,p){const user=localUsers().find(x=>x.email===email);if(!user)throw new Error("Không tìm thấy tài khoản.");if(user.banned)throw new Error("Tài khoản đã bị BAN.");if((await localHash(p))!==user.passwordHash)throw new Error("Email hoặc mật khẩu không đúng.");localStorage.setItem("ug_local_session",email);me={...user};delete me.passwordHash;syncAuthNav();renderProfile();msg("Đăng nhập thành công trên thiết bị này.");toast("Đã đăng nhập")}
async function register(){const u=$("username")?.value.trim(),email=$("email")?.value.trim().toLowerCase(),p=$("password")?.value||"";if(!validName(u))return msg("Tên tài khoản 3-12 ký tự, chỉ dùng chữ, số, _, -, .");if(!email||!email.includes("@"))return msg("Nhập email hợp lệ.");if(p.length<6)return msg("Mật khẩu phải có ít nhất 6 ký tự.");if(!configured()){try{await localRegister(u,email,p)}catch(e){msg(e.message)}return}if(!requireDb())return;try{const {data,error}=await sb.auth.signUp({email,password:p,options:{data:{username:u}}});if(error)throw error;if(!data.user)throw new Error("Không tạo được tài khoản.");if(!data.session){msg("Tài khoản đã tạo. Nếu Supabase bật xác nhận email, hãy xác nhận email rồi đăng nhập.");return}await loadMe();syncAuthNav();msg("Tạo tài khoản thành công.");toast("Đã tạo tài khoản");refreshAll()}catch(e){msg(e.message)}}
async function login(){const email=$("email")?.value.trim().toLowerCase(),p=$("password")?.value||"";if(!email||!email.includes("@"))return msg("Nhập email hợp lệ.");if(!p)return msg("Vui lòng nhập mật khẩu.");if(!configured()){try{await localLogin(email,p)}catch(e){msg(e.message)}return}if(!requireDb())return;try{const {error}=await sb.auth.signInWithPassword({email,password:p});if(error)throw error;await loadMe();syncAuthNav();if(!me)throw new Error("Không đọc được hồ sơ tài khoản.");msg("Đăng nhập thành công.");toast("Đã đăng nhập");refreshAll()}catch(e){msg(e.message)}}
async function logout(){if(sb&&supabaseReady)await sb.auth.signOut();localStorage.removeItem("ug_local_session");me=null;renderProfile();syncAuthNav();toast("Đã đăng xuất");if(supabaseReady)refreshAll()}
async function claimKey(){if(!requireDb())return;if(!me)return toast("Bạn cần đăng nhập.");const {data,error}=await sb.rpc("claim_daily_key");if(error)return toast(error.message);$("keyBox").textContent=data;$ ("keyBox").classList.remove("hidden");navigator.clipboard?.writeText(data).catch(()=>{});toast("Đã nhận KEY hôm nay")}
function syncAuthNav(){const logged=!!me; $("authNav")?.classList.toggle("hidden",logged); $("accountNav")?.classList.toggle("hidden",!logged); const a=$("accountNav"); if(a&&me)a.textContent="👤 "+me.username; document.body.classList.toggle("loggedIn",logged)}
function adminSection(name){["Posts","Keys","Broadcast","Chat","Users","Server"].forEach(x=>$("adminSection"+x)?.classList.add("hidden")); const map={posts:"Posts",keys:"Keys",broadcast:"Broadcast",chat:"Chat",users:"Users",server:"Server"}; if(map[name])$("adminSection"+map[name])?.classList.remove("hidden"); else {Object.values(map).forEach(x=>$("adminSection"+x)?.classList.remove("hidden"))}}
function playGuess(){const n=Number($("guessNumber")?.value);if(!n||n<1||n>10)return toast("Chọn số từ 1 đến 10.");const x=Math.floor(Math.random()*10)+1;$("guessResult").textContent=x===n?"🎉 Đúng rồi!":"😄 Chưa đúng — số là "+x}
function flipCoin(){$("coinResult").textContent=Math.random()<.5?"🪙 Mặt ngửa":"🪙 Mặt sấp"}
function rps(p){const a=["kéo","búa","bao"][Math.floor(Math.random()*3)],w={"kéo":"bao","búa":"kéo","bao":"búa"};$("rpsResult").textContent=p===a?"🤝 Hòa!":w[p]===a?"🎉 Bạn thắng!":"😄 Máy thắng!"}
function renderProfile(){const b=$("profileBox");if(!b)return;if(!me){b.innerHTML="<p>Chưa đăng nhập.</p>";return}b.innerHTML=`${me.avatar?`<img class="avatarLarge" src="${esc(me.avatar)}">`:""}<p><b>${esc(me.username)}</b> ${me.role==="admin"?"👑 Admin":""}</p><input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><button class="primary" onclick="saveAvatar()">LƯU AVATAR</button><button onclick="removeAvatar()">XÓA AVATAR</button><hr><h3>🔐 Đổi mật khẩu</h3><input id="newPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"><input id="newPassword2" type="password" minlength="6" autocomplete="new-password" placeholder="Nhập lại mật khẩu mới"><button class="primary" onclick="changePassword()">ĐỔI MẬT KHẨU</button><small class="muted">Mật khẩu được quản lý bởi Supabase Auth và không được lưu trong bảng profiles.</small>`}
async function changePassword(){if(!requireDb()||!me)return toast("Bạn cần đăng nhập.");const p=$("newPassword")?.value||"",p2=$("newPassword2")?.value||"";if(p.length<6)return toast("Mật khẩu mới phải có ít nhất 6 ký tự.");if(p!==p2)return toast("Hai mật khẩu không khớp.");const {error}=await sb.auth.updateUser({password:p});if(error)return toast(error.message);$("newPassword").value="";$("newPassword2").value="";toast("Đã đổi mật khẩu thành công");}
async function saveAvatar(){if(!requireDb())return; const f=$("avatarFile")?.files?.[0];if(!f)return toast("Chọn ảnh trước.");if(f.size>512*1024)return toast("Ảnh tối đa 512 KB.");const r=new FileReader();r.onload=async()=>{const {data,error}=await sb.from("profiles").update({avatar:r.result}).eq("id",me.id).select().single();if(error)return toast(error.message);me=data;renderProfile();toast("Đã đổi avatar")};r.readAsDataURL(f)}
async function removeAvatar(){if(!requireDb())return; const {data,error}=await sb.from("profiles").update({avatar:""}).eq("id",me.id).select().single();if(error)return toast(error.message);me=data;renderProfile()}
function renderChatMessage(m){const box=$("chatMessages");if(!box)return;const el=document.createElement("div");el.className="chatMsg";const av=m.avatar?`<img class="avatar avatarClick" src="${esc(m.avatar)}" onclick="openProfileById(\'${esc(m.user_id||"")}\')">`:`<div class="avatar avatarClick" onclick="openProfileById(\'${esc(m.user_id||"")}\')">${m.username==="Admin"?"A":"U"}</div>`;const image=m.image_url?`<img class="chatImage" src="${esc(m.image_url)}" onclick="window.open(this.src,\'_blank\')">`:``;el.innerHTML=av+`<div class="chatBody"><button class="profileLink" onclick="openProfileById(\'${esc(m.user_id||"")}\')"><b>${esc(m.username)}</b></button>${image}<div>${esc(m.message)}</div></div>`;box.appendChild(el);box.scrollTop=box.scrollHeight}
async function loadChat(){if(!requireDb())return;const {data,error}=await sb.from("messages").select("id,user_id,username,avatar,message,image_url,created_at").order("created_at",{ascending:true}).limit(200);if(error)return;const box=$("chatMessages");box.innerHTML="";data.forEach(renderChatMessage);if(!chatSub){chatSub=sb.channel("global-chat").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},p=>renderChatMessage(p.new)).subscribe()}}
async function sendChat(){if(!requireDb())return;if(!me)return toast("Đăng nhập để chat.");const input=$("chatInput"),text=(input?.value||"").trim();if(!text)return;if(text.length>500)return toast("Tin nhắn tối đa 500 ký tự.");const {error}=await sb.from("messages").insert({user_id:me.id,username:me.username,avatar:me.avatar||"",message:text,image_url:null});if(error)toast(error.message);else input.value=""}
async function sendChatImage(){if(!requireDb()||!me)return toast("Đăng nhập để gửi ảnh.");const f=$("chatImage")?.files?.[0];if(!f)return;if(f.size>1024*1024)return toast("Ảnh tối đa 1 MB.");if(!f.type.startsWith("image/"))return toast("Chỉ được gửi ảnh.");const r=new FileReader();r.onload=async()=>{const {error}=await sb.from("messages").insert({user_id:me.id,username:me.username,avatar:me.avatar||"",message:"",image_url:r.result});if(error)toast(error.message);else toast("Đã gửi ảnh");$("chatImage").value=""};r.readAsDataURL(f)}
async function refreshStats(){if(!requireDb())return;const {count:users}=await sb.from("profiles").select("id",{count:"exact",head:true});const {count:keys}=await sb.from("keys").select("id",{count:"exact",head:true}).eq("active",true);if($("onlineCount"))$("onlineCount").textContent="—";if($("stats"))$("stats").textContent=`Tài khoản: ${users??0} • KEY đang bật: ${keys??0}`}
async function adminLogin(){if(!requireDb())return; const email=$("adminEmail")?.value.trim().toLowerCase(),p=$("adminPass")?.value||"";if(!email||!p)return toast("Nhập email và mật khẩu Admin.");
 if($("adminLoginMsg"))$("adminLoginMsg").textContent="Đang kiểm tra tài khoản…";const {error}=await sb.auth.signInWithPassword({email,password:p});if(error){if($("adminLoginMsg"))$("adminLoginMsg").textContent=error.message;return toast(error.message);}await loadMe();syncAuthNav();if(!me||me.role!=="admin"){await sb.auth.signOut();me=null;if($("adminLoginMsg"))$("adminLoginMsg").textContent="Tài khoản chưa được cấp role admin trong bảng profiles.";return toast("Tài khoản này không có quyền Admin.")}if($("adminLoginMsg"))$("adminLoginMsg").textContent="Đăng nhập Admin thành công.";toast("Đăng nhập Admin thành công");loadAdmin()}
async function adminLogout(){await logout();loadAdmin()}
async function loadAdmin(){if(!requireDb())return; const loginBox=$("adminLogin"),panel=$("adminPanel");if(!loginBox||!panel)return;if(!me||me.role!=="admin"){loginBox.classList.remove("hidden");panel.classList.add("hidden");return}loginBox.classList.add("hidden");panel.classList.remove("hidden");const [{count:users},{count:banned},{count:keys}]=await Promise.all([sb.from("profiles").select("id",{count:"exact",head:true}),sb.from("profiles").select("id",{count:"exact",head:true}).eq("banned",true),sb.from("keys").select("id",{count:"exact",head:true})]);$("statUsers").textContent=users??0;$("statBanned").textContent=banned??0;$("statKeys").textContent=keys??0;await renderKeys();await renderPosts();await renderUsers();await renderAdminChat();await renderServerState()}
async function uploadPostImage(){
 if(!requireDb()||me?.role!=="admin")return null;
 const f=$("postImage")?.files?.[0];
 if(!f)return null;
 if(!f.type.startsWith("image/"))throw new Error("Chỉ được chọn ảnh.");
 if(f.size>4*1024*1024)throw new Error("Ảnh bài đăng tối đa 4 MB.");
 const ext=(f.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
 const path=`${me.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
 const {error}=await sb.storage.from("post-images").upload(path,f,{upsert:false,contentType:f.type});
 if(error)throw error;
 const {data}=sb.storage.from("post-images").getPublicUrl(path);
 return data.publicUrl;
}
async function publishPost(){
 if(!requireDb()||me?.role!=="admin")return toast("Chỉ Admin mới được đăng bài.");
 const title=$("postTitle")?.value.trim(), tag=$("postTag")?.value.trim(), link=$("postLink")?.value.trim(), buttonText=$("postButton")?.value.trim()||"👑 LẤY FREE (9999)", hot=!!$("postHot")?.checked;
 if(!title)return toast("Nhập tiêu đề bài đăng.");
 if(link && !/^https?:\/\//i.test(link))return toast("Link phải bắt đầu bằng http:// hoặc https://");
 try{
   const image_url=await uploadPostImage();
   const {error}=await sb.from("admin_posts").insert({title,tag,link:image_url?link:null,image_url,button_text:buttonText,hot,created_by:me.id,active:true});
   if(error)throw error;
   ["postTitle","postTag","postLink","postButton"].forEach(id=>{if($(id))$(id).value=""});
   $("postButton").value="👑 LẤY FREE (9999)";$("postImage").value="";$("postHot").checked=false;
   await renderPosts();toast("Đã đăng bài — trang chủ đã cập nhật.");
 }catch(e){toast(e?.message||"Không đăng được bài.")}
}
async function renderPosts(){
 if(!requireDb())return;
 const {data,error}=await sb.from("admin_posts").select("*").eq("active",true).order("created_at",{ascending:false});
 if(error)return;
 const posts=data||[];
 const grid=$("postGrid");
 if(grid)grid.innerHTML=posts.length?posts.map(postCardHtml).join(""):`<div class="muted" style="grid-column:1/-1;text-align:center;padding:30px">Chưa có bài đăng.</div>`;
 const admin=$("adminPostList");
 if(admin)admin.innerHTML=posts.map(p=>`<div class="postAdminItem"><div>${p.image_url?`<img class="postAdminThumb" src="${esc(p.image_url)}">`:`<div class="postAdminThumb postNoImage">🎮</div>`}</div><div><b>${esc(p.title)}</b><br><small>${esc(p.tag||"")} ${p.hot?"• HOT":""}</small></div><div class="adminBtns"><button onclick="togglePost('${esc(p.id)}',false)">ẨN</button></div></div>`).join("");
}
function postCardHtml(p){
 const media=p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy">`:`<div class="postNoImage">🎮<div style="font-size:12px;margin-top:8px">CHƯA CÓ ẢNH</div></div>`;
 return `<article class="postCard"><div class="postMedia">${media}${p.hot?`<span class="postHot">HOT</span>`:""}</div><div class="postBody"><div class="postTitle">${esc(p.title)}</div><div class="postMeta">admin</div><div class="postTags">${p.tag?`<span class="postTag">${esc(p.tag)}</span>`:""}</div><div class="postActions"><button class="claim" onclick="openPostLink('${esc(p.link||"")}')">${esc(p.button_text||"👑 LẤY FREE (9999)")}</button><button class="linkBtn" onclick="openPostLink('${esc(p.link||"")}')">🔗</button></div></div></article>`;
}
function openPostLink(url){if(!url)return toast("Bài này chưa có link.");window.open(url,"_blank","noopener,noreferrer")}
async function togglePost(id,active){if(!requireDb()||me?.role!=="admin")return;const {error}=await sb.from("admin_posts").update({active}).eq("id",id);if(error)return toast(error.message);await renderPosts();toast(active?"Đã hiện bài":"Đã ẩn bài")}

async function renderKeys(){if(!requireDb())return; const {data}=await sb.from("keys").select("*").order("date",{ascending:false}).order("created_at",{ascending:false});$("keyList").innerHTML=(data||[]).map(k=>`<div class="keyitem"><span>${esc(k.date)} — <b>${esc(k.key)}</b> — ${k.used}/${k.limit} — ${k.active?"BẬT":"TẮT"}</span><button onclick="toggleKey('${k.id}')">${k.active?"TẮT":"BẬT"}</button></div>`).join("")}
async function renderUsers(){if(!requireDb())return; const {data}=await sb.from("profiles").select("*").order("created_at",{ascending:false});$("users").innerHTML=(data||[]).map(u=>`<div class="user ${u.banned?"ban":""}"><span><img class="avatar" src="${esc(u.avatar||"")}" onerror="this.style.display='none'"> <button class="profileLink" onclick="openProfileById(\'${esc(u.id)}\')"><b>${esc(u.username)}</b></button> — <span class="roleBadge">${esc(u.role||"user")}</span> — ${u.banned?"BAN":"OK"}</span><div class="adminBtns"><button onclick="banUser(\'${esc(u.id)}\',${!u.banned})">${u.banned?"GỠ BAN":"BAN"}</button><button class="ipban" onclick="banIpForUser(\'${esc(u.id)}\')">BAN IP</button></div></div>`).join("")}
async function openProfileById(id){if(!requireDb()||!id)return;const {data,error}=await sb.from("profiles").select("*").eq("id",id).single();if(error||!data)return toast("Không tìm thấy hồ sơ.");const modal=$("profileModal");modal.classList.remove("hidden");$("profileModalBody").innerHTML=`<div class="profileModalCard"><img class="avatarLarge" src="${esc(data.avatar||"")}" onerror="this.style.display='none'"><h3>${esc(data.username)}</h3><div class="roleBadge">${esc(data.role||"user")}</div><p class="muted">Tham gia: ${new Date(data.created_at).toLocaleDateString("vi-VN")}</p>${me?.role==="admin"&&data.id!==me.id?`<div class="adminBtns"><button onclick="banUser(\'${esc(data.id)}\',${!data.banned})">${data.banned?"GỠ BAN":"BAN"}</button><button class="ipban" onclick="banIpForUser(\'${esc(data.id)}\')">BAN IP</button><select id="roleSelect"><option value="user" ${data.role==="user"?"selected":""}>User</option><option value="free_fire" ${data.role==="free_fire"?"selected":""}>Free Fire</option><option value="free_fire_max" ${data.role==="free_fire_max"?"selected":""}>Free Fire Max</option><option value="admin" ${data.role==="admin"?"selected":""}>Admin</option></select><button class="primary" onclick="setUserRole(\'${esc(data.id)}\')">CẤP ROLE</button></div>`:""}</div>`}
function closeProfile(){$("profileModal")?.classList.add("hidden")}
async function setUserRole(id){if(!requireDb()||me?.role!=="admin")return;const role=$("roleSelect")?.value;if(!role)return;const {error}=await sb.from("profiles").update({role}).eq("id",id);if(error)return toast(error.message);toast("Đã cấp role "+role);closeProfile();renderUsers()}
async function banIpForUser(id){if(!requireDb()||me?.role!=="admin")return;const {data,error}=await sb.from("profiles").select("username,last_ip").eq("id",id).single();if(error||!data)return toast("Không đọc được IP.");if(!data.last_ip)return toast("User chưa có IP gần nhất.");if(!confirm(`Ban IP ${data.last_ip} của ${data.username}?`))return;const r=await fetch("/api/admin/ban-ip",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(await sb.auth.getSession()).data.session?.access_token},body:JSON.stringify({ip:data.last_ip})});const j=await r.json().catch(()=>({}));if(!r.ok)return toast(j.error||"Không ban được IP.");toast("Đã BAN IP "+data.last_ip)}
async function addKey(){if(!requireDb())return; const key=$("newKey")?.value.trim(),date=$("keyDate")?.value,limit=Number($("keyLimit")?.value||999999);if(!key||!date)return toast("Nhập KEY và ngày.");const {error}=await sb.from("keys").insert({key,date,limit});if(error)return toast(error.message);$("newKey").value="";await renderKeys();toast("Đã thêm KEY — mọi máy sẽ thấy ngay")}
async function toggleKey(id){if(!requireDb())return; const {data}=await sb.from("keys").select("active").eq("id",id).single();if(!data)return;const {error}=await sb.from("keys").update({active:!data.active}).eq("id",id);if(error)toast(error.message)}
async function banUser(id,banned){if(!requireDb())return; const {error}=await sb.from("profiles").update({banned}).eq("id",id);if(error)return toast(error.message);await renderUsers();toast(banned?"Đã BAN — thiết bị của tài khoản sẽ bị đăng xuất khi nhận realtime":"Đã GỠ BAN")}
async function adminBroadcastSend(){if(!requireDb())return; const input=$("adminBroadcast"),message=(input?.value||"").trim();if(!message)return;const {error}=await sb.from("messages").insert({user_id:me.id,username:"Admin",avatar:me.avatar||"",message:"📢 "+message});if(error)toast(error.message);else{input.value="";toast("Đã gửi toàn hệ thống")}}
async function renderAdminChat(){if(!requireDb())return; const {data}=await sb.from("messages").select("*").order("created_at",{ascending:false}).limit(100);$("adminChat").innerHTML=(data||[]).map(m=>`<div class="chatMsg"><b>${esc(m.username)}</b>: ${esc(m.message)}</div>`).join("")}
async function renderServerState(){if(!requireDb())return; const {data}=await sb.from("server_state").select("*").eq("id",1).single();const el=$("apiStatus");if(el)el.textContent=data?`Supabase: OK • Server: ${data.status}`:"Supabase: lỗi"}
async function setServerStatus(status){if(!requireDb())return;if(!me||me.role!=="admin")return;const {error}=await sb.from("server_state").update({status}).eq("id",1);if(error)return toast(error.message);toast("Đã đổi trạng thái server")}
async function loadServerBanner(){if(!requireDb())return;const {data}=await sb.from("server_state").select("*").eq("id",1).single();const b=$("serverStatusBanner");if(!b)return;if(!data||data.status==="normal"){b.hidden=true;return}b.textContent=data.display||"Server đang được bảo trì";b.hidden=false}
function subscribeRealtime(){if(!requireDb())return;statusSub=sb.channel("server-state").on("postgres_changes",{event:"UPDATE",schema:"public",table:"server_state"},()=>{loadServerBanner();if(me?.role==="admin")renderServerState()}).subscribe();keySub=sb.channel("keys-live").on("postgres_changes",{event:"*",schema:"public",table:"keys"},()=>{refreshStats();if(me?.role==="admin")renderKeys()}).subscribe();sb.channel("posts-live").on("postgres_changes",{event:"*",schema:"public",table:"admin_posts"},()=>{renderPosts()}).subscribe();userSub=sb.channel("profiles-live").on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles"},async p=>{if(me&&p.new.id===me.id&&p.new.banned){await sb.auth.signOut();me=null;toast("Tài khoản đã bị BAN.");renderProfile()}if(me?.role==="admin")renderUsers()}).subscribe();}
function show(id){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));const el=$(id);if(el)el.classList.add("active");if(id==="chat")loadChat();if(id==="admin")loadAdmin();if(id==="auth")renderProfile()}
async function refreshAll(){if(!requireDb())return;await loadMe();syncAuthNav();renderProfile();await refreshStats();await renderPosts();await loadServerBanner();if($("chat")?.classList.contains("active"))loadChat();if($("admin")?.classList.contains("active"))loadAdmin()}
window.show=show;window.register=register;window.login=login;window.logout=logout;window.claimKey=claimKey;window.saveAvatar=saveAvatar;window.removeAvatar=removeAvatar;window.sendChat=sendChat;window.sendChatImage=sendChatImage;window.openProfileById=openProfileById;window.closeProfile=closeProfile;window.setUserRole=setUserRole;window.banIpForUser=banIpForUser;window.adminLogin=adminLogin;window.adminLogout=adminLogout;window.addKey=addKey;window.toggleKey=toggleKey;window.banUser=banUser;window.adminBroadcastSend=adminBroadcastSend;window.setServerStatus=setServerStatus;window.adminSection=adminSection;window.publishPost=publishPost;window.togglePost=togglePost;window.openPostLink=openPostLink;
function bootBanner(){const b=document.createElement("div");b.id="serverStatusBanner";b.hidden=true;b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:9999;padding:14px;text-align:center;font-weight:700;background:#222;color:#fff";document.body.appendChild(b)}
bootBanner();$("keyDate").value=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});init();
