### **2. Backend Repository (`gigcoach-ai`)**

```markdown
# GigCoach AI - Backend Server & API

This repository contains the Node.js backend server, API, and WhatsApp bot integration for the GigCoach AI platform.

---

### ✨ Features

* RESTful API for managing users, earnings, expenses, goals, and loans.
* Secure authentication using JWT and OTPs.
* PostgreSQL database integration.
* Twilio integration for the WhatsApp chatbot and OTP delivery.
* Rule-based "AI" engine for generating financial insights and tax estimations.

---

### 💻 Tech Stack

* **Framework:** Node.js, Express.js
* **Database:** PostgreSQL
* **Authentication:** JSON Web Tokens (JWT)
* **WhatsApp:** Twilio API
* **Forecasting:** Python, Prophet (via a separate script)

---

### API Endpoints

A summary of the main API routes:

* `POST /api/auth/login` - Request an OTP for a phone number.
* `POST /api/auth/verify` - Verify OTP and receive a JWT.
* `GET /api/dashboard-stats/:phone_number` - Get all key stats for the main dashboard.
* `GET, POST /api/earnings` - Manage user earnings.
* `GET, POST, PUT, DELETE /api/goals` - Full CRUD for financial goals.
* `GET, POST /api/expenses` - Manage user expenses.
* `GET /api/loans/:phone_number` - Calculate GigScore and get loan eligibility.
* `GET /api/tax-estimate/:phone_number` - Get a simplified tax estimation.
* `POST /webhook` - Endpoint for the Twilio WhatsApp bot.

---

### Local Setup

1.  Clone the repository.
2.  Set up a local PostgreSQL database.
3.  Run `npm install`.
4.  Create a `.env` fil
