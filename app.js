const express = require('express');
const app = express();
const port = 3000;
const pool = require('./db');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// ========== Middleware ========== //
app.use(cors()); // Allows your frontend to connect to this backend
app.use(express.json()); // Parses JSON data for API routes
app.use(express.urlencoded({ extended: false })); // Parses form data for Twilio webhook

// ========== Routes ========== //

// Homepage Route
app.get('/', (req, res) => {
  res.send('GigCoach AI Server is Running! 🚀');
});

// API ENDPOINT: Add Earnings
app.post('/api/earnings', async (req, res) => {
  const { phone_number, date, amount } = req.body;
  if (!phone_number || !date || !amount) {
    return res.status(400).json({ error: 'Missing required fields: phone_number, date, amount' });
  }
  try {
    const userQuery = 'SELECT id FROM users WHERE phone_number = $1';
    const userResult = await pool.query(userQuery, [phone_number]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    const insertEarningsQuery = `INSERT INTO earnings (user_id, date, amount) VALUES ($1, $2, $3) RETURNING *`;
    const earningsResult = await pool.query(insertEarningsQuery, [userId, date, amount]);
    res.json({
      message: 'Earnings data added successfully',
      data: earningsResult.rows[0]
    });
  } catch (err) {
    console.error('Error adding earnings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API ENDPOINT: Get Historical Earnings
app.get('/api/forecast/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const userQuery = 'SELECT id FROM users WHERE phone_number = $1';
    const userResult = await pool.query(userQuery, [phone_number]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    const earningsQuery = 'SELECT date, amount FROM earnings WHERE user_id = $1 ORDER BY date';
    const earningsResult = await pool.query(earningsQuery, [userId]);
    if (earningsResult.rows.length === 0) {
      return res.status(404).json({ error: 'No earnings data found for user' });
    }
    res.json({
      message: 'Historical data found',
      user_id: userId,
      data: earningsResult.rows
    });
  } catch (err) {
    console.error('Error generating forecast:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API ENDPOINT: Get Latest Forecast
app.get('/api/latest-forecast/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const query = `
      SELECT predicted_amount 
      FROM forecasts 
      WHERE user_id = (SELECT id FROM users WHERE phone_number = $1) 
      ORDER BY created_at DESC 
      LIMIT 1;
    `;
    const result = await pool.query(query, [phone_number]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No forecast found for this user.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching latest forecast:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== AUTHENTICATION ENDPOINTS ========== //

// POST /api/auth/login - Step 1: Request an OTP
app.post('/api/auth/login', async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

  try {
    // Find user or create a new one if they don't exist
    let userResult = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phone_number]);
    if (userResult.rows.length === 0) {
      userResult = await pool.query('INSERT INTO users(phone_number) VALUES($1) RETURNING *', [phone_number]);
    }

    const user = userResult.rows[0];

    // Save the OTP and expiry to the user's record
    await pool.query('UPDATE users SET otp = $1, otp_expires_at = $2 WHERE id = $3', [otp, otp_expires_at, user.id]);

    // Here you would use Twilio to send the OTP. For now, we'll log it to the console for testing.
    console.log(`---- OTP for ${phone_number} is ${otp} ----`);
    // In production, you would uncomment and configure this:
    // const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await twilioClient.messages.create({
    //   from: 'whatsapp:+14155238886', // Your Twilio sandbox number
    //   to: phone_number,
    //   body: `Your GigCoach AI login code is: ${otp}`
    // });

    res.json({ message: 'OTP has been sent. Please check your console.' });

  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify - Step 2: Verify the OTP and get a token
app.post('/api/auth/verify', async (req, res) => {
  const { phone_number, otp } = req.body;
  if (!phone_number || !otp) {
    return res.status(400).json({ error: 'Phone number and OTP are required.' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE phone_number = $1 AND otp = $2 AND otp_expires_at > NOW()', [phone_number, otp]);

    if (userResult.rows.length === 0) {
      // This could be because the OTP is wrong or it has expired
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    const user = userResult.rows[0];

    // Clear the OTP after successful verification
    await pool.query('UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);

    // Create a secure JWT token
    // IMPORTANT: In a real app, 'YOUR_SECRET_KEY' should be a long, random string stored in an environment variable
    const token = jwt.sign({ userId: user.id, phoneNumber: user.phone_number }, 'YOUR_SECRET_KEY', { expiresIn: '7d' });

    res.json({ message: 'Login successful!', token, user });

  } catch (err) {
    console.error('Error during OTP verification:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE a goal by its ID
app.delete('/api/goals/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleteQuery = 'DELETE FROM goals WHERE id = $1 RETURNING *;';
    const result = await pool.query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    res.status(200).json({ message: 'Goal deleted successfully.' });
  } catch (err) {
    console.error('Error deleting goal:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== API ENDPOINTS for GOALS (NEW CODE) ========== //

// ========== API ENDPOINTS for EXPENSES ========== //

// GET all expenses for a user
app.get('/api/expenses/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const query = `
      SELECT * FROM expenses 
      WHERE user_id = (SELECT id FROM users WHERE phone_number = $1)
      ORDER BY expense_date DESC;
    `;
    const result = await pool.query(query, [phone_number]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new expense for a user
app.post('/api/expenses', async (req, res) => {
  const { phone_number, category, amount, expense_date, description } = req.body;
  if (!phone_number || !category || !amount || !expense_date) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone_number]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const insertQuery = `
      INSERT INTO expenses (user_id, category, amount, expense_date, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [userId, category, amount, expense_date, description]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== API ENDPOINT for DASHBOARD STATS ========== //
app.get('/api/dashboard-stats/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const earningsQuery = `SELECT amount, date FROM earnings WHERE user_id = (SELECT id FROM users WHERE phone_number = $1) ORDER BY date DESC;`;
    const earningsResult = await pool.query(earningsQuery, [phone_number]);
    const earnings = earningsResult.rows.map(r => parseFloat(r.amount));

    let stats = {
        avgIncome: { current: 0, change: 0 },
        aiForecast: { current: 0 },
        gigScore: { current: 300 }
    };

    if (earnings.length > 1) {
        const total = earnings.reduce((sum, val) => sum + val, 0);
        stats.avgIncome.current = Math.round(total / earnings.length);

        // Calculate change vs previous month
        const lastMonth = earnings[0];
        const prevMonth = earnings[1];
        if (prevMonth > 0) {
            stats.avgIncome.change = (lastMonth - prevMonth) / prevMonth;
        }
    }

    // Fetch latest forecast
    const forecastResult = await pool.query(`SELECT predicted_amount FROM forecasts WHERE user_id = (SELECT id FROM users WHERE phone_number = $1) ORDER BY created_at DESC LIMIT 1;`, [phone_number]);
    if (forecastResult.rows.length > 0) {
        stats.aiForecast.current = parseFloat(forecastResult.rows[0].predicted_amount);
    }

    // Fetch GigScore
    const creditResult = await pool.query(`SELECT COUNT(*) as total_months, STDDEV(amount) as income_volatility FROM earnings WHERE user_id = (SELECT id FROM users WHERE phone_number = $1)`, [phone_number]);
    if (creditResult.rows.length > 0 && creditResult.rows[0].total_months > 0) {
        const data = creditResult.rows[0];
        let gigScore = 300;
        gigScore += Math.min(data.total_months * 20, 200);
        if (data.income_volatility < 10000) gigScore += 50;
        stats.gigScore.current = Math.min(gigScore, 850);
    }

    res.json(stats);

  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all goals for a user
app.get('/api/goals/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const query = `
      SELECT * FROM goals 
      WHERE user_id = (SELECT id FROM users WHERE phone_number = $1)
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [phone_number]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching goals:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new goal for a user
app.post('/api/goals', async (req, res) => {
  const { phone_number, goal_name, target_amount, target_date } = req.body;
  if (!phone_number || !goal_name || !target_amount) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const userQuery = 'SELECT id FROM users WHERE phone_number = $1';
    const userResult = await pool.query(userQuery, [phone_number]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const insertQuery = `
      INSERT INTO goals (user_id, goal_name, target_amount, target_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [userId, goal_name, target_amount, target_date]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating goal:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// PUT (update) the current amount for a goal
// PUT (update) a goal's details or current amount
app.put('/api/goals/:id', async (req, res) => {
  const { id } = req.params;
  const { amountToAdd, goal_name, target_amount } = req.body;

  try {
    let query;
    let queryParams;

    if (amountToAdd) {
      // Logic to add savings
      query = `UPDATE goals SET current_amount = current_amount + $1 WHERE id = $2 RETURNING *;`;
      queryParams = [amountToAdd, id];
    } else {
      // Logic to edit goal details
      query = `UPDATE goals SET goal_name = $1, target_amount = $2 WHERE id = $3 RETURNING *;`;
      queryParams = [goal_name, target_amount, id];
    }

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating goal:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// ========== END OF NEW CODE ========== //
// ========== API ENDPOINT for TAX ESTIMATE ========== //
// ========== API ENDPOINT for TAX ESTIMATE (CORRECTED) ========== //
app.get('/api/tax-estimate/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone_number]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    // --- FIX: Changed 'expense_date' to the correct column name 'date' ---
    const earningsQuery = `SELECT SUM(amount) as total_earnings FROM earnings WHERE user_id = $1 AND date >= '2025-04-01'`;
    const expensesQuery = `SELECT SUM(amount) as total_expenses FROM expenses WHERE user_id = $1 AND expense_date >= '2025-04-01'`;

    const [earningsRes, expensesRes] = await Promise.all([
      pool.query(earningsQuery, [userId]),
      pool.query(expensesQuery, [userId])
    ]);

    const grossIncome = parseFloat(earningsRes.rows[0].total_earnings || 0);
    const totalDeductions = parseFloat(expensesRes.rows[0].total_expenses || 0);
    const taxableIncome = Math.max(0, grossIncome - totalDeductions);

    let estimatedTax = 0;
    if (taxableIncome > 300000) {
        if (taxableIncome <= 600000) {
            estimatedTax = (taxableIncome - 300000) * 0.05;
        } else if (taxableIncome <= 900000) {
            estimatedTax = (300000 * 0.05) + (taxableIncome - 600000) * 0.10;
        } else if (taxableIncome <= 1200000) {
            estimatedTax = (300000 * 0.05) + (300000 * 0.10) + (taxableIncome - 900000) * 0.15;
        } else {
            estimatedTax = (300000 * 0.05) + (300000 * 0.10) + (300000 * 0.15) + (taxableIncome - 1200000) * 0.20;
        }
    }
    
    res.json({
        grossIncome,
        totalDeductions,
        taxableIncome,
        estimatedTax: Math.round(estimatedTax)
    });

  } catch (err) {
    console.error('Error calculating tax estimate:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== API ENDPOINTS for USER LOANS ========== //

// GET all of a user's logged loans
app.get('/api/user-loans/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const query = `SELECT * FROM user_loans WHERE user_id = (SELECT id FROM users WHERE phone_number = $1) ORDER BY due_date ASC;`;
    const result = await pool.query(query, [phone_number]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user loans:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new loan for a user
app.post('/api/user-loans', async (req, res) => {
  const { phone_number, lender_name, total_amount, outstanding_amount, interest_rate, due_date } = req.body;
  if (!phone_number || !lender_name || !total_amount || !outstanding_amount) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone_number]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const insertQuery = `
      INSERT INTO user_loans (user_id, lender_name, total_amount, outstanding_amount, interest_rate, due_date)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const result = await pool.query(insertQuery, [userId, lender_name, total_amount, outstanding_amount, interest_rate, due_date]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating user loan:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// ========== API ENDPOINT for AI INSIGHTS ========== //
app.get('/api/insights/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    const earningsQuery = `
      SELECT amount, date FROM earnings 
      WHERE user_id = (SELECT id FROM users WHERE phone_number = $1)
      ORDER BY date ASC;
    `;
    const earningsResult = await pool.query(earningsQuery, [phone_number]);

    if (earningsResult.rows.length < 2) {
      return res.json({ insights: ["Add more earnings data to unlock AI insights!"] });
    }

    const earnings = earningsResult.rows.map(r => parseFloat(r.amount));
    const insights = [];

    // Insight 1: Compare last month to the previous month
    const lastMonth = earnings[earnings.length - 1];
    const prevMonth = earnings[earnings.length - 2];
    if (lastMonth > prevMonth) {
      const percentageIncrease = Math.round(((lastMonth - prevMonth) / prevMonth) * 100);
      insights.push(`Great work! Your earnings last month were up ${percentageIncrease}% from the month before.`);
    } else {
      const percentageDecrease = Math.round(((prevMonth - lastMonth) / prevMonth) * 100);
      insights.push(`Watch out! Your earnings last month were down ${percentageDecrease}% from the month before. Consider working peak hours.`);
    }

    // Insight 2: Compare last month to the average
    const total = earnings.reduce((sum, amount) => sum + amount, 0);
    const average = total / earnings.length;
    if (lastMonth > average) {
      insights.push(`You're on a roll! Last month's income was higher than your average. Perfect time to save for a goal.`);
    } else {
      insights.push(`Last month was a bit slow compared to your average. Remember to stick to your budget.`);
    }

    // Insight 3: Volatility check
    const variance = earnings.map(x => Math.pow(x - average, 2)).reduce((a, b) => a + b) / earnings.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > average * 0.4) { // If volatility is more than 40% of average income
      insights.push(`Your income is highly volatile. Building a 3-month emergency fund should be your top priority.`);
    }

    res.json({ insights });

  } catch (err) {
    console.error('Error generating insights:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== API ENDPOINT for LOANS ========== //
app.get('/api/loans/:phone_number', async (req, res) => {
  const { phone_number } = req.params;
  try {
    // First, get the user's ID
    const userQuery = 'SELECT id FROM users WHERE phone_number = $1';
    const userResult = await pool.query(userQuery, [phone_number]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    // Then, get the data needed to calculate GigScore
    const creditDataQuery = `SELECT COUNT(*) as total_months, STDDEV(amount) as income_volatility FROM earnings WHERE user_id = $1`;
    const creditResult = await pool.query(creditDataQuery, [userId]);

    if (!creditResult.rows.length) {
        return res.status(404).json({ error: 'No earnings data to calculate score.' });
    }

    // Calculate GigScore using the same logic as the bot
    const data = creditResult.rows[0];
    let gigScore = 300; // Base score
    if (data.total_months > 0) {
      gigScore += Math.min(data.total_months * 20, 200);
      if (data.income_volatility < 10000) gigScore += 50;
      gigScore = Math.min(gigScore, 850);
    }

    // Define available loan products
    const loanProducts = [
      { name: 'GigCredit Basic', minScore: 400, amount: 'Up to ₹10,000', interest: '2% / month' },
      { name: 'GigCredit Plus', minScore: 600, amount: 'Up to ₹50,000', interest: '1.5% / month' },
      { name: 'Platform Advance', minScore: 350, amount: 'Up to 30% of avg income', interest: '0% (Platform fee may apply)' }
    ];

    // Return the score and the products with eligibility status
    res.json({
      gigScore,
      loanOptions: loanProducts.map(p => ({...p, eligible: gigScore >= p.minScore }))
    });

  } catch (err) {
    console.error('Error fetching loan options:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ========== WhatsApp Webhook (COMPLETE VERSION) ========== //
app.post('/webhook', (req, res) => {
  const incomingMsg = req.body.Body.toLowerCase();
  const userNumber = req.body.From;

  console.log(`Message from ${userNumber}: ${incomingMsg}`);
  let response = '';

  if (incomingMsg.includes('hi') || incomingMsg.includes('hello') || incomingMsg.includes('start')) {
    const checkUserQuery = 'SELECT * FROM users WHERE phone_number = $1';
    pool.query(checkUserQuery, [userNumber], (err, userResult) => {
      if (err) {
        console.error('Database error:', err);
        response = 'Sorry, I am having trouble right now.';
        res.set('Content-Type', 'text/plain');
        return res.send(response);
      }
      if (userResult.rows.length === 0) {
        const insertUserQuery = 'INSERT INTO users(phone_number) VALUES($1) RETURNING *';
        pool.query(insertUserQuery, [userNumber], (err, insertResult) => {
          if (err) {
            console.error('Error saving user:', err);
            response = 'Sorry, I am having trouble right now.';
          } else {
            console.log('New user saved:', insertResult.rows[0]);
            response = `👋 Welcome to GigCoach AI! 🍟\n\nI'm your personal financial coach for the gig economy. \n\nWhat would you like to do?\n\n1. 📊 Get Earnings Forecast\n2. 🎯 Set Financial Goals  \n3. 🆘 Emergency Loan Options\n4. 💳 Check & Build Credit Score\n5. 💡 Financial Tips\n\n*Reply with 1-5*`;
          }
          res.set('Content-Type', 'text/plain');
          res.send(response);
        });
      } else {
        response = `👋 Welcome back! 🍟\n\nWhat would you like to do today?\n\n1. 📊 Earnings Forecast\n2. 🎯 Financial Goals  \n3. 🆘 Emergency Loans\n4. 💳 Credit Score\n5. 💡 Financial Tips\n\n*Reply with 1-5*`;
        res.set('Content-Type', 'text/plain');
        res.send(response);
      }
    });
    return;
  }

  // --- Other Menu Options ---
  // (The rest of your `else if` blocks for options 1-5 go here, they are correct as they are in your file)
  else if (incomingMsg.includes('1') || incomingMsg.includes('forecast') || incomingMsg.includes('earnings')) {
    const getEarningsQuery = 'SELECT date, amount FROM earnings WHERE user_id = (SELECT id FROM users WHERE phone_number = $1) ORDER BY date';
    pool.query(getEarningsQuery, [userNumber], (err, earningsResult) => {
      if (err) {
        console.error('Database error fetching earnings:', err);
        response = 'Sorry, I am having trouble accessing your data right now.';
        res.set('Content-Type', 'text/plain');
        return res.send(response);
      }
      if (earningsResult.rows.length === 0) {
        response = "📊 I don't have any earnings data for you yet. Please add some first!\n\nTo return to the main menu, text *menu*.";
        res.set('Content-Type', 'text/plain');
        return res.send(response);
      }
      const earnings = earningsResult.rows;
      const total = earnings.reduce((sum, record) => sum + parseFloat(record.amount), 0);
      const average = Math.round(total / earnings.length);
      const highest = Math.max(...earnings.map(record => parseFloat(record.amount)));
      const lowest = Math.min(...earnings.map(record => parseFloat(record.amount)));
      const getForecastQuery = `SELECT predicted_amount FROM forecasts WHERE user_id = (SELECT id FROM users WHERE phone_number = $1) ORDER BY created_at DESC LIMIT 1;`;
      pool.query(getForecastQuery, [userNumber], (err, forecastResult) => {
          let aiMessage = "";
          if (err) {
              console.error('Error fetching forecast:', err);
              aiMessage = "\n\n(⚠️ Advanced forecast temporarily unavailable)";
          } else if (forecastResult.rows.length === 0) {
              aiMessage = "\n\n(📊 I'm still learning your patterns. A detailed forecast will be ready soon!)";
          } else {
              const prediction = forecastResult.rows[0].predicted_amount;
              aiMessage = `\n\n🔮 *AI Forecast:* ₹${prediction.toLocaleString('en-IN')}\n💡 *Smart Move:* Save ₹${Math.round(prediction * 0.25).toLocaleString('en-IN')} this month!`;
          }
          response = `📊 *YOUR EARNINGS ANALYSIS*\n\nBased on ${earningsResult.rows.length} months of data:\n\n• *Average:* ₹${average.toLocaleString('en-IN')}/month\n• *Highest:* ₹${highest.toLocaleString('en-IN')}\n• *Lowest:* ₹${lowest.toLocaleString('en-IN')}${aiMessage}\n\nReply *menu* to see all options.`;
          res.set('Content-Type', 'text/plain');
          res.send(response);
      });
    });
    return;
  }
  else if (incomingMsg.includes('2') || incomingMsg.includes('goal')) {
    response = `🎯 *FINANCIAL GOALS SETTING*\n\nWhat would you like to save for?\n\n1. 🏥 Emergency Fund\n2. 🛵 Vehicle Upgrade\n3. 📚 Skill Development\n4. 🏠 Long-term Savings\n5. 🎉 Special Occasion\n\nReply *menu* to go back.`;
    res.set('Content-Type', 'text/plain');
    res.send(response);
  }
  else if (incomingMsg.includes('3') || incomingMsg.includes('emergency') || incomingMsg.includes('loan')) {
    response = `🆘 *EMERGENCY SUPPORT*\n\nHere are your options:\n\n1. 💰 Use Existing Savings\n2. 📱 GigCredit Instant Loan\n3. ⚡ Platform Advance\n4. 🤝 Community Support\n\nFor GigCredit, you need a GigScore above 400.\n\nReply *menu* to go back.`;
    res.set('Content-Type', 'text/plain');
    res.send(response);
  }
  else if (incomingMsg.includes('4') || incomingMsg.includes('credit') || incomingMsg.includes('score')) {
    const getCreditDataQuery = `SELECT COUNT(*) as total_months, STDDEV(amount) as income_volatility FROM earnings WHERE user_id = (SELECT id FROM users WHERE phone_number = $1)`;
    pool.query(getCreditDataQuery, [userNumber], (err, creditResult) => {
      if (err || !creditResult.rows.length) {
        response = 'Sorry, I cannot calculate your credit score right now.';
        res.set('Content-Type', 'text/plain');
        return res.send(response);
      }
      const data = creditResult.rows[0];
      let gigScore = 300;
      if (data.total_months > 0) {
        gigScore += Math.min(data.total_months * 20, 200);
        if (data.income_volatility < 10000) gigScore += 50;
        gigScore = Math.min(gigScore, 850);
      }
      response = `💳 *YOUR GIGSCORE: ${gigScore}/850*\n\n*Breakdown:*\n• *History:* ${data.total_months} months\n• *Stability:* ${data.income_volatility < 10000 ? 'Good' : 'Needs Improvement'}\n\n*To improve your score:*\n• Maintain consistent earnings\n• Build longer history`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
    });
    return;
  }
  else if (incomingMsg.includes('5') || incomingMsg.includes('tip') || incomingMsg.includes('advice')) {
    response = `💡 *GIG ECONOMY TIPS*\n\n1. 💰 Save 25% of good months for lean periods.\n2. 📊 Track all earnings across platforms.\n3. 🏥 Build an emergency fund (3 months of expenses).\n4. 🛵 Maintain your vehicle - it's your primary asset.\n\nReply *menu* to go back.`;
    res.set('Content-Type', 'text/plain');
    res.send(response);
  }
  else if (incomingMsg.includes('menu') || incomingMsg.includes('back') || incomingMsg.includes('main')) {
    response = `↩️ *Main Menu*\n\n1. 📊 Earnings Forecast\n2. 🎯 Financial Goals\n3. 🆘 Emergency Loans\n4. 💳 Credit Score\n5. 💡 Financial Tips`;
    res.set('Content-Type', 'text/plain');
    res.send(response);
  }
  else {
    response = `🤔 I'm not sure what you mean. Here's what I can help with:\n\n1. 📊 Earnings Forecast\n2. 🎯 Financial Goals\n3. 🆘 Emergency Loans\n4. 💳 Credit Score\n5. 💡 Financial Tips\n\n*Reply with 1-5* or say *hi* to start over.`;
    res.set('Content-Type', 'text/plain');
    res.send(response);
  }
});


// Start the server
app.listen(port, () => {
  console.log(`GigCoach AI server listening at http://localhost:${port}`);
});