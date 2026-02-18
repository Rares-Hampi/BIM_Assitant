# BIM Assistant

A comprehensive Building Information Modeling (BIM) analysis platform with 3D visualization, clash detection, and project management capabilities.

##  Features

- **3D Model Viewer** - Interactive visualization of IFC models with Three.js
- **Visual Controls** - Toggle visibility of different building systems (structural, electrical, sanitary, etc.)
- **Clash Detection** - Identify conflicts between different building systems
- **Project Management** - Organize and manage multiple BIM projects
- **Object Storage** - Store and retrieve large IFC files using MinIO
- **Real-time Updates** - Server-Sent Events (SSE) for conversion progress tracking
- **Asynchronous Processing** - RabbitMQ-powered job queue with parallel Python workers

##  Quick Start with Docker

The easiest way to run the entire application with all services:

```bash
# Make the manager script executable (first time only)
chmod +x docker-manager.sh

# Start all services
./docker-manager.sh start

# Or manually with docker-compose
docker-compose up -d
```

Access the application at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **MinIO Console**: http://localhost:9001
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)

For detailed Docker instructions, see [README_DOCKER.md](README_DOCKER.md)

##  Services

- **Frontend** - React + TypeScript + Vite + Three.js
- **Backend** - Node.js API server with SSE support
- **PostgreSQL** - Database for project data
- **RabbitMQ** - Message queue for asynchronous IFC processing
- **Python Workers** - IfcOpenShell-based conversion workers (3 parallel instances)
- **MinIO** - S3-compatible object storage for IFC files

##  Development Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Python 3.9+ (for IFC processing)

### Local Development

#### Backend
```bash
cd Backend
npm install
npm run dev
```

#### Frontend
```bash
cd Web
npm install
npm run dev
```

#### Infrastructure Only
```bash
# Start only database, message queue, and storage
docker-compose up -d postgres rabbitmq minio
```

##  Project Structure

```
BIM_Assitant/
├── Backend/              # Node.js API server
│   ├── index.js         # Main server file
│   ├── uploads/         # Uploaded IFC files
│   └── output_web/      # Processed models
├── Web/                 # React frontend
│   ├── src/
│   │   ├── Components/  # React components
│   │   └── assets/      # Static assets
│   └── public/          # Public files
├── docker-compose.yml   # Docker services configuration
├── docker-manager.sh    # Helper script for Docker operations
└── README_DOCKER.md     # Detailed Docker documentation
```

##  Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Three.js (3D rendering)
- OrbitControls (camera navigation)

### Backend
- Node.js
- Express.js
- IfcOpenShell (IFC processing)
- Python integration

### Infrastructure
- PostgreSQL 15
- RabbitMQ 3 (Message Queue)
- MinIO (S3-compatible storage)
- Docker & Docker Compose


##  Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key environment variables:
- `DB_HOST`, `DB_PORT`, `DB_NAME` - Database configuration
- `RABBITMQ_URL` - RabbitMQ connection string
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` - MinIO configuration
- `PORT` - Backend server port


##  License

This project is licensed under the MIT License - see the LICENSE file for details.

##  Authors

- Rares-Hampi

##  Acknowledgments

- Three.js for 3D rendering
- IfcOpenShell for IFC processing
- React community for amazing tools
