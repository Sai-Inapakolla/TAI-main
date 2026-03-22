const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// The port where our Python ML Microservice runs
const ML_URL = 'http://127.0.0.1:5001';
const DB_FILE = path.join(__dirname, 'local_applications.json');
const BLOCKED_FILE = path.join(__dirname, 'blocked_users.json');

let db;
async function connectToMongo() {
  const variations = [
    { u: 'admin', p: 'admin123' },                  // The fresh user you just created
    { u: 'TAI_DB_OWNER', p: 'Inapakolla@1' },       // Clean Version
    { u: '<TAI_DB_OWNER>', p: '<Inapakolla@1>' },   // Literal Brackets Version
    { u: 'TAI_DB_OWNER', p: '<Inapakolla@1>' },     // Brackets on Password only
    { u: '<TAI_DB_OWNER>', p: 'Inapakolla@1' }      // Brackets on Username only
  ];

  for (const cred of variations) {
    try {
      const client = await MongoClient.connect('mongodb+srv://tai.hb7jy19.mongodb.net/', {
        auth: { username: cred.u, password: cred.p }
      });
      db = client.db('loan_db');
      console.log(`SUCCESS: Connected to Cloud MongoDB using user: ${cred.u}`);
      return;
    } catch (err) {
      if (String(err).includes('bad auth') || String(err).includes('Authentication failed')) {
        continue; // Try the next variation
      } else {
        console.warn("WARNING: Network Error: ", err.message);
        return;
      }
    }
  }
  console.warn("WARNING: ALL authentication variations failed. Falling back to 'local_applications.json' - Please verify credentials in Atlas UI.");
}
connectToMongo();

// JSON fallback functions
function readLocalDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveLocalDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 4));
  } catch (err) {
    console.error(`Error saving local DB: ${err}`);
  }
}

// Database Helpers
async function dbInsertApplication(record) {
  if (db) {
    try {
      const result = await db.collection('loan_applications').insertOne(record);
      return result.insertedId.toString();
    } catch (err) {}
  }
  console.log("Using local JSON DB for insert.");
  const apps = readLocalDb();
  if (!record._id) record._id = crypto.randomUUID();
  if (record.timestamp && typeof record.timestamp !== 'string') {
     record.timestamp = new Date(record.timestamp).toISOString();
  }
  apps.push(record);
  saveLocalDb(apps);
  return record._id;
}

async function dbUpdateApplication(appId, updateFields) {
  if (db) {
    try {
      const oid = new ObjectId(appId);
      const result = await db.collection('loan_applications').updateOne(
        { _id: oid },
        { $set: updateFields }
      );
      if (result.modifiedCount > 0) return true;
    } catch (err) {}
  }
  
  const apps = readLocalDb();
  let updated = false;
  for (let app of apps) {
    if (String(app._id) === String(appId)) {
      for (const [key, val] of Object.entries(updateFields)) {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          if (!app[parent]) app[parent] = {};
          app[parent][child] = val;
        } else {
          app[key] = val;
        }
      }
      updated = true;
      break;
    }
  }
  if (updated) saveLocalDb(apps);
  return updated;
}

async function dbGetApplications(queryBank = null) {
  let results = [];
  if (db) {
    try {
      const query = queryBank ? { selected_bank: { $regex: new RegExp('^' + queryBank + '$', 'i') } } : {};
      const apps = await db.collection('loan_applications')
        .find(query)
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray();
      results.push(...apps.map(a => ({ ...a, _id: a._id.toString() })));
    } catch (err) {}
  }
  
  const localApps = readLocalDb();
  for (let app of localApps) {
    if (queryBank) {
      if (app.selected_bank && String(app.selected_bank).toLowerCase().includes(queryBank.toLowerCase())) {
        results.push(app);
      }
    } else {
      results.push(app);
    }
  }
  
  const seen = new Set();
  const uniqueResults = [];
  for (const r of results) {
    const rid = String(r._id);
    if (!seen.has(rid)) {
      seen.add(rid);
      uniqueResults.push(r);
    }
  }
  
  uniqueResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return uniqueResults;
}

async function dbGetApplication(appId) {
  if (db) {
    try {
      const oid = new ObjectId(appId);
      const app = await db.collection('loan_applications').findOne({ _id: oid });
      if (app) return { ...app, _id: app._id.toString() };
    } catch(err) {}
  }
  
  const apps = readLocalDb();
  return apps.find(a => String(a._id) === String(appId)) || null;
}

function getBlockedUsers() {
  try {
    if (fs.existsSync(BLOCKED_FILE)) {
      return JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
    }
  } catch(err) {}
  return [];
}

function saveBlockedUser(userKey) {
  const blocked = getBlockedUsers();
  if (!blocked.includes(userKey)) {
    blocked.push(userKey);
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blocked));
  }
}

function removeBlockedUser(userKey) {
  let blocked = getBlockedUsers();
  if (blocked.includes(userKey)) {
    blocked = blocked.filter(u => u !== userKey);
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blocked));
  }
}

// ----------------------------------------
// Express API Routes
// ----------------------------------------

app.get('/health', (req, res) => {
  res.json({ status: 'online', type: 'node_express', ml_service: ML_URL });
});

