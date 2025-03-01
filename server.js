
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
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS driver_reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              driver_id TEXT NOT NULL,
              latitude REAL NOT NULL,
              longitude REAL NOT NULL,
              work_description TEXT,
              report_date DATE NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS driver_distance (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              driver_id TEXT,
              distance REAL,
              start_time TEXT,
              end_time TEXT
            )
          `);
        }
      });
 
app.get('/dri', (req, res) => {
    const query = 'SELECT DISTINCT driver_id FROM driver_reports';
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching drivers.', error: err.message });
        }
        res.json(rows); // Respond with a list of drivers (driver_id)
    });
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


/// API endpoint for submitting a report
app.post('/submit-report', (req, res) => {
    const { driver_id, latitude, longitude, work_description } = req.body;

    if (!driver_id || !latitude || !longitude) {
        return res.status(400).json({ message: 'Driver ID, latitude, and longitude are required.' });
    }

    const report_date = new Date().toISOString(); // Current timestamp
    const query = `
        INSERT INTO driver_reports (driver_id, latitude, longitude, work_description, report_date)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(query, [driver_id, latitude, longitude, work_description, report_date], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Error saving report.', error: err.message });
        }
        res.status(200).json({ message: 'Report submitted successfully.', report_id: this.lastID });
    });
});


// API endpoint to fetch all reports (for debugging or admin view)
app.get('/reports', (req, res) => {
    db.all('SELECT * FROM driver_reports', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching reports.', error: err.message });
        }

        // Update drivers object with the latest locations
        rows.forEach((report) => {
            if (report.driver_id && report.latitude && report.longitude) {
                drivers[report.driver_id] = {
                    latitude: report.latitude,
                    longitude: report.longitude,
                };
            }
        });

        res.json(rows);
    });
});
app.get('/driver-reports/:driverId', (req, res) => {
    const driverId = req.params.driverId;
    const query = 'SELECT * FROM driver_reports WHERE driver_id = ? ORDER BY report_date DESC';
    db.all(query, [driverId], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching reports.', error: err.message });
        }
        res.json(rows); // Respond with the reports for the selected driver
    });
});



     
// In-memory object to store driver states (location and distance)
let drivers = {};

// Socket.io connection handling
io.on('connection', (socket) => {
console.log('A user connected:', socket.id);

// Listen for location updates from drivers
socket.on('updateLocation', ({ driverId, lat, long, totalDistance }) => {
  console.log(`Received location update from ${driverId}:`, { lat, long, totalDistance });
  // Save driverId on the socket for disconnect handling
  socket.driverId = driverId;

  // Update or initialize the driver's state
  drivers[driverId] = {
    lat,
    long,
    totalDistance, // this value is coming from your client (already calculated)
    startTime: drivers[driverId] ? drivers[driverId].startTime : new Date().toISOString()
  };

  // Broadcast updated driver states to all clients
  io.emit('locationUpdate', drivers);
});

// When a driver disconnects, store their distance info in the database
socket.on('disconnect', () => {
  console.log('A user disconnected:', socket.id);
  if (socket.driverId && drivers[socket.driverId]) {
    const { totalDistance, startTime } = drivers[socket.driverId];
    const endTime = new Date().toISOString();
    const query = `
      INSERT INTO driver_distance (driver_id, distance, start_time, end_time)
      VALUES (?, ?, ?, ?)
    `;
    db.run(query, [socket.driverId, totalDistance, startTime, endTime], function(err) {
      if (err) {
        console.error('Error storing driver distance:', err.message);
      } else {
        console.log(`Stored distance for driver ${socket.driverId}: ${totalDistance} km`);
      }
    });
    delete drivers[socket.driverId];
    io.emit('locationUpdate', drivers);
  }
});
});

// Start the server
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
