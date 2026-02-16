const { Worker } = require('bullmq');
const { execa } = require('execa'); // O bibliotecă modernă pentru a rula comenzi shell
const path = require('path');

const redisConnection = { host: 'localhost', port: 6379 };

console.log("Worker-ul pornește, se conectează la Redis...");

// 1. Ne atașăm la coada 'ifc-conversion'
const worker = new Worker('ifc-conversion', async (job) => {
  const { input, output } = job.data;
  console.log(`[Job ${job.id}] Început procesare pentru: ${input}`);

  // Numele imaginii Docker pe care am construit-o
  const DOCKER_IMAGE = 'bim-blender'; 
  
  // Calea către scriptul din interiorul containerului
  const SCRIPT_PATH_IN_CONTAINER = '/app/convert_script.py';

  // Mapăm volumele: folderul 'uploads' de pe host va fi '/data' în container
  const hostUploadsDir = path.resolve('./uploads');
  const containerDataDir = '/data';

  // Calculăm căile relative PENTRU interiorul containerului
  const inputInContainer = path.join(containerDataDir, path.basename(input));
  const outputInContainer = path.join(containerDataDir, path.basename(output));

  try {
    // 2. Construirea comenzii Docker
    const dockerCommand = 'docker';
    // Run the container using system Python to avoid Blender's embedded Python
    // compatibility issues with compiled ifcopenshell extensions. We override
    // the entrypoint to `python3` and call the system conversion script.
    const dockerArgs = [
      'run',
      '--rm', // remove container after run
      '-v', `${hostUploadsDir}:${containerDataDir}`,
      '--entrypoint', 'python3',
      DOCKER_IMAGE,
      '/app/system_convert.py',
      inputInContainer,
      outputInContainer
    ];

    console.log(`[Job ${job.id}] Rulare comandă: ${dockerCommand} ${dockerArgs.join(' ')}`);

    // 3. Executarea comenzii și așteptarea
    const { stdout, stderr } = await execa(dockerCommand, dockerArgs);

    console.log(`[Job ${job.id}] STDOUT Blender: \n${stdout}`);
    if (stderr) {
      console.warn(`[Job ${job.id}] STDERR Blender: \n${stderr}`);
    }

    console.log(`[Job ${job.id}] Procesare finalizată. Fișier salvat la: ${output}`);
    return { resultPath: output }; // Returnează succes

  } catch (error) {
    // 4. Gestionarea erorilor
    console.error(`[Job ${job.id}] EROARE la procesare:`, error.stderr || error.message);
    throw new Error(`Conversia a eșuat: ${error.stderr || error.message}`);
  }
}, { connection: redisConnection, concurrency: 2 }); // Rulează max 2 job-uri în paralel

worker.on('completed', (job) => {
  console.log(`[Job ${job.id}] a fost completat cu succes.`);
});

worker.on('failed', (job, err) => {
  console.log(`[Job ${job.id}] a eșuat cu eroarea: ${err.message}`);
});