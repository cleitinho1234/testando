// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: "*" }
});

// "Banco de dados" simples (memória)
let users = {};
let messages = {};

// 🔹 ROTA: criar usuário (gera ID automático)
app.post("/register", (req, res) => {
const id = Math.floor(100000 + Math.random() * 900000).toString();

users[id] = {
id: id
};

res.json(users[id]);
});

// 🔹 ROTA: buscar usuário pelo ID
app.get("/user/:id", (req, res) => {
const user = users[req.params.id];

if (!user) {
return res.status(404).json({ error: "Usuário não encontrado" });
}

res.json(user);
});

// 🔹 SOCKET (mensagens em tempo real)
io.on("connection", (socket) => {
console.log("Usuário conectado");

// entrar na sala com seu ID
socket.on("join", (userId) => {
socket.join(userId);
});

// enviar mensagem
socket.on("sendMessage", ({ from, to, text }) => {
const msg = { from, text };

```
if (!messages[to]) {
  messages[to] = [];
}

messages[to].push(msg);

// envia mensagem pra pessoa certa
io.to(to).emit("receiveMessage", msg);
```

});
});

// 🔹 iniciar servidor
server.listen(3000, () => {
console.log("Servidor rodando na porta 3000");
});
