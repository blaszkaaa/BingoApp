const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const compression = require('compression');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const winston = require('winston');
const session = require('express-session');
const sharedsession = require('express-socket.io-session');
const { Parser } = require('json2csv');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: 'logs/server.log' }),
        new winston.transports.Console(),
    ],
});

const rooms = {};
let userAccounts = {};
let bingoCards = {};
let userStats = {};
let bannedUsers = {};

// Load users.json
try {
    const data = fs.readFileSync('users.json', 'utf8');
    userAccounts = JSON.parse(data);
} catch (err) {
    logger.info('Inicjalizowanie pustych kont użytkowników.');
    userAccounts = {};
}

// Load bingo_cards.json
try {
    const data = fs.readFileSync('bingo_cards.json', 'utf8');
    bingoCards = JSON.parse(data);
} catch (err) {
    logger.info('Inicjalizowanie pustych kart Bingo.');
    bingoCards = {};
}

// Load user_stats.json
try {
    const data = fs.readFileSync('user_stats.json', 'utf8');
    userStats = JSON.parse(data);
} catch (err) {
    logger.info('Inicjalizowanie pustych statystyk użytkowników.');
    userStats = {};
}

// Load banned_users.json
try {
    const data = fs.readFileSync('banned_users.json', 'utf8');
    bannedUsers = JSON.parse(data);
} catch (err) {
    logger.info('Inicjalizowanie pustej listy zbanowanych użytkowników.');
    bannedUsers = {};
}

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
});

app.use(sessionMiddleware);

io.use(
    sharedsession(sessionMiddleware, {
        autoSave: true,
    })
);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const adminUsername = 'blaszka';
const adminPasswordHash = bcrypt.hashSync('qwpo1234', 10);

app.get('/admin', (req, res) => {
    if (req.session && req.session.admin) {
        res.redirect('/admin/panel');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUsername && bcrypt.compareSync(password, adminPasswordHash)) {
        req.session.admin = true;
        res.redirect('/admin/panel');
    } else {
        res.redirect('/admin?error=1');
    }
});

