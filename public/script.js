let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;

// 🎤 ÁUDIO
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordedAudio = null;

// 💾 CACHE LOCAL
let localMessages = JSON.parse(localStorage.getItem("localMessages")) || [];

// =========================
// INICIAR

window.addEventListener("load", async () => {

let savedId = localStorage.getItem("userId");

if (savedId) {
  const res = await fetch(`/getUser/${savedId}`);
  const user = await res.json();
  if (!user.error && user.username) currentUser = user;
}

if (!currentUser) {
  const res = await fetch("/user", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username: "Novo Usuário", photo: "" })
  });
  currentUser = await res.json();
  localStorage.setItem("userId", currentUser.id);
}

// nome local
const savedName = localStorage.getItem("username");
if(savedName) currentUser.username = savedName;

document.getElementById("username").value = currentUser.username || "";
document.getElementById("userIdDisplay").textContent = currentUser.id;

if(currentUser.photo){
  document.getElementById("profilePreview").src = currentUser.photo;
}

renderContacts();
atualizarContatos().then(renderContacts);

setInterval(loadMessages, 1500);

});

// =========================
// PERFIL

document.getElementById("profileForm")?.addEventListener("submit", async (e) => {

e.preventDefault();

const username = document.getElementById("username").value;
const file = document.getElementById("profilePic").files[0];

let photo = currentUser.photo;

if(file){
  const reader = new FileReader();
  reader.onload = async () => {
    photo = reader.result;
    await salvarPerfil(username, photo);
  };
  reader.readAsDataURL(file);
} else {
  await salvarPerfil(username, photo);
}

});

async function salvarPerfil(username, photo){

currentUser.username = username;
currentUser.photo = photo;

localStorage.setItem("username", username);

contacts = contacts.map(c => {
  if(c.id === currentUser.id){
    return {...c, username, photo};
  }
  return c;
});

localStorage.setItem("contacts", JSON.stringify(contacts));

renderContacts();

fetch("/saveProfile", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({
    id: currentUser.id,
    username,
    photo
  })
});

}

// =========================
// CONTATOS

async function atualizarContatos(){

for (let i = 0; i < contacts.length; i++){
  const res = await fetch(`/getUser/${contacts[i].id}`);
  const user = await res.json();

  if(!user.error && user.username){
    contacts[i] = user;
  }
}

localStorage.setItem("contacts", JSON.stringify(contacts));

}