// Admin Routes
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin123") {
    return res.json({ token: 'admin-demo-token-123', message: 'Login successful' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/admin/stats', async (req, res) => {
  const apps = await dbGetApplications();
  const blocked_users = getBlockedUsers();
  
  const approved = apps.filter(a => String(a.status).toLowerCase() === 'approved').length;
  const rejected = apps.filter(a => String(a.status).toLowerCase() === 'rejected').length;
  const fraud = apps.filter(a => String(a.status).toLowerCase() === 'fraud' || a.fraud_flag === true).length;
  
  let active_officers = 0;
  const officer_dir = path.join(__dirname, 'Models', 'officer models');
  if (fs.existsSync(officer_dir)) {
    active_officers = fs.readdirSync(officer_dir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .length;
  }
  
  res.json({
    total_applications: apps.length,
    approved_loans: approved,
    rejected_loans: rejected,
    fraud_reports: fraud,
    active_officers,
    blocked_users: blocked_users.length
  });
});

app.get('/admin/bank-stats', async (req, res) => {
  const apps = await dbGetApplications();
  const stats = {};
  
  for (let app of apps) {
    const bank = app.selected_bank || 'Unknown';
    if (!stats[bank]) stats[bank] = { applications: 0, approved: 0, rejected: 0, fraud: 0 };
    stats[bank].applications++;
    
    const status = String(app.status).toLowerCase();
    if (status === 'approved') stats[bank].approved++;
    else if (status === 'rejected') stats[bank].rejected++;
    else if (status === 'fraud' || app.fraud_flag) stats[bank].fraud++;
  }
  res.json(stats);
});

app.get('/admin/officer-stats', (req, res) => {
  const officers = [];
  const officer_dir = path.join(__dirname, 'Models', 'officer models');
  if (fs.existsSync(officer_dir)) {
    for (let name of fs.readdirSync(officer_dir)) {
      if (fs.statSync(path.join(officer_dir, name)).isDirectory()) {
        officers.push({ name, bank: 'Assigned Bank', processed: 0, approved: 0, rejected: 0, fraud: 0 });
      }
    }
  }
  res.json(officers);
});

app.get('/admin/fraud-cases', async (req, res) => {
  const apps = await dbGetApplications();
  const frauds = apps.filter(a => String(a.status).toLowerCase() === 'fraud' || a.fraud_flag === true);
  res.json(frauds);
});

app.get('/admin/users', async (req, res) => {
  const apps = await dbGetApplications();
  const users_map = {};
  const blocked = new Set(getBlockedUsers()); 
  
  for (let app of apps) {
    const name = app.input?.Name || 'Unknown';
    const mobile = app.input?.Mobile || 'Unknown';
    const key = `${name}|${mobile}`;
    
    if (!users_map[key]) {
      users_map[key] = {
        name, mobile, applications: 0, last_status: null, is_blocked: blocked.has(key)
      };
    }
    users_map[key].applications++;
    users_map[key].last_status = app.status;
  }
  res.json(Object.values(users_map));
});

app.post('/admin/block-user', (req, res) => {
  const { user_key, action } = req.body;
  if (action === 'block') saveBlockedUser(user_key);
  else if (action === 'unblock') removeBlockedUser(user_key);
  res.json({ success: true });
});


// Core Routes (Frontend API)
app.get('/applications', async (req, res) => {
  try {
    const bank = req.query.bank;
    const results = await dbGetApplications(bank);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/application/:id', async (req, res) => {
  try {
    const app_details = await dbGetApplication(req.params.id);
    if (app_details) res.json(app_details);
    else res.status(404).json({ error: 'Application not found' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/apply', async (req, res) => {
  try {
    const { application_id, bank_name, applicant_name, applicant_mobile } = req.body;
    if (!application_id || !bank_name) return res.status(400).json({ error: 'Missing application_id or bank_name' });
    
    const update_fields = {
      selected_bank: bank_name,
      status: 'applied',
      applied_at: new Date().toISOString()
    };
    if (applicant_name) update_fields['input.Name'] = applicant_name;
    if (applicant_mobile) update_fields['input.Mobile'] = applicant_mobile;
    
    const success = await dbUpdateApplication(application_id, update_fields);
    if (success) {
      res.json({ success: true, message: `Application submitted for ${bank_name}` });
    } else {
      res.status(404).json({ success: false, message: 'Application not found or update failed' });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/update_status', async (req, res) => {
  try {
    const { application_id, status } = req.body;
    if (!application_id || !status) return res.status(400).json({ error: 'Missing application_id or status' });
    
    const success = await dbUpdateApplication(application_id, { status: status, updated_at: new Date().toISOString() });
    if (success) {
      res.json({ success: true, message: `Application ${status}` });
    } else {
      res.status(404).json({ success: false, message: 'Application not found' });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Proxy ML Routes via Node.js native fetch (v18+)
app.post('/predict', async (req, res) => {
  try {
    console.log("Relaying prediction request to ML microservice...");
    const mlResponse = await fetch(`${ML_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const result = await mlResponse.json();
    
    if (!mlResponse.ok) return res.status(mlResponse.status).json(result);
    
    try {
      const record = {
        input: req.body,
        prediction: result,
        status: 'predicted',
        selected_bank: null,
        timestamp: new Date().toISOString()
      };
      const appId = await dbInsertApplication(record);
      result.application_id = appId;
    } catch (err) {
      console.log('DB Error (Prediction not saved):', err);
      result.application_id = null;
    }
    
    res.json(result);
  } catch (err) {
    console.error("Error calling ML service:", err.message);
    res.status(500).json({ error: 'ML service is unreachable. Did you start Python ml_service.py on port 5001?' });
  }
});

app.post('/officer_predict', async (req, res) => {
  try {
    const mlResponse = await fetch(`${ML_URL}/officer_predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const result = await mlResponse.json();
    if (!mlResponse.ok) return res.status(mlResponse.status).json(result);
    res.json(result);
  } catch (err) {
    console.error("Error calling ML service:", err.message);
    res.status(500).json({ error: 'ML service is unreachable.' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Node.js/Express API Server running on http://localhost:${PORT}`);
});