app.get('/admin/panel', (req, res) => {
    if (req.session && req.session.admin) {
        res.sendFile(path.join(__dirname, 'public', 'admin_panel.html'));
    } else {
        res.redirect('/admin');
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin');
});

// API endpoints for admin functionalities
app.get('/admin/data', (req, res) => {
    if (req.session && req.session.admin) {
        const users = userAccounts;
        const stats = userStats;
        const cards = bingoCards;
        const logs = fs.readFileSync('logs/server.log', 'utf8');
        const activeRooms = getActiveRooms();
        const banned = bannedUsers;
        res.json({ users, stats, cards, logs, activeRooms, banned });
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to delete a user
app.post('/admin/deleteUser', (req, res) => {
    if (req.session && req.session.admin) {
        const username = req.body.username;
        if (userAccounts[username]) {
            delete userAccounts[username];
            delete bingoCards[username];
            delete userStats[username];
            delete bannedUsers[username];
            saveUserAccounts();
            saveBingoCards();
            saveUserStats();
            saveBannedUsers();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Użytkownik nie istnieje.' });
        }
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to reset a user's password
app.post('/admin/resetPassword', (req, res) => {
    if (req.session && req.session.admin) {
        const username = req.body.username;
        const newPassword = req.body.newPassword;
        if (userAccounts[username]) {
            const hashedPassword = bcrypt.hashSync(newPassword, 10);
            userAccounts[username] = hashedPassword;
            saveUserAccounts();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Użytkownik nie istnieje.' });
        }
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to reset user statistics
app.post('/admin/resetStats', (req, res) => {
    if (req.session && req.session.admin) {
        userStats = {};
        saveUserStats();
        res.json({ success: true });
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to close a room
app.post('/admin/closeRoom', (req, res) => {
    if (req.session && req.session.admin) {
        const roomName = req.body.roomName;
        if (rooms[roomName]) {
            // Notify users in the room
            io.to(roomName).emit('roomClosed', 'Pokój został zamknięty przez administratora.');
            // Remove all users from the room
            for (let socketId in rooms[roomName].users) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.leave(roomName);
                    socket.emit('roomClosed', 'Pokój został zamknięty przez administratora.');
                }
            }
            delete rooms[roomName];
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Pokój nie istnieje.' });
        }
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to broadcast message to all users
app.post('/admin/broadcastMessage', (req, res) => {
    if (req.session && req.session.admin) {
        const message = req.body.message;
        io.emit('adminBroadcast', message);
        res.json({ success: true });
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to ban a user
app.post('/admin/banUser', (req, res) => {
    if (req.session && req.session.admin) {
        const username = req.body.username;
        if (userAccounts[username]) {
            bannedUsers[username] = true;
            saveBannedUsers();
            // Disconnect the user if online
            for (let socketId in io.sockets.sockets) {
                const socket = io.sockets.sockets[socketId];
                if (socket.username === username) {
                    socket.emit('banned', 'Zostałeś zbanowany przez administratora.');
                    socket.disconnect();
                }
            }
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Użytkownik nie istnieje.' });
        }
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to unban a user
app.post('/admin/unbanUser', (req, res) => {
    if (req.session && req.session.admin) {
        const username = req.body.username;
        if (bannedUsers[username]) {
            delete bannedUsers[username];
            saveBannedUsers();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Użytkownik nie jest zbanowany.' });
        }
    } else {
        res.status(403).send('Forbidden');
    }
});

// Endpoint to export user data as CSV
app.get('/admin/exportData', (req, res) => {
    if (req.session && req.session.admin) {
        const fields = ['username', 'wins'];
        const opts = { fields };
        const data = Object.keys(userStats).map(username => ({
            username: username,
            wins: userStats[username].wins,
        }));
        try {
            const parser = new Parser(opts);
            const csv = parser.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment('user_stats.csv');
            return res.send(csv);
        } catch (err) {
            logger.error('Błąd eksportu danych:', err);
            res.status(500).send('Wystąpił błąd podczas eksportu danych.');
        }
    } else {
        res.status(403).send('Forbidden');
    }
});

io.on('connection', (socket) => {
    logger.info(`Nowe połączenie: ${socket.id}`);

    if (socket.handshake.session.username) {
        const username = socket.handshake.session.username;
        if (bannedUsers[username]) {
            socket.emit('banned', 'Zostałeś zbanowany przez administratora.');
            socket.disconnect();
            return;
        }
        socket.username = username;
        socket.emit('loggedIn', socket.username);
        logger.info(`Użytkownik zalogowany przez sesję: ${socket.username}`);
    }

    socket.on('register', async (data) => {
        const { username, password } = data;
        if (userAccounts[username]) {
            socket.emit('registerError', 'Użytkownik o takiej nazwie już istnieje.');
            logger.warn(`Próba rejestracji istniejącego użytkownika: ${username}`);
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);
            userAccounts[username] = hashedPassword;
            saveUserAccounts();
            socket.emit('registerSuccess', 'Rejestracja zakończona sukcesem. Możesz się teraz zalogować.');
            logger.info(`Zarejestrowano nowego użytkownika: ${username}`);
        }
    });

    socket.on('login', async (data) => {
        const { username, password } = data;
        if (bannedUsers[username]) {
            socket.emit('loginError', 'Zostałeś zbanowany przez administratora.');
            logger.warn(`Zbanowany użytkownik próbuje się zalogować: ${username}`);
            return;
        }
        const hashedPassword = userAccounts[username];
        if (hashedPassword) {
            const match = await bcrypt.compare(password, hashedPassword);
            if (match) {
                socket.username = username;
                socket.handshake.session.username = username;
                socket.handshake.session.save();
                if (bingoCards[username]) {
                    socket.emit('loadBingoCard', bingoCards[username]);
                }
                socket.emit('loggedIn', username);
                logger.info(`Użytkownik zalogowany: ${username}`);
            } else {
                socket.emit('loginError', 'Nieprawidłowe hasło.');
                logger.warn(`Nieudane logowanie (błędne hasło) dla użytkownika: ${username}`);
            }
        } else {
            socket.emit('loginError', 'Użytkownik nie istnieje.');
            logger.warn(`Nieudane logowanie (użytkownik nie istnieje): ${username}`);
        }
    });

    socket.on('logout', () => {
        if (socket.username) {
            logger.info(`Użytkownik wylogowany: ${socket.username}`);
            delete socket.handshake.session.username;
            socket.handshake.session.save();
            delete socket.username;
            socket.emit('loggedOut');
        }
    });

    socket.on('createRoom', async (data) => {
        const { roomName, roomPassword } = data;
        if (rooms[roomName]) {
            socket.emit('error', 'Pokój o tej nazwie już istnieje.');
            logger.warn(`Próba utworzenia istniejącego pokoju: ${roomName}`);
            return;
        }
        const hashedPassword = await bcrypt.hash(roomPassword, 10);
        rooms[roomName] = { users: {}, password: hashedPassword, winner: null, chatHistory: [] };
        socket.join(roomName);
        rooms[roomName].users[socket.id] = { username: socket.username };
        socket.emit('roomCreated', roomName);
        logger.info(`Utworzono pokój: ${roomName} przez użytkownika ${socket.username}`);
    });

    socket.on('joinRoom', async (data) => {
        const { roomName, roomPassword } = data;
        const room = rooms[roomName];
        if (room) {
            const match = await bcrypt.compare(roomPassword, room.password);
            if (match) {
                socket.join(roomName);
                room.users[socket.id] = { username: socket.username };
                socket.emit('roomJoined', roomName, room.winner);
                socket.emit('chatHistory', room.chatHistory);
                io.to(roomName).emit('updateUsers', getUsersInRoom(roomName), room.winner ? room.winner.username : null);
                logger.info(`Użytkownik ${socket.username} dołączył do pokoju: ${roomName}`);
            } else {
                socket.emit('error', 'Nieprawidłowe hasło do pokoju.');
                logger.warn(`Nieudane dołączenie do pokoju (błędne hasło): ${roomName} przez ${socket.username}`);
            }
        } else {
            socket.emit('error', 'Pokój nie istnieje!');
            logger.warn(`Nieudane dołączenie do pokoju (pokój nie istnieje): ${roomName} przez ${socket.username}`);
        }
    });

    socket.on('saveBingoCard', (bingoCard) => {
        const username = socket.username;
        if (username) {
            bingoCards[username] = bingoCard;
            saveBingoCards();
            socket.emit('bingoCardSaved');
            logger.info(`Zapisano kartę Bingo dla użytkownika: ${username}`);
        }
    });

    socket.on('deleteBingoCard', () => {
        const username = socket.username;
        if (username && bingoCards[username]) {
            delete bingoCards[username];
            saveBingoCards();
            socket.emit('bingoCardDeleted');
            logger.info(`Usunięto kartę Bingo dla użytkownika: ${username}`);
        }
    });

    socket.on('bingo', (roomName, selectedCells) => {
        const room = rooms[roomName];
        if (room) {
            if (!room.winner) {
                const winnerName = socket.username;
                const winningCard = bingoCards[winnerName] || [];
                room.winner = {
                    username: winnerName,
                    card: winningCard,
                    selectedCells: selectedCells,
                };

                if (!userStats[winnerName]) {
                    userStats[winnerName] = { wins: 0 };
                }
                userStats[winnerName].wins += 1;
                saveUserStats();

                io.to(roomName).emit('bingo', {
                    message: `${winnerName} wygrał(a) Bingo!`,
                    winner: room.winner,
                });
                io.to(roomName).emit('updateUsers', getUsersInRoom(roomName), room.winner.username);
                logger.info(`Bingo wygrane przez: ${winnerName} w pokoju: ${roomName}`);
            } else {
                socket.emit('bingoAlreadyWon', `Bingo zostało już wygrane przez ${room.winner.username}.`);
                logger.info(`Użytkownik ${socket.username} próbował wygrać Bingo w pokoju ${roomName}, ale ktoś już wygrał.`);
            }
        }
    });

    socket.on('chatMessage', (roomName, message) => {
        const room = rooms[roomName];
        if (room) {
            const chatMessage = { username: socket.username, message };
            room.chatHistory.push(chatMessage);
            io.to(roomName).emit('chatMessage', chatMessage);
            logger.info(`Wiadomość w pokoju ${roomName} od ${socket.username}: ${message}`);
        }
    });

    // Private messaging
    socket.on('privateMessage', (toUsername, message) => {
        const targetSocket = findSocketByUsername(toUsername);
        if (targetSocket) {
            targetSocket.emit('privateMessage', socket.username, message);
            socket.emit('privateMessageSent', toUsername, message);
            logger.info(`Wiadomość prywatna od ${socket.username} do ${toUsername}: ${message}`);
        } else {
            socket.emit('privateMessageError', `Użytkownik ${toUsername} nie jest online.`);
            logger.warn(`Próba wysłania wiadomości prywatnej do offline użytkownika: ${toUsername}`);
        }
    });

    // Admin Broadcast
    socket.on('adminBroadcast', (message) => {
        if (socket.handshake.session.admin) {
            io.emit('adminBroadcast', message);
            logger.info(`Broadcast od admina: ${message}`);
        }
    });

    // Handle room closed by admin
    socket.on('roomClosed', (roomName, message) => {
        if (socket.handshake.session.admin) {
            io.to(roomName).emit('roomClosed', message);
            // Remove all users from the room
            for (let socketId in rooms[roomName].users) {
                const userSocket = io.sockets.sockets.get(socketId);
                if (userSocket) {
                    userSocket.leave(roomName);
                    userSocket.emit('roomClosed', 'Pokój został zamknięty przez administratora.');
                }
            }
            delete rooms[roomName];
            logger.info(`Pokój zamknięty przez admina: ${roomName}`);
        }
    });

    socket.on('disconnect', () => {
        const username = socket.username;
        for (const roomName in rooms) {
            const room = rooms[roomName];
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                io.to(roomName).emit('updateUsers', getUsersInRoom(roomName), room.winner ? room.winner.username : null);
                logger.info(`Użytkownik ${username} opuścił pokój: ${roomName}`);
                break;
            }
        }
        logger.info(`Rozłączono: ${socket.id} (${username})`);
    });

    function saveUserAccounts() {
        fs.writeFile('users.json', JSON.stringify(userAccounts), (err) => {
            if (err) {
                logger.error('Błąd zapisu users.json:', err);
            } else {
                logger.info('Zapisano plik users.json');
            }
        });
    }

    function saveBingoCards() {
        fs.writeFile('bingo_cards.json', JSON.stringify(bingoCards), (err) => {
            if (err) {
                logger.error('Błąd zapisu bingo_cards.json:', err);
            } else {
                logger.info('Zapisano plik bingo_cards.json');
            }
        });
    }

    function saveUserStats() {
        fs.writeFile('user_stats.json', JSON.stringify(userStats), (err) => {
            if (err) {
                logger.error('Błąd zapisu user_stats.json:', err);
            } else {
                logger.info('Zapisano plik user_stats.json');
            }
        });
    }

    function saveBannedUsers() {
        fs.writeFile('banned_users.json', JSON.stringify(bannedUsers), (err) => {
            if (err) {
                logger.error('Błąd zapisu banned_users.json:', err);
            } else {
                logger.info('Zapisano plik banned_users.json');
            }
        });
    }

    function getUserRankings() {
        const users = Object.keys(userStats);
        const rankings = users.map((username) => ({
            username,
            wins: userStats[username].wins,
        }));
        rankings.sort((a, b) => b.wins - a.wins);
        return rankings;
    }

    function getUsersInRoom(roomName) {
        return Object.values(rooms[roomName].users).map((user) => user.username);
    }

    function getActiveRooms() {
        const activeRooms = [];
        for (let roomName in rooms) {
            activeRooms.push({
                roomName: roomName,
                userCount: Object.keys(rooms[roomName].users).length,
            });
        }
        return activeRooms;
    }

    function findSocketByUsername(username) {
        for (let [id, socket] of io.sockets.sockets) {
            if (socket.username === username) {
                return socket;
            }
        }
        return null;
    }

    const PORT = process.env.PORT || 3000;
    http.listen(PORT, () => {
        logger.info(`Serwer działa na porcie ${PORT}`);
    });})