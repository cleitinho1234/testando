const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// 🔥 SOCKET CORRIGIDO
const io = new Server(server, {
cors: {
origin: "*",
methods: ["GET", "POST"]
}
});

// "banco" simples
let users = {};
let messages = {};

// criar usuário
app.post("/register", (req, res) => {
const id = Math.floor(100000 + Math.random() * 900000).toString();
users[id] = { id };
res.json(users[id]);
});

// buscar usuário
app.get("/user/:id", (req, res) => {
const user = users[req.params.id];

if (!user) {
return res.status(404).json({ error: "não encontrado" });
}

res.json(user);
});

// socket
io.on("connection", (socket) => {

socket.on("join", (userId) => {
socket.join(userId);
});

socket.on("sendMessage", ({ from, to, text }) => {
const msg = { from, text };

```
if (!messages[to]) {
  messages[to] = [];
}

messages[to].push(msg);

// envia mensagem pro outro usuário
io.to(to).emit("receiveMessage", msg);
```

});

});

// porta correta
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
console.log("Servidor rodando na porta " + PORT);
});
