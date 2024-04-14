const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const { request } = require("http");
const mysql = require('mysql2/promise');
const dbPath = path.join(__dirname, "moviesData.db");

let db=null;


const initializeDBAndServer=async ()=>{
    try{
        db=await open({
            filename:dbPath,
            driver:sqlite3.Database
        });

        app.listen(3000,(request,response)=>{
            console.log("Server Running at http://localhost:3000/")
            process.exit(1)
        })
    }
    catch(e){
        console.log(`error -> ${e.message}`)
    }
}

initializeDBAndServer();

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'riya',
    password: '@Riyashalya310',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


async function updateUserInDatabase(userId, newUsername, newEmail) {
    // Create a connection pool
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '@Riyashalya310',
        database: 'riya'
    });

    // Get a connection from the pool
    const connection = await pool.getConnection();

    try {
        // Start a transaction
        await connection.beginTransaction();

        // Update user details in the database
        const sql = 'UPDATE users SET username = ?, email = ? WHERE id = ?';
        await connection.query(sql, [newUsername, newEmail, userId]);

        // Commit the transaction
        await connection.commit();

        console.log('User profile updated successfully');
    } catch (error) {
        // Rollback the transaction in case of any error
        await connection.rollback();
        throw error;
    } finally {
        // Release the connection back to the pool
        connection.release();
    }
}


class User {
    constructor(id, username, email) {
        this.id = id;
        this.username = username;
        this.email = email;
    }

    // Method for user authentication (mock implementation)
    generateAuthToken() {
        const token = jwt.sign({ id: this.id }, 'MY_TOKEN');
        return token;
    }

    // Method for user authentication (verify JWT token)
    static async authenticate(token) {
        try {
            const decoded = jwt.verify(token, 'MY_TOKEN');
            const userId = decoded.id;
            const [rows, fields] = await pool.query('SELECT * FROM user WHERE id = ?', [userId]);
            if (rows.length === 0) return null; // User not found
            const { id, name, email } = rows[0];
            return new User(id, name, email);
        } catch (error) {
            throw new Error('Authentication failed');
        }
    }

    // Method for profile management
    async updateProfile(username, email) {
        await updateUserInDatabase(this.id, username, email);
        this.username = username;
        this.email = email;
    }

    // Method for interacting with travel diary entries
    async createDiaryEntry(title, description, date, location, photos) {
        const entry = new DiaryEntry(title, description, date, location, photos, this.id);
        await entry.saveToDatabase();
        return entry;
    }
}

class DiaryEntry {
    constructor(title, description, date, location, photos, userId) {
        this.title = title;
        this.description = description;
        this.date = date;
        this.location = location;
        this.photos = photos;
        this.userId = userId;
    }

    async saveToDatabase() {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '@Riyashalya310',
            database: 'riya'
        });
        await connection.execute('INSERT INTO diary_entry (title, description, date, location, photos, userId) VALUES (?, ?, ?, ?, ?, ?)',
            [this.title, this.description, this.date, this.location, this.photos, this.userId]);
        await connection.end();
    }

    // CRUD methods for diary entries
    static async create(title, description, date, location, photos, userId) {
        const newEntry = new DiaryEntry(title, description, date, location, photos, userId);
        await newEntry.saveToDatabase(); // Save the entry to the database
        return newEntry;
    }

    static async read(id) {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '@Riyashalya310',
            database: 'riya'
        });
        const [rows] = await connection.execute('SELECT * FROM diary_entry WHERE userId = ?', [id]);
        await connection.end();

        if (rows.length === 0) {
            throw new Error('Diary entry not found');
        }

        const { title, description, date, location, photos } = rows[0];
        return new DiaryEntry( title, description, date, location, photos);
    }

    async update(title, description, date, location, photos) {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '@Riyashalya310',
            database: 'riya'
        });
        await connection.execute('UPDATE diary_entry SET title=?, description=?, date=?, location=?, photos=? WHERE id=? AND userId=?',
            [title, description, date, location, photos, this.id, this.userId]);
        await connection.end();
        // Update instance properties
        this.title = title;
        this.description = description;
        this.date = date;
        this.location = location;
        this.photos = photos;
    }

    async delete() {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '@Riyashalya310',
            database: 'riya'
        });
        await connection.execute('DELETE FROM diary_entry WHERE id = ?', [this.id]);
        await connection.end();
    }
}