function renderContacts(){

const div = document.getElementById("contacts");

let html = "";

for (let user of contacts){

const count = unreadCounts[user.id] || 0;

html += `
<div class="contact" data-id="${user.id}" style="display:flex;align-items:center;">
<img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
style="width:30px;height:30px;border-radius:50%;margin-right:10px;">
<span style="flex:1;">${user.username}</span>
${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:5px 10px;font-size:12px;margin-left:auto;">${count}</span>` : ""}
</div>
`;
}

div.innerHTML = html;

document.querySelectorAll(".contact").forEach(el => {
el.onclick = () => {
const user = contacts.find(c => c.id == el.dataset.id);
abrirChat(user);
};
});

}

// =========================
// CHAT

function abrirChat(user){

currentChat = user;

unreadCounts[user.id] = 0;
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();

document.getElementById("messages").innerHTML = "";

document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = user.username;

loadMessages();

}

function voltar(){
document.getElementById("chatScreen").style.display = "none";
document.getElementById("home").style.display = "block";
currentChat = null;
}

// =========================
// TEXTO

document.getElementById("sendMessageBtn").onclick = () => {

const input = document.getElementById("messageText");
const text = input.value;

if(!text || !currentChat) return;

input.value = "";

const msg = {
  fromId: currentUser.id,
  toId: currentChat.id,
  text,
  timestamp: Date.now()
};

addMessage(msg);
saveLocalMessage(msg);

fetch("/sendMessage", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify(msg)
});

};

// =========================
// 🎤 ÁUDIO (FIX MOBILE)

const recordBtn = document.getElementById("recordBtn");

async function startRecording(){

if(isRecording) return;

const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

mediaRecorder = new MediaRecorder(stream);
audioChunks = [];

mediaRecorder.ondataavailable = e => {
  if(e.data.size > 0) audioChunks.push(e.data);
};

mediaRecorder.start();
isRecording = true;
recordBtn.textContent = "⏺️";

}

function stopRecording(){

if(!mediaRecorder || !isRecording) return;

mediaRecorder.requestData();

setTimeout(() => {

mediaRecorder.stop();

if(audioChunks.length === 0) return resetBtn();

const blob = new Blob(audioChunks, { type: "audio/webm" });

if(blob.size < 1000) return resetBtn();

const reader = new FileReader();

reader.onloadend = () => {

  recordedAudio = reader.result;

  document.getElementById("audioPreview").style.display = "flex";
  document.getElementById("previewPlayer").src = recordedAudio;

};

reader.readAsDataURL(blob);

resetBtn();

}, 200);

}

function resetBtn(){
isRecording = false;
recordBtn.textContent = "🎤";
}

// eventos
recordBtn.addEventListener("mousedown", startRecording);
recordBtn.addEventListener("mouseup", stopRecording);

recordBtn.addEventListener("touchstart", e => {
e.preventDefault();
startRecording();
});

recordBtn.addEventListener("touchend", e => {
e.preventDefault();
stopRecording();
});

// =========================
// ENVIAR ÁUDIO

document.getElementById("sendAudioBtn").onclick = () => {

if(!recordedAudio || !currentChat) return;

const msg = {
  fromId: currentUser.id,
  toId: currentChat.id,
  audio: recordedAudio,
  timestamp: Date.now()
};

addMessage(msg);
saveLocalMessage(msg);

fetch("/sendMessage", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify(msg)
});

recordedAudio = null;
document.getElementById("audioPreview").style.display = "none";

};

// =========================
// APAGAR ÁUDIO

document.getElementById("deleteAudioBtn").onclick = () => {

recordedAudio = null;
document.getElementById("previewPlayer").src = "";
document.getElementById("audioPreview").style.display = "none";

};

// =========================
// LOCAL

function saveLocalMessage(msg){
localMessages.push(msg);
localStorage.setItem("localMessages", JSON.stringify(localMessages));
}

// =========================
// LOAD

async function loadMessages(){

const res = await fetch(`/getMessages/${currentUser.id}`);
const serverMsgs = await res.json();

const msgs = [...serverMsgs, ...localMessages];

for (let m of msgs){

if(m.timestamp <= lastTimestamp) continue;

if(m.timestamp > lastTimestamp){
  lastTimestamp = m.timestamp;
}

if(m.toId == currentUser.id){

  const index = contacts.findIndex(c => c.id == m.fromId);

  if(index !== -1){
    const user = contacts.splice(index, 1)[0];
    contacts.unshift(user);
  }

  if(currentChat?.id !== m.fromId){
    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
  }

}

}

localStorage.setItem("lastTimestamp", lastTimestamp);
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();

if(!currentChat) return;

const filtered = msgs.filter(m =>
(m.fromId == currentUser.id && m.toId == currentChat.id) ||
(m.fromId == currentChat.id && m.toId == currentUser.id)
);

const container = document.getElementById("messages");

const existentes = container.children.length;

for (let i = existentes; i < filtered.length; i++){
  addMessage(filtered[i]);
}

container.scrollTop = container.scrollHeight;

}

// =========================
// MENSAGEM

function addMessage(m){

const container = document.getElementById("messages");

const div = document.createElement("div");
div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");

const bubble = document.createElement("div");
bubble.className = "bubble";

if(m.audio){
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = m.audio;
  bubble.appendChild(audio);
}

if(m.text){
  const text = document.createElement("div");
  text.textContent = m.text;
  bubble.appendChild(text);
}

const time = document.createElement("div");
time.style.fontSize = "10px";
time.style.opacity = "0.6";
time.style.textAlign = "right";

if(m.timestamp){
const d = new Date(m.timestamp);
time.textContent = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

bubble.appendChild(time);

div.appendChild(bubble);
container.appendChild(div);

  }
