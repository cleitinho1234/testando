const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10mb' }));
app.use(express.static("public"));

// Conexão direta e segura
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZapV2")
    .then(() => console.log("✅ Banco de Dados conectado!"));

// Schemas simplificados
const User = mongoose.model("User", { id: String, username: String, photo: String });
const Message = mongoose.model("Message", { fromId: String, toId: String, text: String, timestamp: Number });
const Moment = mongoose.model("Moment", { userId: String, username: String, userPhoto: String, media: String, timestamp: Number });

let onlineUsers = {};

io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        socket.userId = userId;
        onlineUsers[userId] = socket.id;
        io.emit("updateStatus", Object.keys(onlineUsers));
    });

    socket.on("disconnect", () => {
        delete onlineUsers[socket.userId];
        io.emit("updateStatus", Object.keys(onlineUsers));
    });
});

// Rotas principais
app.post("/api/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = await User.create({ id, ...req.body });
    res.json(user);
});

app.get("/api/user/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Não encontrado" });
});

app.post("/api/messages", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

app.get("/api/messages/:id1/:id2", async (req, res) => {
    const msgs = await Message.find({
        $or: [
            { fromId: req.params.id1, toId: req.params.id2 },
            { fromId: req.params.id2, toId: req.params.id1 }
        ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
});

server.listen(3000, () => console.log("🚀 MiniZap V2 rodando na porta 3000"));
