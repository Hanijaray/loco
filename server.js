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
const db = new sqlite3.Database('./location.db', (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS drivers (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                driverid TEXT, 
                password TEXT
            )
        `, (err) => {
            if (err) {
                console.error('Error creating drivers table:', err.message);
            }
        });
    }
});

app.get('/drivers', (req, res) => {
    const query = `SELECT driverid FROM drivers`;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching drivers.', error: err.message });
        }
        res.json(rows); // Return an array of driver IDs
    });
});
/// Add a new driver
app.post('/add-driver', (req, res) => {
    console.log('Request body:', req.body); // Log the request body
    const { driverid, password } = req.body;

    if (!driverid || !password) {
        return res.status(400).json({ message: 'Driver ID and password are required.' });
    }

    const query = `INSERT INTO drivers (driverid, password) VALUES (?, ?)`;
    db.run(query, [driverid, password], (err) => {
        if (err) {
            console.error('Database error:', err.message); // Log error
            return res.status(500).json({ 
                message: 'Error adding driver.', 
                error: err.message 
            });
        }
        res.json({ message: 'Driver added successfully.' });
    });
});

// Authenticate a driver
app.post('/login', (req, res) => {
    const { driverid, password } = req.body;

    if (!driverid || !password) {
        return res.status(400).json({ message: 'Driver ID and password are required.' });
    }

    const query = `SELECT * FROM drivers WHERE driverid = ? AND password = ?`;
    db.get(query, [driverid, password], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Error authenticating driver.', error: err.message });
        }

        if (row) {
            res.json({ message: 'Login successful', driverId: row.driverid });
        } else {
            res.status(401).json({ message: 'Invalid credentials.' });
        }
    });
});

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
