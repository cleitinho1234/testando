const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Aumentado para 50mb para garantir que fotos de perfil grandes não deem erro 413
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static("public"));

// Conexão direta e segura
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZapV2")
    .then(() => console.log("✅ Banco de Dados conectado!"));

// Schemas
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

    socket.on("updateProfileVisual", (dados) => {
        io.emit("userUpdated", dados);
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit("updateStatus", Object.keys(onlineUsers));
        }
    });
});

// --- ROTAS PRINCIPAIS ---

app.post("/api/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = await User.create({ id, ...req.body });
    res.json(user);
});

app.post("/api/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;
    const user = await User.findOneAndUpdate(
        { id: id },
        { username, photo },
        { new: true }
    );
    if (user) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Usuário não encontrado" });
    }
});

app.get("/api/user/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Não encontrado" });
});

// --- LÓGICA DE MENSAGENS COM AUTO-ADD ---
app.post("/api/messages", async (req, res) => {
    const { fromId, toId, text } = req.body;
    const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });

    // Busca os dados de quem enviou para o destinatário saber quem é
    const sender = await User.findOne({ id: fromId });

    // Se o destinatário estiver online, envia a mensagem e os dados do remetente via Socket
    if (onlineUsers[toId]) {
        io.to(onlineUsers[toId]).emit("receiveMessage", {
            msg,
            sender: {
                id: sender.id,
                username: sender.username,
                photo: sender.photo
            }
        });
    }

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 MiniZap V2 rodando na porta ${PORT}`));
