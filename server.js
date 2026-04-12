const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// 1. LIMITES PARA SUPORTAR MÍDIA (ÁUDIO/FOTOS)
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 5e7 // 50MB para garantir o tráfego de buffers grandes
});

app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
// ==========================
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("✅ Mongo conectado com sucesso"))
  .catch(err => console.error("❌ Erro ao conectar no Mongo:", err));

// ==========================
// Modelos
// ==========================
const User = mongoose.model("User", {
    id: { type: String, unique: true },
    username: String,
    photo: String
});

const Message = mongoose.model("Message", {
    fromId: String,
    toId: String,
    text: String,
    media: Object, // Armazena { data: base64, type: 'image'|'video'|'audio' }
    timestamp: { type: Number, default: Date.now }
});

// ==========================
// Lógica de Status e Chamadas em Tempo Real
// ==========================
let usuariosOnline = {}; 

io.on("connection", (socket) => {
    
    // REGISTRO DE USUÁRIO
    socket.on("register", (userId) => {
        if(!userId) return;
        socket.userId = userId;
        usuariosOnline[userId] = socket.id; 
        
        io.emit("updateStatus", Object.keys(usuariosOnline));
        console.log(`🚀 Usuário ${userId} online.`);
    });

    // --- LÓGICA DE LIGAÇÃO WebRTC ---
    
    // Inicia a chamada enviando o sinal do Peer A para o Peer B
    socket.on("ligarPara", (dados) => {
        const socketDestino = usuariosOnline[dados.para];
        if (socketDestino) {
            io.to(socketDestino).emit("recebendoLigacao", dados);
        }
    });

    // Peer B aceita e envia seu sinal de volta para o Peer A
    socket.on("aceitarChamada", (dados) => {
        const socketDestino = usuariosOnline[dados.para];
        if (socketDestino) {
            io.to(socketDestino).emit("chamadaAceita", { sinal: dados.sinal });
        }
    });

    // Notifica encerramento ou recusa para a outra parte
    socket.on("chamadaRecusada", (dados) => {
        const socketDestino = usuariosOnline[dados.para];
        if (socketDestino) {
            io.to(socketDestino).emit("chamadaEncerrada");
        }
    });

    // Canal genérico para troca de sinais adicionais (se necessário)
    socket.on("enviarSinal", (dados) => {
        const socketDestino = usuariosOnline[dados.para];
        if (socketDestino) {
            io.to(socketDestino).emit("receberSinal", {
                sinal: dados.sinal,
                de: socket.userId
            });
        }
    });

    // Atualização visual de perfil (Username/Foto) em tempo real
    socket.on("updateProfileVisual", (dados) => {
        socket.broadcast.emit("userUpdated", dados);
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete usuariosOnline[socket.userId];
            io.emit("updateStatus", Object.keys(usuariosOnline));
            console.log(`💤 Usuário ${socket.userId} offline.`);
        }
    });
});

// ==========================
// Rotas API
// ==========================

// Criar novo usuário com ID de 4 dígitos único
app.post("/user", async (req, res) => {
    try {
        const { username, photo } = req.body;
        let id;
        while (true) {
            id = Math.floor(1000 + Math.random() * 9000).toString();
            const existe = await User.findOne({ id });
            if (!existe) break;
        }
        const user = new User({ id, username, photo });
        await user.save();
        res.json(user);
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Erro ao criar usuário" }); 
    }
});

// Salvar/Editar Perfil
app.post("/saveProfile", async (req, res) => {
    try {
        const { id, username, photo } = req.body;
        await User.findOneAndUpdate({ id }, { username, photo }, { upsert: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Erro ao salvar perfil" });
    }
});

// Buscar dados de um contato pelo ID
app.get("/getUser/:id", async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.id });
        if (user) res.send(user);
        else res.status(404).send({ error: "Não encontrado" });
    } catch (e) {
        res.status(500).send({ error: "Erro no banco" });
    }
});

// Salvar mensagem no Banco
app.post("/sendMessage", async (req, res) => {
    try {
        const { fromId, toId, text, media } = req.body;
        if(!text && !media) return res.status(400).send("Mensagem vazia");
        
        const msg = await Message.create({ 
            fromId, 
            toId, 
            text, 
            media, 
            timestamp: Date.now() 
        });
        
        res.json({ success: true, msg });
    } catch (e) {
        console.error("Erro ao enviar:", e);
        res.status(500).send("Erro ao enviar");
    }
});

// Buscar histórico de mensagens (Limite de 200 para performance)
app.get("/getMessages/:id", async (req, res) => {
    try {
        const msgs = await Message.find({
            $or: [{ fromId: req.params.id }, { toId: req.params.id }]
        }).sort({ timestamp: 1 }).limit(200);
        res.send(msgs);
    } catch (e) {
        res.status(500).send([]);
    }
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`--- MiniZap Rodando ---`);
    console.log(`🌍 Local: http://localhost:${PORT}`);
});
