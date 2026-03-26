// ID único do usuário
let userId = localStorage.getItem("userId");
if (!userId) {
    userId = Math.floor(Math.random() * 1000000).toString();
    localStorage.setItem("userId", userId);
}

const profileForm = document.getElementById("profileForm");
const profilePreview = document.getElementById("profilePreview");
const contactsDiv = document.getElementById("contacts");
const friendSelect = document.getElementById("friendSelect");
const messagesDiv = document.getElementById("messages");

// Salvar perfil
profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const file = document.getElementById("profilePic").files[0];
    const reader = new FileReader();
    reader.onload = async () => {
        await fetch("/saveProfile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: userId, username, photo: reader.result })
        });
        profilePreview.src = reader.result;
    };
    reader.readAsDataURL(file);
});

// Adicionar amigo
async function addFriend() {
    const friendId = document.getElementById("addUserId").value;
    const res = await fetch(`/getUser/${friendId}`);
    if (res.ok) {
        const user = await res.json();
        const div = document.createElement("div");
        div.innerHTML = `<img src="${user.photo}"> ${user.username} (ID: ${friendId})`;
        contactsDiv.appendChild(div);

        const option = document.createElement("option");
        option.value = friendId;
        option.text = user.username;
        friendSelect.appendChild(option);

        alert(`Você adicionou ${user.username}`);
    } else {
        alert("ID não encontrado");
    }
}

// Enviar mensagem
async function sendMessage() {
    const toId = friendSelect.value;
    const text = document.getElementById("messageText").value;
    if (!toId || !text) return alert("Escolha um amigo e digite uma mensagem");

    await fetch("/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: userId, toId, text })
    });

    document.getElementById("messageText").value = "";
    loadMessages();
}

// Carregar mensagens
async function loadMessages() {
    const res = await fetch(`/getMessages/${userId}`);
    const data = await res.json();
    messagesDiv.innerHTML = "";
    data.forEach(m => {
        const from = m.fromId === userId ? "Você" : m.fromId;
        messagesDiv.innerHTML += `<div><strong>${from}:</strong> ${m.text}</div>`;
    });
}

// Atualiza mensagens a cada 2 segundos
setInterval(loadMessages, 2000);
