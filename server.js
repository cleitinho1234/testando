const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const USERS_FILE = './users.json';
const MESSAGES_FILE = './messages.json';

// Funções auxiliares para ler/escrever dados
function readData(file) { 
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } 
    catch (e) { return []; } 
}
function writeData(file, data) { 
    fs.writeFileSync(file, JSON.stringify(data, null, 2)); 
}

// ==========================================
// ROTA DE PRESENÇA (FAZ O ONLINE FUNCIONAR)
// ==========================================
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

// ==========================================
// OUTRAS ROTAS (USUÁRIO E MENSAGENS)
// ==========================================

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

app.get('/getUser/:id', (req, res) => {
    const users = readData(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    res.json(user || { error: true });
});

app.post('/saveProfile', (req, res) => {
    const { id, username, photo } = req.body;
    let users = readData(USERS_FILE);
    users = users.map(u => u.id === id ? { ...u, username, photo } : u);
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
    const myMsgs = msgs.filter(m => m.fromId === req.params.id || m.toId === req.params.id);
    res.json(myMsgs);
});

// ==========================================
// CORREÇÃO DE PORTA PARA O RENDER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
