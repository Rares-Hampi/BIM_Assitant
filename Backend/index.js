const express = require('express');
const multer = require('multer');
const { Queue } = require('bullmq');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verificare și creare director uploads
const uploadsDir = path.resolve('./uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Director uploads creat');
}

// Configurare Redis
const redisConnection = { 
  host: process.env.REDIS_HOST || 'localhost', 
  port: process.env.REDIS_PORT || 6379 
};

// Definirea cozii
const conversionQueue = new Queue('ifc-conversion', { 
  connection: redisConnection 
});

// Configurare Multer cu validare
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    // Sanitize filename
    const safeName = basename.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.ifc') {
      return cb(new Error('Doar fișiere .ifc sunt permise!'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 1
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Endpoint pentru upload
app.post('/upload-ifc', upload.single('ifcfile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Niciun fișier încărcat.' });
  }

  console.log(`Fișier primit: ${req.file.filename} (${req.file.size} bytes)`);

  const inputFilename = req.file.filename;
  const outputFilename = inputFilename.replace(/\.ifc$/i, '.glb');
  
  const inputPath = path.join(uploadsDir, inputFilename);
  const outputPath = path.join(uploadsDir, outputFilename);

  try {
    // Validare suplimentară - verificăm dacă fișierul există și nu e gol
    const stats = fs.statSync(inputPath);
    if (stats.size === 0) {
      fs.unlinkSync(inputPath); // Ștergem fișierul gol
      return res.status(400).json({ error: 'Fișierul încărcat este gol' });
    }

    // Adăugare job în coadă
    const job = await conversionQueue.add('convert-ifc', {
      input: inputPath,
      output: outputPath,
      originalFilename: req.file.originalname,
      uploadedAt: new Date().toISOString()
    }, {
      attempts: 3, // Retry de 3 ori
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100, // Păstrează ultimele 100 job-uri complete
      removeOnFail: 50 // Păstrează ultimele 50 job-uri eșuate
    });

    console.log(`Job adăugat cu ID: ${job.id}`);
    
    res.status(202).json({ 
      message: 'Fișier primit, procesarea a început.',
      jobId: job.id,
      inputFilename: inputFilename,
      outputFilename: outputFilename,
      statusUrl: `/job-status/${job.id}`,
      downloadUrl: `/download/${outputFilename}`
    });

  } catch (error) {
    console.error('Eroare la adăugarea job-ului:', error);
    
    // Curățăm fișierul încărcat dacă job-ul nu a putut fi creat
    try {
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    } catch (cleanupError) {
      console.error('Eroare la curățare:', cleanupError);
    }
    
    res.status(500).json({ 
      error: 'Eroare server la pornirea procesării.',
      details: error.message 
    });
  }
});

// Endpoint pentru verificarea statusului job-ului
app.get('/job-status/:jobId', async (req, res) => {
  try {
    const job = await conversionQueue.getJob(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job-ul nu a fost găsit' });
    }

    const state = await job.getState();
    const progress = job.progress || 0;
    const failedReason = job.failedReason;
    
    const response = {
      jobId: job.id,
      state: state,
      progress: progress,
      data: job.data,
      createdAt: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    };

    if (state === 'completed' && job.returnvalue) {
      response.result = job.returnvalue;
      response.downloadUrl = `/download/${path.basename(job.data.output)}`;
    }

    if (state === 'failed') {
      response.error = failedReason;
    }

    res.json(response);
  } catch (error) {
    console.error('Eroare la verificarea job-ului:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint pentru descărcarea fișierului
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // Security: previne path traversal
  const filepath = path.join(uploadsDir, filename);
  
  // Verificăm dacă fișierul există
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Fișierul nu a fost găsit' });
  }

  // Verificăm extensia (doar .glb sau .ifc)
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.glb' && ext !== '.ifc') {
    return res.status(403).json({ error: 'Tip de fișier nepermis' });
  }

  console.log(`Descărcare fișier: ${filename}`);
  res.download(filepath, filename, (err) => {
    if (err) {
      console.error('Eroare la descărcare:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Eroare la descărcarea fișierului' });
      }
    }
  });
});

// Endpoint pentru listarea job-urilor (util pentru debugging)
app.get('/jobs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const [waiting, active, completed, failed] = await Promise.all([
      conversionQueue.getWaiting(0, limit),
      conversionQueue.getActive(0, limit),
      conversionQueue.getCompleted(0, limit),
      conversionQueue.getFailed(0, limit)
    ]);

    res.json({
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      jobs: {
        waiting: waiting.map(j => ({ id: j.id, data: j.data })),
        active: active.map(j => ({ id: j.id, data: j.data })),
        completed: completed.map(j => ({ id: j.id, data: j.data, result: j.returnvalue })),
        failed: failed.map(j => ({ id: j.id, data: j.data, error: j.failedReason }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler pentru Multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'Fișierul este prea mare',
        maxSize: '100MB' 
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Prea multe fișiere' });
    }
    return res.status(400).json({ error: error.message });
  }
  
  if (error) {
    console.error('Error middleware:', error);
    return res.status(400).json({ error: error.message });
  }
  
  next();
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint nu a fost găsit' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await conversionQueue.close();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`✓ API Server pornit pe http://localhost:${port}`);
  console.log(`✓ Redis conectat la ${redisConnection.host}:${redisConnection.port}`);
  console.log(`✓ Upload directory: ${uploadsDir}`);
});

module.exports = app; // Pentru testing