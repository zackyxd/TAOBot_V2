// const Database = require('better-sqlite3');
const path = require('path');

// Define the path to your database file
const dbPath = path.join(__dirname, 'test.db');

// Open the database
const db = new Database(dbPath);

// Create a table
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  email TEXT
)`).run();

const name = 'John Doe';
const email = 'john@example.com';

// Check if the user already exists
const existingUser = db.prepare(`SELECT * FROM users WHERE name = ?`).get(name);

if (!existingUser) {
  // Insert the new user if it doesn't exist
  db.prepare(`INSERT INTO users (name, email) VALUES (?, ?)`).run(name, email);
} else {
  console.log('User already exists:', existingUser);
}

rows = db.prepare('SELECT * FROM users').all();
console.log('Queried data:', rows);