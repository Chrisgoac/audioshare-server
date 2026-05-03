const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
// Función de log con marca de tiempo
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Almacenar anfitriones activos por Room ID
const rooms = new Map();

io.on('connection', (socket) => {
  log(`User connected: ${socket.id}`);

  // Un Host crea una sala
  socket.on('create-room', (roomId) => {
    if (rooms.has(roomId)) {
      // Si la sala ya existe, el antiguo anfitrión es reemplazado o se ignora
      log(`Room ${roomId} already exists, replacing host.`);
    }
    socket.join(roomId);
    rooms.set(roomId, socket.id);
    log(`Host (${socket.id}) created room: ${roomId}`);
    socket.emit('room-created', roomId);
  });

  // Un Cliente se une a una sala
  socket.on('join-room', (roomId) => {
    if (rooms.has(roomId)) {
      socket.join(roomId);
      log(`Client (${socket.id}) joined room: ${roomId}`);
      // Notificar al Host que alguien se unió
      socket.to(rooms.get(roomId)).emit('client-joined', socket.id);
    } else {
      log(`Client (${socket.id}) tried to join non-existent room: ${roomId}`);
      socket.emit('error', 'Sala no encontrada');
    }
  });

  // Alguien abandona la sala intencionalmente
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    if (rooms.get(roomId) === socket.id) {
      rooms.delete(roomId);
      log(`Host (${socket.id}) left room: ${roomId}`);
      socket.to(roomId).emit('host-disconnected');
    } else {
      log(`Client (${socket.id}) left room: ${roomId}`);
    }
  });

  // Reenviar WebRTC Offer (De Host a Cliente o Cliente a Host)
  socket.on('offer', (data) => {
    log(`Forwarding OFFER from ${socket.id} to ${data.to}`);
    socket.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  // Reenviar WebRTC Answer
  socket.on('answer', (data) => {
    log(`Forwarding ANSWER from ${socket.id} to ${data.to}`);
    socket.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  // Reenviar ICE Candidates
  socket.on('ice-candidate', (data) => {
    log(`Forwarding ICE CANDIDATE from ${socket.id} to ${data.to}`);
    socket.to(data.to).emit('ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    log(`User disconnected: ${socket.id}`);
    // Limpiar salas si el desconectado era un Host
    for (const [roomId, hostId] of rooms.entries()) {
      if (hostId === socket.id) {
        rooms.delete(roomId);
        log(`Room ${roomId} deleted because host disconnected`);
        // Notificar a los clientes
        socket.to(roomId).emit('host-disconnected');
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Signaling Server running on port ${PORT}`);
});
