const amqp = require('amqplib');

let connection = null;
let channel = null;

/**
 * Queue names
 */
const QUEUES = {
  CONVERSION: 'bim.conversion',      // IFC to GLB conversion jobs
  CLASH_DETECTION: 'bim.clash',      // Clash detection jobs
  CLEANUP: 'bim.cleanup'             // Cleanup jobs (delete old files)
};

/**
 * Exchange names
 */
const EXCHANGES = {
  DIRECT: 'bim.direct',              // Direct routing
  TOPIC: 'bim.topic'                 // Topic-based routing
};

/**
 * Connect to RabbitMQ
 */
const connectRabbitMQ = async () => {
  try {
    const url = process.env.RABBITMQ_URL || 'amqp://admin:rabbitmq_password@localhost:5672';
    
    connection = await amqp.connect(url);
    channel = await connection.createChannel();
    
    console.log('Connected to RabbitMQ successfully');
    
    // Setup exchanges
    await channel.assertExchange(EXCHANGES.DIRECT, 'direct', { durable: true });
    await channel.assertExchange(EXCHANGES.TOPIC, 'topic', { durable: true });
    
    // Setup queues
    for (const [name, queue] of Object.entries(QUEUES)) {
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-message-ttl': 24 * 60 * 60 * 1000  // 24 hours TTL
        }
      });
      console.log(`Queue asserted: ${queue}`);
    }
    
    // Handle connection errors
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });
    
    connection.on('close', () => {
      console.log('RabbitMQ connection closed');
    });
    
    return { connection, channel };
    
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    throw error;
  }
};

/**
 * Get channel (create if not exists)
 */
const getChannel = async () => {
  if (!channel) {
    await connectRabbitMQ();
  }
  return channel;
};

/**
 * Publish conversion job to queue
 * @param {object} job - Job data
 */
const publishConversionJob = async (job) => {
  try {
    const ch = await getChannel();
    
    const message = {
      jobId: job.fileId,
      fileId: job.fileId,
      projectId: job.projectId,
      userId: job.userId,
      storagePath: job.storagePath,
      originalName: job.originalName,
      timestamp: new Date().toISOString()
    };
    
    const sent = ch.sendToQueue(
      QUEUES.CONVERSION,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now()
      }
    );
    
    if (sent) {
      console.log(`Published conversion job to queue: ${job.fileId}`);
      return true;
    } else {
      console.error('Failed to publish conversion job (queue full?)');
      return false;
    }
    
  } catch (error) {
    console.error('Error publishing conversion job:', error);
    throw error;
  }
};

/**
 * Publish clash detection job to queue
 * @param {object} job - Job data
 */
const publishClashDetectionJob = async (job) => {
  try {
    const ch = await getChannel();
    
    const message = {
      jobId: job.reportId,
      reportId: job.reportId,
      projectId: job.projectId,
      userId: job.userId,
      fileIds: job.fileIds,
      settings: job.settings || {},
      timestamp: new Date().toISOString()
    };
    
    const sent = ch.sendToQueue(
      QUEUES.CLASH_DETECTION,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now()
      }
    );
    
    if (sent) {
      console.log(`Published clash detection job to queue: ${job.reportId}`);
      return true;
    } else {
      console.error('Failed to publish clash detection job');
      return false;
    }
    
  } catch (error) {
    console.error('Error publishing clash detection job:', error);
    throw error;
  }
};

/**
 * Publish cleanup job to queue
 * @param {object} job - Job data
 */
const publishCleanupJob = async (job) => {
  try {
    const ch = await getChannel();
    
    const message = {
      jobId: `cleanup-${Date.now()}`,
      type: job.type,  // 'file', 'project', 'report'
      targetId: job.targetId,
      paths: job.paths || [],
      timestamp: new Date().toISOString()
    };
    
    const sent = ch.sendToQueue(
      QUEUES.CLEANUP,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now()
      }
    );
    
    if (sent) {
      console.log(`Published cleanup job to queue: ${job.type}/${job.targetId}`);
      return true;
    } else {
      console.error('Failed to publish cleanup job');
      return false;
    }
    
  } catch (error) {
    console.error('Error publishing cleanup job:', error);
    throw error;
  }
};

/**
 * Consume messages from queue (for workers)
 * @param {string} queueName - Queue name
 * @param {function} handler - Message handler function
 */
const consumeQueue = async (queueName, handler) => {
  try {
    const ch = await getChannel();
    
    await ch.prefetch(1); // Process one message at a time
    
    ch.consume(
      queueName,
      async (msg) => {
        if (msg !== null) {
          try {
            const content = JSON.parse(msg.content.toString());
            console.log(`Processing message from ${queueName}:`, content.jobId);
            
            // Call handler
            await handler(content);
            
            // Acknowledge message
            ch.ack(msg);
            console.log(`Message acknowledged: ${content.jobId}`);
            
          } catch (error) {
            console.error('Error processing message:', error);
            
            // Reject and requeue (with limit)
            const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) + 1;
            
            if (retryCount < 3) {
              // Requeue with retry count
              ch.nack(msg, false, true);
              console.log(`Message requeued (retry ${retryCount})`);
            } else {
              // Move to dead letter or discard
              ch.nack(msg, false, false);
              console.log('Message discarded after max retries');
            }
          }
        }
      },
      {
        noAck: false
      }
    );
    
    console.log(`Started consuming from queue: ${queueName}`);
    
  } catch (error) {
    console.error('Error consuming queue:', error);
    throw error;
  }
};

/**
 * Get queue stats (message count, consumer count)
 * @param {string} queueName - Queue name
 */
const getQueueStats = async (queueName) => {
  try {
    const ch = await getChannel();
    const stats = await ch.checkQueue(queueName);
    
    return {
      queue: queueName,
      messageCount: stats.messageCount,
      consumerCount: stats.consumerCount
    };
    
  } catch (error) {
    console.error('Error getting queue stats:', error);
    throw error;
  }
};

/**
 * Purge queue (delete all messages)
 * @param {string} queueName - Queue name
 */
const purgeQueue = async (queueName) => {
  try {
    const ch = await getChannel();
    await ch.purgeQueue(queueName);
    console.log(`Purged queue: ${queueName}`);
    return true;
    
  } catch (error) {
    console.error('Error purging queue:', error);
    throw error;
  }
};

/**
 * Close RabbitMQ connection
 */
const disconnectRabbitMQ = async () => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    
    if (connection) {
      await connection.close();
      connection = null;
    }
    
    console.log('Disconnected from RabbitMQ');
    
  } catch (error) {
    console.error('Error disconnecting from RabbitMQ:', error);
  }
};

/**
 * Health check for RabbitMQ connection
 */
const checkHealth = async () => {
  try {
    if (!channel) {
      return { status: 'unhealthy', message: 'Not connected to RabbitMQ' };
    }
    
    // Try to assert a temporary queue
    await channel.checkQueue(QUEUES.CONVERSION);
    
    return { status: 'healthy', message: 'RabbitMQ connection successful' };
    
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

module.exports = {
  QUEUES,
  EXCHANGES,
  connectRabbitMQ,
  getChannel,
  publishConversionJob,
  publishClashDetectionJob,
  publishCleanupJob,
  consumeQueue,
  getQueueStats,
  purgeQueue,
  disconnectRabbitMQ,
  checkHealth
};
