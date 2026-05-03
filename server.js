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

// Almacenar anfitriones activos por Room ID
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Un Host crea una sala
  socket.on('create-room', (roomId) => {
    if (rooms.has(roomId)) {
      // Si la sala ya existe, el antiguo anfitrión es reemplazado o se ignora
      console.log(`Room ${roomId} already exists, replacing host.`);
    }
    socket.join(roomId);
    rooms.set(roomId, socket.id);
    console.log(`Host created room: ${roomId}`);
    socket.emit('room-created', roomId);
  });

  // Un Cliente se une a una sala
  socket.on('join-room', (roomId) => {
    if (rooms.has(roomId)) {
      socket.join(roomId);
      console.log(`Client joined room: ${roomId}`);
      // Notificar al Host que alguien se unió
      socket.to(rooms.get(roomId)).emit('client-joined', socket.id);
    } else {
      socket.emit('error', 'Sala no encontrada');
    }
  });

  // Reenviar WebRTC Offer (De Host a Cliente o Cliente a Host)
  socket.on('offer', (data) => {
    socket.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  // Reenviar WebRTC Answer
  socket.on('answer', (data) => {
    socket.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  // Reenviar ICE Candidates
  socket.on('ice-candidate', (data) => {
    socket.to(data.to).emit('ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Limpiar salas si el desconectado era un Host
    for (const [roomId, hostId] of rooms.entries()) {
      if (hostId === socket.id) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted because host disconnected`);
        // Notificar a los clientes
        socket.to(roomId).emit('host-disconnected');
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling Server running on port ${PORT}`);
});
