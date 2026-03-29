let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

let localMessages = JSON.parse(localStorage.getItem("localMessages")) || [];

// 🔥 CONTROLE PRA NÃO DUPLICAR
let renderedMessages = new Set();

// =========================
// INICIAR

window.addEventListener("load", async () => {

let savedId = localStorage.getItem("userId");

if (savedId) {
  const res = await fetch(`/getUser/${savedId}`);
  const user = await res.json();

  if (!user.error && user.username) {
    currentUser = user;
  }
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

const savedName = localStorage.getItem("username");
if(savedName){
  currentUser.username = savedName;
}

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
// ENVIAR TEXTO

document.getElementById("sendMessageBtn").onclick = () => {

const input = document.getElementById("messageText");
const text = input.value;

if(!text || !currentChat) return;

input.value = "";

const msg = {
  id: Date.now() + Math.random(), // 🔥 ID único
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
// 🎤 ÁUDIO (CORRIGIDO MOBILE)

const recordBtn = document.getElementById("recordBtn");

recordBtn.onclick = async () => {

if(!currentChat) return;

if(!isRecording){

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => {
    if(e.data.size > 0){
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {

    const blob = new Blob(audioChunks, { type: "audio/webm" });

    if(blob.size < 1000) return;

    const reader = new FileReader();

    reader.onloadend = () => {

      const msg = {
        id: Date.now() + Math.random(),
        fromId: currentUser.id,
        toId: currentChat.id,
        audio: reader.result,
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

    reader.readAsDataURL(blob);

  };

  mediaRecorder.start();
  isRecording = true;
  recordBtn.textContent = "⏺️";

} else {

  mediaRecorder.stop();
  isRecording = false;
  recordBtn.textContent = "🎤";

}

};

// =========================
// SALVAR LOCAL

function saveLocalMessage(msg){
localMessages.push(msg);
localStorage.setItem("localMessages", JSON.stringify(localMessages));
}

// =========================
// LOAD MESSAGES (🔥 SEM BUG)

async function loadMessages(){

const res = await fetch(`/getMessages/${currentUser.id}`);
const serverMsgs = await res.json();

const msgs = [...serverMsgs, ...localMessages];

// 🔥 ordena correto
msgs.sort((a,b)=>a.timestamp - b.timestamp);

for (let m of msgs){

const uniqueId = m.id || (m.fromId + m.timestamp);

if(renderedMessages.has(uniqueId)) continue;

renderedMessages.add(uniqueId);

// 🔥 contatos topo
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

// 🔥 só adiciona se estiver no chat aberto
if(currentChat &&
((m.fromId == currentUser.id && m.toId == currentChat.id) ||
 (m.fromId == currentChat.id && m.toId == currentUser.id))){

  addMessage(m);
}

}

localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
renderContacts();

const container = document.getElementById("messages");
container.scrollTop = container.scrollHeight;

}

// =========================
// FORMATAR TEMPO

function formatTime(seconds){
if(!seconds || isNaN(seconds)) return "0:00";
const m = Math.floor(seconds / 60);
const s = Math.floor(seconds % 60);
return `${m}:${String(s).padStart(2,"0")}`;
}

// =========================
// MENSAGEM

function addMessage(m){

const container = document.getElementById("messages");

const div = document.createElement("div");
div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");

const bubble = document.createElement("div");
bubble.className = "bubble";

// 🎧 ÁUDIO
if(m.audio){

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = m.audio;

  const duration = document.createElement("div");
  duration.style.fontSize = "10px";
  duration.style.opacity = "0.6";

  audio.onloadedmetadata = () => {
    duration.textContent = formatTime(audio.duration);
  };

  bubble.appendChild(audio);
  bubble.appendChild(duration);
}

// TEXTO
if(m.text){
  const text = document.createElement("div");
  text.textContent = m.text;
  bubble.appendChild(text);
}

// HORÁRIO
const time = document.createElement("div");
time.style.fontSize = "10px";
time.style.opacity = "0.6";
time.style.textAlign = "right";

if(m.timestamp){
const date = new Date(m.timestamp);
const h = String(date.getHours()).padStart(2,"0");
const min = String(date.getMinutes()).padStart(2,"0");
time.textContent = `${h}:${min}`;
}

bubble.appendChild(time);

div.appendChild(bubble);
container.appendChild(div);

        }
