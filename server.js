const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuração de limite para suportar Base64 de fotos e mídias
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static("public"));

// Conexão com o Banco de Dados
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZapV2")
    .then(() => console.log("✅ Banco de Dados conectado!"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- SCHEMAS ---
const User = mongoose.model("User", { 
    id: String, 
    username: String, 
    photo: String,
    deviceId: String 
});

const Message = mongoose.model("Message", { 
    fromId: String, 
    toId: String, 
    text: String, 
    timestamp: Number,
    visualizada: { type: Boolean, default: false }
});

const Moment = mongoose.model("Moment", { 
    userId: String, 
    username: String, 
    userPhoto: String, 
    media: String, 
    timestamp: Number 
});

let onlineUsers = {};

// --- LÓGICA SOCKET.IO ---
io.on("connection", (socket) => {
    
    socket.on("register", (userId) => {
        socket.userId = userId;
        onlineUsers[userId] = socket.id;
        console.log(`Usuário ${userId} registrado no socket ${socket.id}`);
        io.emit("updateStatus", Object.keys(onlineUsers));
    });

    // Atualização de Visualização de Mensagens
    socket.on("readMessages", async (data) => {
        const { fromId, toId } = data; 
        try {
            await Message.updateMany(
                { fromId: fromId, toId: toId, visualizada: false },
                { $set: { visualizada: true } }
            );

            const senderSocket = onlineUsers[fromId];
            if (senderSocket) {
                io.to(senderSocket).emit("messagesRead", { byUserId: toId });
            }
        } catch (err) {
            console.error("Erro ao atualizar visualização:", err);
        }
    });

    // WebRTC: Troca de candidatos ICE (Crucial para áudio e vídeo)
    socket.on("iceCandidate", (data) => {
        const targetSocket = onlineUsers[data.toId];
        if (targetSocket) {
            io.to(targetSocket).emit("iceCandidate", {
                candidate: data.candidate,
                fromId: socket.userId
            });
        }
    });

    // WebRTC: Iniciar Chamada
    socket.on("callUser", (data) => {
        const targetSocket = onlineUsers[data.toId];
        if (targetSocket) {
            io.to(targetSocket).emit("incomingCall", data);
        }
    });

    // WebRTC: Aceitar Chamada
    socket.on("acceptCall", (data) => {
        const targetSocket = onlineUsers[data.toId];
        if (targetSocket) {
            io.to(targetSocket).emit("callAccepted", {
                fromId: socket.userId,
                signal: data.signal
            });
        }
    });

    // WebRTC: Encerrar Chamada
    socket.on("endCall", (data) => {
        const targetSocket = onlineUsers[data.toId];
        if (targetSocket) {
            io.to(targetSocket).emit("callEnded");
        }
    });

    // Status de "Digitando..."
    socket.on("typing", (data) => {
        if (onlineUsers[data.toId]) {
            io.to(onlineUsers[data.toId]).emit("userTyping", { fromId: data.fromId });
        }
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit("updateStatus", Object.keys(onlineUsers));
        }
    });
});

// --- ROTAS DA API ---

// Criar novo usuário
app.post("/api/user", async (req, res) => {
    try {
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        const user = await User.create({ id, ...req.body });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Erro ao criar usuário" });
    }
});

// Recuperar usuário pelo DeviceID
app.get("/api/recover-by-device/:deviceId", async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId });
        if (user) res.json(user);
        else res.status(404).json({ error: "Nenhuma conta vinculada" });
    } catch (err) {
        res.status(500).json({ error: "Erro na recuperação" });
    }
});

// Salvar Perfil e notificar rede via Socket
app.post("/api/saveProfile", async (req, res) => {
    try {
        const { id, username, photo } = req.body;
        const user = await User.findOneAndUpdate({ id }, { username, photo }, { new: true });
        if (user) {
            io.emit("userUpdated", { id, username, photo });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Usuário não encontrado" });
        }
    } catch (e) { res.status(500).send(e); }
});

// Buscar usuário por ID
app.get("/api/user/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Não encontrado" });
});

// Momentos (Postar)
app.post("/api/moments", async (req, res) => {
    try {
        const novoMomento = await Moment.create({ ...req.body, timestamp: Date.now() });
        io.emit("newMoment", novoMomento);
        res.json(novoMomento);
    } catch (err) {
        res.status(500).json({ error: "Erro ao postar momento" });
    }
});

// Momentos (Listar últimas 24h)
app.get("/api/moments", async (req, res) => {
    const umDiaAtras = Date.now() - (24 * 60 * 60 * 1000);
    try {
        const momentos = await Moment.find({ timestamp: { $gt: umDiaAtras } }).sort({ timestamp: -1 });
        res.json(momentos);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar momentos" });
    }
});

// Enviar Mensagem
app.post("/api/messages", async (req, res) => {
    try {
        const { fromId, toId, text } = req.body;
        const msg = await Message.create({ fromId, toId, text, timestamp: Date.now(), visualizada: false });
        const sender = await User.findOne({ id: fromId });

        if (onlineUsers[toId]) {
            io.to(onlineUsers[toId]).emit("receiveMessage", {
                fromId: msg.fromId,
                toId: msg.toId,
                text: msg.text,
                timestamp: msg.timestamp,
                senderName: sender ? sender.username : "Amigo",
                senderPhoto: sender ? sender.photo : ""
            });
        }
        res.json(msg);
    } catch (err) {
        res.status(500).json({ error: "Erro ao enviar mensagem" });
    }
});

// Carregar histórico de mensagens entre dois usuários
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
