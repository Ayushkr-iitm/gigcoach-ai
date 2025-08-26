const { Pool } = require('pg');
require('dotenv').config();

// Set up a config object
const connectionConfig = {
  connectionString: process.env.DATABASE_URL
};

// Add SSL configuration ONLY when in a production environment (like on Render)
if (process.env.NODE_ENV === 'production') {
  connectionConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(connectionConfig);

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

module.exports = pool;