function authenticateToken(request, response, next) {
    let jwtToken;
    const auth = req.headers['authorization'];
    if (auth!==undefined){
        jwtToken=auth.split(' ')[1];
    }
    if (jwtToken===undefined){
        response.status(401);
        response.send("Invalid Token");
    }
    else{
        jwt.verify(jwtToken,"MY_TOKEN",async(error,payload)=>{
            if (error){
                response.status(401);
            }
            else{
                request.username=payload.username;
                next();
            }
        })
    }
}

// Routes for user registration, login, and profile management

// User registration
app.post('/api/register', (request, response) => {
    const { username, email, password } = request.body;
    if (!username || !email || !password) {
        return response.status(400).json({ message: 'Please provide username, email, and password' });
    }

    // Check if the user already exists
    if (User.some(user => user.email === email)) {
        return res.status(409).json({ message: 'User already exists' });
    }

    // Create a new user object
    const newUser = { id: User.length + 1, username, email, password };
    User.push(newUser);

    // Generate JWT token for the new user
    const token = jwt.sign({ id: newUser.id }, 'MY_TOKEN');

    // Respond with the token
    response.status(201).json({ token });
});

// User login
app.post('/api/login', (request, response) => {
    const { email, password } = request.body;
    if (!email || !password) {
        return response.status(400).json({ message: 'Please provide email and password' });
    }

    // Find the user by email and password (replace with actual authentication logic)
    const user = user.find(user => user.email === email && user.password === password);
    if (!user) {
        return response.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token for the user
    const token = jwt.sign({ id: user.id }, 'MY_TOKEN');

    // Respond with the token
    response.json({ token });
});

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
    // Fetch user profile from the database (replace with actual database query)
    const user = user.find(user => user.id === req.user.id);
    res.json(user);
});

// Update user profile
app.put('/api/profile', authenticateToken, (req, res) => {
    const { username, email } = req.body;
    if (!username || !email) {
        return res.status(400).json({ message: 'Please provide username and email' });
    }

    // Update user profile in the database (replace with actual database update)
    const user = user.find(user => user.id === req.user.id);
    user.username = username;
    user.email = email;

    res.json({ message: 'Profile updated successfully' });
});

// Routes for CRUD operations on diary entries

// Create diary entry
app.post('/api/diary-entries', authenticateToken, (req, res) => {
    const { title, description, date, location, photos } = req.body;
    if (!title || !date || !location) {
        return res.status(400).json({ message: 'Please provide title, date, and location' });
    }

    // Create a new diary entry object
    const newEntry = { id: DiaryEntry.length + 1, title, description, date, location, photos, userId: req.user.id };
    DiaryEntry.push(newEntry);

    res.status(201).json(newEntry);
});

// Read diary entry by ID
app.get('/api/diary-entries/:id', authenticateToken, (req, res) => {
    const entry = DiaryEntry.find(entry => entry.id === parseInt(req.params.id));
    if (!entry) {
        return res.status(404).json({ message: 'Diary entry not found' });
    }
    res.json(entry);
});

// Update diary entry by ID
app.put('/api/diary-entries/:id', authenticateToken, (req, res) => {
    const { title, description, date, location, photos } = req.body;
    if (!title || !date || !location) {
        return res.status(400).json({ message: 'Please provide title, date, and location' });
    }

    const entry = DiaryEntry.find(entry => entry.id === parseInt(req.params.id));
    if (!entry) {
        return res.status(404).json({ message: 'Diary entry not found' });
    }

    entry.title = title;
    entry.description = description;
    entry.date = date;
    entry.location = location;
    entry.photos = photos;

    res.json({ message: 'Diary entry updated successfully' });
});

// Delete diary entry by ID
app.delete('/api/diary-entries/:id', authenticateToken, (req, res) => {
    const index = DiaryEntry.findIndex(entry => entry.id === parseInt(req.params.id));
    if (index === -1) {
        return res.status(404).json({ message: 'Diary entry not found' });
    }

    DiaryEntry.splice(index, 1);
    res.json({ message: 'Diary entry deleted successfully' });
});

// Get all diary entries for the authenticated user
app.get('/api/diary-entries', authenticateToken, (req, res) => {
    const userEntries = DiaryEntry.filter(entry => entry.userId === req.user.id);
    res.json(userEntries);
});


module.exports=app;