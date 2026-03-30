const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Função para garantir que os arquivos existem e ler os dados
function readData(file) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify([]));
            return [];
        }
        const content = fs.readFileSync(file, 'utf8');
        return JSON.parse(content || '[]');
    } catch (e) {
        console.error("Erro ao ler arquivo:", file, e);
        return [];
    }
}

function writeData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Erro ao salvar arquivo:", file, e);
    }
}

// ROTA DE PRESENÇA
app.post('/updatePresence', (req, res) => {
    const { userId } = req.body;
    let users = readData(USERS_FILE);
    let updated = false;
    users = users.map(u => {
        if (u.id === userId) {
            updated = true;
            return { ...u, lastSeen: Date.now() };
        }
        return u;
    });
    if (updated) writeData(USERS_FILE, users);
    res.sendStatus(200);
});

// LOGIN / CRIAÇÃO
app.post('/user', (req, res) => {
    const users = readData(USERS_FILE);
    const newUser = { 
        id: Math.random().toString(36).substr(2, 9), 
        username: req.body.username || "Novo Usuário", 
        photo: req.body.photo || "", 
        lastSeen: Date.now() 
    };
    users.push(newUser);
    writeData(USERS_FILE, users);
    res.json(newUser);
});

// BUSCAR USUÁRIO (O que faz seu nome e ID voltarem)
app.get('/getUser/:id', (req, res) => {
    const users = readData(USERS_FILE);
    const user = users.find(u => u.id == req.params.id);
    if (!user) return res.json({ error: true });
    res.json(user);
});

app.post('/saveProfile', (req, res) => {
    const { id, username, photo } = req.body;
    let users = readData(USERS_FILE);
    users = users.map(u => u.id == id ? { ...u, username, photo } : u);
    writeData(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/sendMessage', (req, res) => {
    const msgs = readData(MESSAGES_FILE);
    msgs.push(req.body);
    writeData(MESSAGES_FILE, msgs);
    res.json({ success: true });
});

app.get('/getMessages/:id', (req, res) => {
    const msgs = readData(MESSAGES_FILE);
    const myMsgs = msgs.filter(m => m.fromId == req.params.id || m.toId == req.params.id);
    res.json(myMsgs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
