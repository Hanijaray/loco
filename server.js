const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Socket.io configuration with CORS to allow communication with the client
const io = new Server(server, {
    cors: {
        origin: ["https://dazzling-babka-c7886c.netlify.app"], // Allow both origins
        methods: ["GET", "POST"], // Allowed methods
    }
});
// Middleware to parse JSON and URL-encoded data
app.use(express.json()); // Parses incoming JSON requests
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Enable CORS for all routes
// Initialize SQLite database

let drivers = {}; // Object to store driver locations

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Listen for location updates from drivers
    socket.on('updateLocation', ({ driverId, lat, long }) => {
        console.log(`Received location update from ${driverId}:`, { lat, long });

        // Update or add the driver's location in the `drivers` object
        drivers[driverId] = { lat, long };

        // Broadcast the updated driver locations to all connected clients
        io.emit('locationUpdate', drivers);

        console.log('Broadcasting updated locations:', drivers);
    });

    // Handle disconnects (optional: cleanup driver info when a driver disconnects)
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);

        // Optionally, remove the driver from the `drivers` object when disconnected
        // If needed, you can use socket.id to identify the driver.
        // Delete drivers[socket.id];

        io.emit('locationUpdate', drivers); // Re-broadcast the updated drivers list
    });
});

// Start the server
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
