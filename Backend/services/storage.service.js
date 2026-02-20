const { Client } = require('minio');

let minioClient = null;

/**
 * Get or create MinIO client singleton
 */
const getMinioClient = () => {
  if (!minioClient) {
    minioClient = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
    });
    
    console.log(`MinIO client configured for ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
  }
  
  return minioClient;
};

/**
 * Bucket names
 */
const BUCKETS = {
  CONVERTED: 'bim-converted-models', // Converted GLB/JSON files
  THUMBNAILS: 'bim-thumbnails',      // Preview thumbnails
  REPORTS: 'bim-reports'             // Clash detection reports
};

/**
 * Initialize all required buckets
 */
const initializeBuckets = async () => {
  const client = getMinioClient();
  
  try {
    for (const [name, bucket] of Object.entries(BUCKETS)) {
      const exists = await client.bucketExists(bucket);
      
      if (!exists) {
        await client.makeBucket(bucket, 'us-east-1');
        console.log(`Created MinIO bucket: ${bucket}`);
        
        // Set public read policy for converted files and thumbnails
        if (bucket === BUCKETS.CONVERTED || bucket === BUCKETS.THUMBNAILS) {
          const policy = {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`]
              }
            ]
          };
          
          await client.setBucketPolicy(bucket, JSON.stringify(policy));
          console.log(`Set public read policy for bucket: ${bucket}`);
        }
      } else {
        console.log(`MinIO bucket already exists: ${bucket}`);
      }
    }
    
    console.log('All MinIO buckets initialized successfully');
    return true;
    
  } catch (error) {
    console.error('Error initializing MinIO buckets:', error);
    throw error;
  }
};

/**
 * Upload file to MinIO
 * @param {string} bucketName - Bucket name
 * @param {string} objectName - Object name (path in bucket)
 * @param {Buffer} buffer - File buffer
 * @param {object} metadata - Optional metadata
 */
const uploadFile = async (bucketName, objectName, buffer, metadata = {}) => {
  const client = getMinioClient();
  
  try {
    await client.putObject(bucketName, objectName, buffer, buffer.length, metadata);
    
    console.log(`Uploaded file to MinIO: ${bucketName}/${objectName} (${buffer.length} bytes)`);
    
    return {
      bucket: bucketName,
      objectName,
      size: buffer.length,
      url: `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${bucketName}/${objectName}`
    };
    
  } catch (error) {
    console.error('Error uploading file to MinIO:', error);
    throw error;
  }
};

/**
 * Download file from MinIO
 * @param {string} bucketName - Bucket name
 * @param {string} objectName - Object name
 */
const downloadFile = async (bucketName, objectName) => {
  const client = getMinioClient();
  
  try {
    const dataStream = await client.getObject(bucketName, objectName);
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      
      dataStream.on('data', (chunk) => chunks.push(chunk));
      dataStream.on('end', () => resolve(Buffer.concat(chunks)));
      dataStream.on('error', reject);
    });
    
  } catch (error) {
    console.error('Error downloading file from MinIO:', error);
    throw error;
  }
};

/**
 * Get presigned URL for file download (expires in 7 days)
 * @param {string} bucketName - Bucket name
 * @param {string} objectName - Object name
 * @param {number} expiry - Expiry time in seconds (default 7 days)
 */
const getPresignedUrl = async (bucketName, objectName, expiry = 7 * 24 * 60 * 60) => {
  const client = getMinioClient();
  
  try {
    const url = await client.presignedGetObject(bucketName, objectName, expiry);
    return url;
    
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
};

/**
 * Delete file from MinIO
 * @param {string} bucketName - Bucket name
 * @param {string} objectName - Object name
 */
const deleteFile = async (bucketName, objectName) => {
  const client = getMinioClient();
  
  try {
    await client.removeObject(bucketName, objectName);
    console.log(`Deleted file from MinIO: ${bucketName}/${objectName}`);
    return true;
    
  } catch (error) {
    console.error('Error deleting file from MinIO:', error);
    throw error;
  }
};

/**
 * Delete multiple files from MinIO
 * @param {string} bucketName - Bucket name
 * @param {string[]} objectNames - Array of object names
 */
const deleteFiles = async (bucketName, objectNames) => {
  const client = getMinioClient();
  
  try {
    await client.removeObjects(bucketName, objectNames);
    console.log(`Deleted ${objectNames.length} files from MinIO bucket: ${bucketName}`);
    return true;
    
  } catch (error) {
    console.error('Error deleting multiple files from MinIO:', error);
    throw error;
  }
};

/**
 * Check if file exists in MinIO
 * @param {string} bucketName - Bucket name
 * @param {string} objectName - Object name
 */
const fileExists = async (bucketName, objectName) => {
  const client = getMinioClient();
  
  try {
    await client.statObject(bucketName, objectName);
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Get file info (metadata)
 * @param {string} bucketName - Bucket name
 * @param {string} objectName - Object name
 */
const getFileInfo = async (bucketName, objectName) => {
  const client = getMinioClient();
  
  try {
    const stat = await client.statObject(bucketName, objectName);
    return {
      size: stat.size,
      etag: stat.etag,
      lastModified: stat.lastModified,
      metadata: stat.metaData
    };
    
  } catch (error) {
    console.error('Error getting file info from MinIO:', error);
    throw error;
  }
};

/**
 * List files in bucket with prefix
 * @param {string} bucketName - Bucket name
 * @param {string} prefix - Prefix filter
 */
const listFiles = async (bucketName, prefix = '') => {
  const client = getMinioClient();
  
  try {
    const objectsStream = client.listObjects(bucketName, prefix, true);
    const objects = [];
    
    return new Promise((resolve, reject) => {
      objectsStream.on('data', (obj) => objects.push(obj));
      objectsStream.on('end', () => resolve(objects));
      objectsStream.on('error', reject);
    });
    
  } catch (error) {
    console.error('Error listing files from MinIO:', error);
    throw error;
  }
};

/**
 * Health check for MinIO connection
 */
const checkHealth = async () => {
  const client = getMinioClient();
  
  try {
    await client.listBuckets();
    return { status: 'healthy', message: 'MinIO connection successful' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

module.exports = {
  getMinioClient,
  BUCKETS,
  initializeBuckets,
  uploadFile,
  downloadFile,
  getPresignedUrl,
  deleteFile,
  deleteFiles,
  fileExists,
  getFileInfo,
  listFiles,
  checkHealth
};
