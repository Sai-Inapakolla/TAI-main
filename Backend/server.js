const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
try {
  require('dotenv').config();
} catch (_) {}
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json());
const ML_URL = 'http://127.0.0.1:5001';
const OCR_URL = 'http://127.0.0.1:5002';
const DB_FILE = path.join(__dirname, 'local_applications.json');
const BLOCKED_FILE = path.join(__dirname, 'blocked_users.json');
console.log('INFO: Running in offline mode with local JSON database.');

// ── MongoDB Connection ──────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tai_db';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.log('⚠️  MongoDB not connected (using local JSON):', err.message));

// ── Cloudinary Configuration ────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Mongoose Application Model ──────────────────────────────
const applicationMongoSchema = new mongoose.Schema({
  application_id: String,
  selected_bank: String,
  applicant: {
    name: String, aadhar_number: String, pan_number: String,
    date_of_birth: String, gender: String, address: String,
    pincode: String, father_name: String, account_number: String,
    ifsc_code: String, bank_name: String, branch: String,
    monthly_income: String, employer: String, employment_type: String,
    mobile: String, email: String, marital_status: String,
    education: String, civil_score: String, city: String, state: String
  },
  documents: {
    aadhar: { url: String, public_id: String },
    pan: { url: String, public_id: String },
    passbook: { url: String, public_id: String },
    salary_slip: { url: String, public_id: String },
    bank_statement: { url: String, public_id: String }
  },
  extracted_data: mongoose.Schema.Types.Mixed,
  status: { type: String, default: 'submitted' },
  submitted_at: { type: Date, default: Date.now },
  timestamp: { type: Date, default: Date.now }
});
const ApplicationModel = mongoose.model('Application', applicationMongoSchema);

// ── Cloudinary Upload Helper ────────────────────────────────
async function uploadToCloudinary(filePath, folder = 'tai-documents') {
  try {
    const ext = path.extname(filePath).toLowerCase();
    // PDFs must be uploaded as 'raw' to be viewable/downloadable
    const resourceType = ext === '.pdf' ? 'raw' : 'image';
    const result = await cloudinary.uploader.upload(filePath, {
      folder, resource_type: resourceType
    });
    return { url: result.secure_url, public_id: result.public_id };
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);
    return null;
  }
}
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
async function dbInsertApplication(record) {
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
  const results = [];
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

app.get('/health', (req, res) => {
  res.json({ status: 'online', type: 'node_express', ml_service: ML_URL, storage: 'local_json' });
});
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
app.use('/uploads', express.static(uploadsDir));

// ── Document Scan Endpoint (OCR + Cloudinary) ───────────────
const scanUploadFields = upload.fields([
  { name: 'aadhar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'passbook', maxCount: 1 },
  { name: 'salary_slip', maxCount: 1 },
  { name: 'bank_statement', maxCount: 1 }
]);

app.post('/scan-documents', scanUploadFields, async (req, res) => {
  try {
    const files = req.files || {};
    const cloudinaryUrls = {};
    const filePaths = {};

    // Upload to Cloudinary + collect paths for OCR
    const uploadPromises = [];
    for (const [key, fileArr] of Object.entries(files)) {
      if (fileArr && fileArr.length > 0) {
        const file = fileArr[0];
        filePaths[key] = file.path;
        uploadPromises.push(
          uploadToCloudinary(file.path, `tai-documents/${key}`).then(result => {
            if (result) cloudinaryUrls[key] = result;
          })
        );
      }
    }
    await Promise.all(uploadPromises);

    // Forward file paths to OCR service
    let extractedData = {};
    try {
      const ocrResponse = await fetch(`${OCR_URL}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filePaths })
      });
      const ocrResult = await ocrResponse.json();
      if (ocrResult.success) {
        extractedData = ocrResult.extracted_data || {};
      }
    } catch (ocrErr) {
      console.error('OCR service error:', ocrErr.message);
    }

    res.json({
      success: true,
      extracted_data: extractedData,
      cloudinary_urls: cloudinaryUrls
    });
  } catch (err) {
    console.error('Error in /scan-documents:', err);
    res.status(500).json({ error: 'Failed to scan documents: ' + String(err) });
  }
});

// ── Submit Scanned Application (MongoDB + Cloudinary URLs) ──
app.post('/submit-scanned-application', async (req, res) => {
  try {
    const { application_id, selected_bank, applicant, documents } = req.body;

    const appDoc = new ApplicationModel({
      application_id: application_id || null,
      selected_bank: selected_bank || null,
      applicant: applicant || {},
      documents: documents || {},
      status: 'submitted',
      submitted_at: new Date(),
      timestamp: new Date()
    });

    const saved = await appDoc.save();

    // Also save to local JSON for backward compatibility
    try {
      await dbInsertApplication({
        _id: saved._id.toString(),
        selected_bank,
        applicant,
        documents,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
    } catch (e) {}

    res.json({
      success: true,
      message: 'Application submitted successfully!',
      application_id: saved._id.toString()
    });
  } catch (err) {
    console.error('Error in /submit-scanned-application:', err);
    res.status(500).json({ error: 'Failed to submit application: ' + String(err) });
  }
});

// ── Legacy KYC Submit (kept for backward compatibility) ─────
const kycUploadFields = upload.fields([
  { name: 'aadhar_pdf', maxCount: 1 },
  { name: 'pan_pdf', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
  { name: 'income_proof', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 }
]);

app.post('/submit-application', kycUploadFields, async (req, res) => {
  try {
    const body = req.body;
    const files = req.files || {};
    const filePaths = {};
    for (const [key, fileArr] of Object.entries(files)) {
      if (fileArr && fileArr.length > 0) {
        filePaths[key] = fileArr[0].filename;
      }
    }

    const applicationRecord = {
      application_id: body.application_id || null,
      selected_bank: body.selected_bank || null,
      applicant: {
        name: body.name || '', aadhar_number: body.aadhar_number || '',
        pan_number: body.pan_number || '', mobile: body.mobile || '',
        email: body.email || '', date_of_birth: body.date_of_birth || '',
        gender: body.gender || '', marital_status: body.marital_status || '',
        education: body.education || '', employment_type: body.employment_type || '',
        civil_score: body.civil_score || '', monthly_income: body.monthly_income || '',
        address: body.address || '', city: body.city || '',
        state: body.state || '', pincode: body.pincode || ''
      },
      documents: filePaths,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };
    if (body.application_id) {
      const updated = await dbUpdateApplication(body.application_id, {
        selected_bank: body.selected_bank || null,
        applicant: applicationRecord.applicant,
        documents: applicationRecord.documents,
        status: 'submitted',
        submitted_at: applicationRecord.submitted_at
      });
      if (updated) {
        return res.json({ success: true, message: 'Application submitted successfully!', application_id: body.application_id });
      }
    }
    const appId = await dbInsertApplication(applicationRecord);
    res.json({ success: true, message: 'Application submitted successfully!', application_id: appId });
  } catch (err) {
    console.error('Error in /submit-application:', err);
    res.status(500).json({ error: 'Failed to submit application: ' + String(err) });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Node.js/Express API Server running on http://localhost:${PORT}`);
});
